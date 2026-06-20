# AGENTS.md — Guide pour agents IA & nouveaux développeurs

> **Lis ce fichier en premier.** Il est le point d'entrée canonique pour toute IA (Claude Code,
> Copilot, Cursor…) **et** pour un développeur qui découvre le repo. Il donne l'essentiel pour
> comprendre, modifier, tester et **déployer** le projet sans rien casser.
>
> Documents liés : [`CLAUDE.md`](CLAUDE.md) (contexte détaillé) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
> [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) ·
> [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`docs/adr/`](docs/adr/) (décisions).
>
> Dernière mise à jour : 2026-06-19.

---

## 1. Le projet en une phrase

Plateforme **self-service de provisioning de VM** : un membre se connecte en **SSO Microsoft
(Entra ID)**, demande une VM depuis un catalogue, un admin approuve, la VM est **provisionnée
automatiquement sur AWS EC2** (clé SSH unique chiffrée, ou mot de passe RDP pour Windows), puis
**supprimée automatiquement à sa date de fin** (ADR 0008). Le tout tourne sur **Cloudflare Workers**.

- **Prod** : <https://git-vm-portal.thomas-prudhomme.workers.dev>
- **Repo** : <https://github.com/Thomas-TP/GIT-VM>

## 2. Règles d'or (NE PAS enfreindre)

1. **Ne casse pas l'existant qui marche.** Le socle AWS + Workers est déployé et fonctionnel.
   On **ajoute** et on **corrige** ; on ne réécrit pas, on ne pivote pas.
2. **Toute logique de cycle de vie passe par le réconciliateur cron** (`src/index.ts` →
   `reconcile`/`enforceExpiry`/`retryFailed`). Pas de mécanisme parallèle. Voir
   [ADR 0004](docs/adr/0004-cycle-de-vie-reconciliateur.md).
3. **Aucun secret dans le repo.** Secrets via `wrangler secret put` uniquement. Les scripts AWS
   lisent les creds depuis l'environnement (`$env:AWS_ACCESS_KEY_ID`…), jamais en dur.
4. **Une décision = un ADR** dans [`docs/adr/`](docs/adr/) (livrable noté).
5. **Docs et commentaires en français** (équipe + client francophones). Code et identifiants en anglais.
6. **Style de code** : TypeScript strict, Hono, pas de dépendances lourdes. Suis le style existant.

## 3. Stack

| Couche | Techno |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind v4 + TanStack Query + react-i18next |
| Backend | Cloudflare Worker (**Hono**) — API JSON + cron `scheduled()` |
| Base de données | Cloudflare **D1** (SQLite) |
| Hébergement | Cloudflare Workers Static Assets (SPA) + Worker (API) |
| Auth | Microsoft **Entra ID** (OIDC authorization-code, in-Worker, sans librairie) |
| Compute | **AWS EC2** (`eu-central-2` / Zurich), signé avec `aws4fetch` (appels API directs) |
| Email | EmailJS (REST) · Erreurs : Sentry (optionnel) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) = typecheck/lint/test/build **uniquement** |
| CD | **Cloudflare Workers Builds** (intégration GitHub↔Cloudflare) = build + migrate + deploy sur `main` |

## 4. Carte du code

