# 01 — État des lieux

> Photographie du projet au **2026-06-19** (J-7 de la démo). Basé sur lecture du code déployé
> et test en direct des endpoints.

## Ce qui fonctionne et est déployé

Le worker est **en ligne et sain**. Test direct des endpoints de prod :

| Endpoint | Réponse observée | Verdict |
|---|---|---|
| `GET /auth/login` | `302` → `login.microsoftonline.com` + cookie `oidc` posé, `redirect_uri=…/auth/callback` correct | ✅ |
| `GET /healthz` | `200 {"ok":true}` | ✅ |
| `GET /api/me` (sans session) | `401 {"error":"unauthorized"}` | ✅ |

### Fonctionnalités réellement implémentées

- **SSO Entra ID** (OIDC authorization-code, in-Worker, validation `aud`/`tid`/`nonce`/`exp`, filtrage par domaine email). Code propre.
- **Catalogue** composé : performance (`eco/std/perf/pro`) × stockage (`20/50/100/250 Go`) × OS (Ubuntu 24.04 / 22.04 / Debian 12), avec **estimation de coût** mensuel.
- **Workflow de validation** : `pending → approve/reject`, avec **notification email dans les deux cas** (EmailJS).
- **Provisioning OCI automatique** à l'approbation : clé SSH RSA unique, instance avec IP publique, tags `managed-by=git-vm-portal`.
- **Clé SSH chiffrée AES-GCM** au repos, téléchargeable uniquement par le propriétaire/admin.
- **Cycle de vie partiel** : terminate / start / stop / reboot manuels ; état live (state + IP + uptime).
- **Réconciliateur cron** (`*/2 min`) : promotion `provisioning→active`, détection de drift, **retry** des échecs (max 3).
- **Garde-fou coûts** : cron `19:00 UTC` qui **stoppe** les VM running.
- **Admin** : file des demandes, stats par statut, métriques, gestion des rôles, **export CSV**.
- **Commentaires** sur les demandes (propriétaire + admins).
- **Audit log** complet.
- **UX** : thème clair/sombre, i18n FR/EN.

## Points forts à valoriser en revue d'archi

1. **Architecture serverless cohérente** : un seul worker fait API + cron + service statique. Zéro serveur à administrer, coût quasi nul au repos.
2. **Pattern réconciliateur** : état désiré en DB, réel rattrapé par cron idempotente → robuste, tolérant aux pannes, anti-VM-orpheline.
3. **Sécurité des accès** : clé unique par VM, chiffrée, jamais de mot de passe partagé → dépasse l'exigence Must.
4. **Qualité de code** : TypeScript strict, dépendances minimales (`hono`, `Web Crypto (RSA-SHA256)`), tests, lint, CI GitHub Actions.

## Limites structurelles (détaillées dans 02 et 03)

- Pas de **dates de début/fin** dans le modèle → impossible en l'état de satisfaire « aucune machine sans date de fin » ni la **destruction automatique**.
- Pas de **rôle formateur** ni de **demande groupée**.
- Pas d'**Ansible** : les VM démarrent nues, sans outils de cours installés.
- **IaC** au sens « Terraform/OpenTofu » absent (appels API OCI directs) — à justifier en ADR.
- Catalogue = combos techniques génériques, pas des **templates de cours**.
- Monitoring = up/down seulement (pas de **ressources consommées**).
- Isolation réseau **non segmentée par classe**.

## Le bug bloquant du moment

La connexion Microsoft « tourne en boucle ». **Le worker n'est pas en cause** (le `302` vers
Microsoft est correct). La cause est en aval (config Entra / secret / domaine email).
Procédure de diagnostic et correctifs : `04-diagnostic-login.md`.
