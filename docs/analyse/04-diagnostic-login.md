# 04 — Diagnostic : connexion Microsoft « en boucle » — RÉSOLU

> Symptôme : clic sur « Se connecter avec Microsoft » → la page « se rafraîchit » et reste bloquée
> sur l'écran de login, à l'infini. **Cause trouvée et prouvée le 2026-06-19.**

## Cause racine (prouvée)

Ce **n'est pas Entra ID**. C'est un comportement de **Cloudflare Static Assets** : avec
`not_found_handling: "single-page-application"`, **les requêtes de navigation du navigateur** vers
`/auth/login` (et `/auth/callback`) sont servies par la couche *assets* (qui renvoie `index.html`)
**avant** que le Worker ne s'exécute. Le `302` vers Microsoft n'est donc jamais émis.

### Preuve

| Requête `/auth/login` | En-têtes | Réponse |
|---|---|---|
| curl | `Accept: */*` | `302` → `login.microsoftonline.com` ✅ (le Worker s'exécute) |
| navigateur | `Accept: text/html`, `Sec-Fetch-Mode: navigate` | `200 text/html`, `CF-Cache-Status: HIT` ❌ (la SPA est servie, Worker non appelé) |

Et dans `wrangler tail` au moment des clics : uniquement des `GET /api/me` (requêtes `fetch`, qui
elles atteignent le Worker), **aucun** `GET /auth/login` ni `/auth/callback` → le Worker n'était
jamais invoqué pour ces navigations.

### La boucle, expliquée

```
clic → navigateur GET /auth/login (navigation)
     → Cloudflare sert index.html (PAS le 302)         ← le bug
     → React démarre, appelle /api/me → 401
     → affiche <Login/> → re-clic → … à l'infini
```

## Correctif appliqué

Dans `wrangler.jsonc`, forcer le Worker à passer **avant** les assets pour les routes serveur :

```jsonc
"assets": {
  "directory": "./web/dist",
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/auth/*", "/api/*", "/healthz"]
}
```

Les routes client de la SPA (`/`, `/requests/:id`, `/admin`) ne sont **pas** listées → elles
restent servies par les assets avec le fallback SPA. Aucun effet de bord.

## Déploiement du correctif

```bash
npm install
npm --prefix web install
npm --prefix web run build      # génère web/dist (référencé par wrangler)
npx wrangler deploy             # applique la nouvelle config + assets
```

## Vérification (doit passer du HTML au 302)

```bash
curl -sS -D - -o /dev/null --max-redirs 0 \
  -H 'Accept: text/html' -H 'Sec-Fetch-Mode: navigate' \
  https://git-vm-oracle.satom-openstack.workers.dev/auth/login | grep -iE 'HTTP/|location'
# Attendu : HTTP/1.1 302 + Location: https://login.microsoftonline.com/...
```

Puis tester le login dans le navigateur. Garder `npx wrangler tail` ouvert : on doit maintenant
voir `GET /auth/login` puis `GET /auth/callback`.

## Si une erreur apparaît APRÈS le correctif (callback visible)

Une fois le Worker atteint, un éventuel échec du callback deviendra explicite (texte d'erreur).
Causes possibles alors, par ordre :
- **URI de redirection** `…/auth/callback` non enregistrée en plateforme **Web** dans Entra.
- **`ENTRA_CLIENT_SECRET`** absent/expiré (`npx wrangler secret put ENTRA_CLIENT_SECRET`).
- **Domaine email** du compte hors de `ALLOWED_EMAIL_DOMAINS` (`satom.ch`, `git.swiss`).

> Amélioration UX recommandée (optionnelle) : dans `/auth/callback`, rediriger les erreurs vers
> `/?login_error=…` et les afficher sur la page Login, plutôt qu'une page de texte brut.