```
src/                      WORKER (API + cron)
  index.ts                Routes OIDC (/auth/*), API (/api/*), cron scheduled() + réconciliateur
  oidc.ts                 Entra ID : authorizeUrl / exchangeCode / userFromIdToken
  crypto.ts               JWT HMAC maison, AES-GCM (chiffrement clés SSH + mots de passe), randomToken
  db.ts                   Toutes les requêtes D1 (requests, vms, users, audit, comments, metrics)
  aws.ts                  Client EC2 minimal (RunInstances/Describe/Terminate/Start/Stop/Reboot, KeyPair, UserData)
  presets.ts              Catalogue : PERF (instances) × STORAGE (disque) × OS (AMI) + coûts. SOURCE DE VÉRITÉ.
  email.ts                Notifications EmailJS (nouvelle demande, approuvée, refusée, prête, échéance)
  sentry.ts               Report d'erreurs (optionnel)
  types.ts                Env (bindings + secrets) + types partagés worker
migrations/               D1 : 0001 init · 0002 ssh_keys · 0003 composed_presets · 0004 comments
                          · 0005 lifecycle (dates) · 0006 windows · 0007 schedule (auto start/stop)
web/src/                  SPA REACT
  App.tsx                 Routeur + garde d'auth (query /api/me, sinon <Login/>)
  main.tsx                Entrée (providers : QueryClient, Theme, Toast, Router)
  api.ts                  Client HTTP typé vers le Worker
  i18n.ts                 Traductions FR/EN (fr est la source ; en: typeof fr DOIT rester aligné)
  ui.tsx                  Primitives UI (Button, Card, Modal, Input, icônes…) — pas de lib externe
  types.ts                Types partagés SPA (miroir des presets/requests)
  lib/format.ts           Formatage dates / uptime
  pages/                  Login · MyVms (/) · NewVm (/new) · RequestDetail (/requests/:id) · Admin (/admin)
  components/             AppShell · RequestsTable · StatusBadge · OsIcon · ConnectionGuide ·
                          Comments · UsersPanel · Toggles
scripts/                  Helpers AWS one-off (Node, lisent les creds depuis l'env) :
  aws-amis.mjs            Découvre les AMIs eu-central-2 (DescribeImages) + inspecte le security group
  aws-open-rdp.mjs        Ouvre le port RDP 3389 sur le SG (idempotent) — requis pour Windows
  aws-discover/setup/cleanup/e2e.mjs   Outils de mise en place / nettoyage / test e2e
wrangler.jsonc            Config Worker : bindings D1, vars publiques, crons, assets
docs/                     Architecture, déploiement, configuration, ADR, analyse, roadmap
```

## 5. Le pattern central : le réconciliateur

**La DB = état désiré.** Une cron (`*/2 * * * *`) **réconcilie** le réel AWS avec la DB :
`provisioning → active` (instance running + IP, + email « prête »), détection de **drift**
(instance supprimée hors portail → `terminated`), **retry** des provisioning échoués (max 3).
Une cron `0 19 * * *` **arrête** les VM running (garde-fou coûts, ignore les VM ayant leur propre
planning). À la `end_date`, la VM est **supprimée** (terminate instance + clé —
[ADR 0008](docs/adr/0008-suppression-auto-a-l-echeance.md), supersède 0004) et marquée `expired_at`.
Le cron `*/2` applique aussi les **plannings auto start/stop par VM** (`applySchedules`, état désiré,
fuseau Europe/Zurich). **Toute nouvelle automatisation de cycle de vie s'ajoute ici.**

## 6. Modèle de données (D1)

- `users(email PK, name, role[member|admin], created_at)`
- `vm_requests(id, user_email, purpose, preset, storage, os, region, status, admin_note, decided_by,
  created_at, decided_at, start_date, end_date, expired_at,
  schedule_enabled, schedule_start, schedule_stop, schedule_days)`
  — `status ∈ pending | approved | rejected | provisioning | active | failed | terminated`
  — « expired » est **dérivé** de `expired_at` (le statut reste `active`), pour ne pas toucher au CHECK.
- `vms(id, request_id, aws_instance_id, public_ip, state, ssh_key_name, ssh_private_key[chiffré AES-GCM],
  ssh_user, connect_method['ssh'|'rdp'], admin_password[chiffré, Windows], created_at, terminated_at)`
- `audit_log(id, actor, action, target, detail, created_at)` · `request_comments(...)`

Détails + diagrammes : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 7. Catalogue (src/presets.ts)

Une demande = **PERF × STORAGE × OS**. ⚠️ Le compte AWS est **Free-Tier uniquement** : `PERF` se
limite aux types éligibles **x86_64** (`t3.micro`, `t3.small`, `c7i-flex.large` — `scripts/aws-freetier.mjs`)
et `STORAGE` à **≤ 30 Go** (les ARM `t4g.*` sont exclus, nos AMIs étant x86_64).
Les AMIs sont des **IDs concrets `eu-central-2` vérifiés**
(via `scripts/aws-amis.mjs`). OS actuels : Ubuntu 24.04 LTS, Debian 12, Amazon Linux 2023, Rocky
Linux 9, AlmaLinux 9, **Windows Server 2022** et **Windows · Poste de travail** (Server 2025, bureau)
— les deux en RDP. Linux → SSH (clé ed25519 unique). Windows → RDP
(mot de passe admin généré via UserData, chiffré, port 3389). Voir
[ADR 0007](docs/adr/0007-catalogue-os-et-windows-rdp.md).

**Rafraîchir les AMIs** (quand elles vieillissent) : lancer `scripts/aws-amis.mjs` et reporter les IDs.

## 8. Commandes

```bash
# Installer
npm install && npm --prefix web install

# Développer
npx wrangler dev                 # Worker (API) sur :8787
npm --prefix web run dev         # SPA hot-reload (proxy /api → :8787)
npx wrangler d1 migrations apply git_vm_portal --local   # migrations en local

# Qualité (à faire passer avant tout commit / PR)
npm run typecheck                # worker (tsc)
npm --prefix web run typecheck   # SPA (tsc)
npm test                         # vitest
npm run lint                     # eslint (src test)
npm --prefix web run build       # build SPA → web/dist

# Debug prod
npx wrangler tail git-vm-portal --format pretty
```

## 9. Déploiement (comment publier)

**On NE lance PAS `wrangler deploy` à la main.** Le déploiement se fait par **Cloudflare Workers
Builds** : un push/merge sur **`main`** déclenche, côté Cloudflare, le **build** puis le **deploy
command** `npx wrangler d1 migrations apply git_vm_portal --remote && npx wrangler deploy`.
→ **Les migrations D1 remote sont donc appliquées automatiquement** juste avant le déploiement.

**Pour livrer** : ouvrir une PR → la faire vérifier → **merger sur `main`**. Les builds des branches
non-prod sont désactivés (une PR seule ne déploie rien). Vérifier en live : `GET /api/presets`.
Procédure complète, rollback, domaine : [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## 10. Secrets & credentials (comment les publier)

Config **publique** dans `wrangler.jsonc` → `vars` (IDs Entra, région AWS, subnet, SG, EmailJS public…).
**Secrets** (jamais commités) via `wrangler secret put <NAME>` :
`SESSION_SECRET`, `ENTRA_CLIENT_SECRET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `EMAILJS_PRIVATE_KEY`.
Détail de chaque variable, permissions IAM AWS requises, enregistrement de l'app Entra, et
**procédures de rotation** : [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) et
[ADR 0006](docs/adr/0006-gestion-des-secrets.md).

> ⚠️ Si on te fournit des clés AWS dans le chat/un fichier : utilise-les **uniquement en local**
> (variables d'env), **ne les commit jamais**, et **rappelle de les révoquer/roter** ensuite.

## 11. Pièges connus (gotchas)

- **`i18n.ts`** : `en: typeof fr` → toute clé ajoutée à `fr` doit l'être à `en`, sinon le typecheck SPA casse.
- **Migration avant déploiement** : le code lit `connect_method`/`admin_password` ; sans la migration,
  `getRequestDetail`/`listActiveVms`/`createVm` renvoient 500. Le deploy command Cloudflare gère l'ordre.
- **Windows RDP** : nécessite le port **3389** ouvert sur le SG partagé `sg-0f842f10ca3c7b2d1`
  (`scripts/aws-open-rdp.mjs`). Le SG n'ouvre que 22 par défaut.
- **`SESSION_SECRET`** sert aux sessions **et** au chiffrement des clés/mots de passe : le roter
  invalide les sessions ET rend les secrets stockés illisibles (re-télécharger les clés après).
- **AMIs** : IDs régionaux figés dans `presets.ts` ; ils périment → rafraîchir via `aws-amis.mjs`.
- **Login** : si la connexion échoue, c'est en général une **config Entra** (redirect URI / secret /
  domaine email), pas le code. Voir [`docs/analyse/04-diagnostic-login.md`](docs/analyse/04-diagnostic-login.md).

## 12. Où trouver quoi

| Besoin | Fichier |
|---|---|
| Contexte projet détaillé, échéances | [`CLAUDE.md`](CLAUDE.md) |
| Architecture, diagrammes, flux | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Déployer / publier / rollback | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
| Variables, secrets, IAM, Entra, rotation | [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) |
| Contribuer (workflow, conventions) | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Décisions techniques | [`docs/adr/`](docs/adr/) |
| État des lieux, dette technique | [`docs/analyse/`](docs/analyse/) |
| Plan, backlog | [`docs/roadmap/`](docs/roadmap/) |
| Faits durables (mémoire) | [`.claude/MEMOIRE-PROJET.md`](.claude/MEMOIRE-PROJET.md) |
