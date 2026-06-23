# AGENTS.md — Guide pour agents IA & nouveaux développeurs

> **Lis ce fichier en premier.** Point d'entrée **canonique** pour toute IA (Claude Code, Copilot,
> Cursor…) **et** pour un développeur qui découvre le repo. Il donne l'essentiel pour comprendre,
> modifier, tester et **déployer** le projet sans rien casser.
>
> Documents liés : [`CLAUDE.md`](CLAUDE.md) (redirige ici) · [`README.md`](README.md) ·
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) ·
> [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) · [`CONTRIBUTING.md`](CONTRIBUTING.md) ·
> [`docs/adr/`](docs/adr/) (décisions).
>
> Dernière mise à jour : 2026-06-23.

---

## 1. Le projet en une phrase

Plateforme **self-service de provisioning de VM** : un utilisateur se connecte en **SSO Microsoft
(Entra ID)**, nomme et demande une (ou plusieurs) VM depuis un catalogue, un **admin valide**, la VM
est **provisionnée automatiquement sur AWS EC2** (clé SSH unique chiffrée, ou mot de passe RDP
Windows), **durcie** (filtrage réseau), **sauvegardable** (snapshots EBS), **arrêtée si inactive**, et
**supprimée à sa date de fin**. Le tout tourne sur **Cloudflare Workers**.

- **Prod** : <https://git-vm-portal.thomas-prudhomme.workers.dev>
- **Repo** : <https://github.com/Thomas-TP/GIT-VM>

## 2. Règles d'or (NE PAS enfreindre)

1. **Ne casse pas l'existant qui marche.** Le socle AWS + Workers est déployé et fonctionnel. On
   **ajoute** et on **corrige** ; on ne réécrit pas, on ne pivote pas.
2. **Toute logique de cycle de vie passe par le réconciliateur cron** (`src/index.ts`). Pas de
   mécanisme parallèle. Voir [ADR 0004](docs/adr/0004-cycle-de-vie-reconciliateur.md).
3. **Migrations D1 additives uniquement** (`ALTER TABLE … ADD COLUMN`, `CREATE TABLE`). Jamais de
   reconstruction de table (conflits de clés étrangères sur D1 remote).
4. **Aucun secret dans le repo.** Secrets via `wrangler secret put` uniquement. Les scripts AWS lisent
   les creds depuis l'environnement (`$env:AWS_ACCESS_KEY_ID`…), jamais en dur.
5. **Une décision structurante = un ADR** dans [`docs/adr/`](docs/adr/).
6. **Docs et commentaires en français** (équipe + client francophones). Code et identifiants en anglais.
7. **`i18n.ts`** : `en: typeof fr` → toute clé ajoutée à `fr` doit l'être à `en`, sinon le typecheck SPA casse.
8. **Déploiement par merge sur `main` uniquement** (Cloudflare Workers Builds). Pas de `wrangler deploy` manuel.

## 3. Stack

| Couche | Techno |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind v4 + TanStack Query + react-i18next |
| Backend | Cloudflare Worker (**Hono**) — API JSON + cron `scheduled()` |
| Base de données | Cloudflare **D1** (SQLite) |
| Hébergement | Cloudflare Workers Static Assets (SPA) + Worker (API) |
| Auth | Microsoft **Entra ID** (OIDC authorization-code, in-Worker, sans librairie) |
| Compute | **AWS EC2** + EBS + CloudWatch (`eu-central-2` / Zurich), signé avec `aws4fetch` |
| Email | EmailJS (REST) · Erreurs : Sentry (optionnel) · Monitoring : Grafana Cloud (optionnel) |
| CD | **Cloudflare Workers Builds** = build + migrate D1 + deploy sur `main` |

## 4. Rôles

Trois rôles (colonne `users.role`), résolus à chaque login (`upsertUser`) :

- **member** : demande/gère ses propres VM.
- **formateur** : `member` + page **« Demande groupée »** (`/trainer`) — crée un lot de **1 à 30 VM**
  et les **attribue à des utilisateurs** de la plateforme (répartition round-robin). Ces demandes
  passent aussi par la **validation admin**.
- **admin** : tout valider/piloter (console `/admin`), gérer les rôles, accès à la page formateur.

Admins « bootstrap » via `ADMIN_EMAILS` (toujours admin) ; les autres rôles sont posés en base par un
admin (Admin → Utilisateurs → sélecteur de rôle).

## 5. Carte du code

```
src/                      WORKER (API + cron)
  index.ts                Routes OIDC (/auth/*), API (/api/*), middlewares (apiAuth/apiAdmin/apiTrainer),
                          cron scheduled() + tout le réconciliateur. provisionRequest() = clé+EC2+userData.
  oidc.ts                 Entra ID : authorizeUrl / exchangeCode / userFromIdToken
  crypto.ts               JWT HMAC maison, AES-GCM (clés SSH + mots de passe), randomToken
  db.ts                   Toutes les requêtes D1 (requests, vms, users, snapshots, audit, notifs, metrics)
  aws.ts                  Client EC2/EBS/CloudWatch (RunInstances/Describe/Terminate/Start/Stop/Reboot,
                          KeyPair, snapshots, RegisterImage, maxCpuOverWindow)
  presets.ts              Catalogue PERF × STORAGE × OS + COURSES + coûts. SOURCE DE VÉRITÉ.
  email.ts                Notifications EmailJS · sentry.ts erreurs · types.ts Env + types worker
migrations/               D1 (additif) : 0001 init … 0007 schedule · 0008 snapshot-on-delete ·
                          0014 snapshots · 0015 restore · 0016/0017 export (dormantes) · 0018 vm.name
web/src/                  SPA REACT
  App.tsx                 Routeur + garde d'auth + garde de rôle (/trainer, /admin)
  api.ts                  Client HTTP typé · i18n.ts FR/EN (fr source) · ui.tsx primitives · types.ts
  pages/                  Login · MyVms (/) · NewVm (/new) · TrainerBatch (/trainer) ·
                          RequestDetail (/requests/:id) · Admin (/admin) · Profile
  components/             AppShell · VmConsole (console admin) · GroupReview · RequestsTable ·
                          SnapshotPanel · GroupActions · SchedulePanel · ExtensionPanel ·
                          AdminReviewPanel · ConnectionGuide · DatePicker · UsersPanel · StatusBadge · OsIcon
scripts/                  Helpers AWS one-off (Node, creds depuis l'env) :
  aws-amis.mjs            Découvre les AMIs eu-central-2 · aws-open-rdp.mjs ouvre 3389
  aws-budget.mjs          Budget AWS 50$/mois + alertes mail · aws-iam-snapshot.mjs droits snapshots
  aws-iam-cloudwatch.mjs  Droit CloudWatch (active l'arrêt sur inactivité)
  aws-harden-sg.mjs       Verrouille l'egress du Security Group (filtrage réseau, non contournable)
wrangler.jsonc            Config Worker : bindings D1, vars, crons, assets
docs/                     Architecture, déploiement, configuration, ADR, analyse
```

## 6. Le pattern central : le réconciliateur

**La DB = état désiré.** Une cron `*/2 * * * *` réconcilie le réel AWS avec la DB, en séquence :

1. `reconcile` — `provisioning → active` (instance running + IP + email « prête »), détection de
   **drift** (instance supprimée hors portail → `terminated`).
2. `applySchedules` — **plannings auto start/stop par VM** (jours + horaires, fuseau Europe/Zurich).
3. `retryFailed` — **retry** des provisioning échoués (max 3).
4. `enforceExpiry` — à la `end_date` : **snapshot auto** (si activé) puis **terminate** (instance +
   clé) + `expired_at` + email. [ADR 0008](docs/adr/0008-suppression-auto-a-l-echeance.md).
5. `enforceIdleStop` — **arrêt sur inactivité** : CPU CloudWatch max < 10% sur `IDLE_STOP_HOURS`
   (déf. 3 h, historique suffisant requis) → stop + notif. L'utilisateur peut relancer.
6. `syncSnapshots` — suit les snapshots EBS en cours (`pending → completed/error`).

Une cron `0 19 * * *` arrête les VM running (garde-fou coûts nocturne, ignore les VM planifiées).
**Toute nouvelle automatisation de cycle de vie s'ajoute dans ce pipeline.**

## 7. Modèle de données (D1)

- `users(email PK, name, role[member|formateur|admin], created_at)`
- `vm_requests(id, user_email, name, purpose, preset, storage, os, region, status, course,
  course_ready_at, group_id, group_name, snapshot_on_delete, restore_snapshot_id, admin_note,
  decided_by, created_at, decided_at, start_date, end_date, expired_at,
  ext_requested_end, ext_requested_at, schedule_*)`
  — `status ∈ pending | approved | rejected | provisioning | active | failed | terminated`
  — « expired » est **dérivé** de `expired_at` (le statut reste `active`).
- `vms(id, request_id, aws_instance_id, public_ip, state, ssh_key_name, ssh_private_key[AES-GCM],
  ssh_user, connect_method['ssh'|'rdp'], admin_password[AES-GCM, Windows], created_at, terminated_at)`
- `snapshots(id, request_id, user_email, aws_snapshot_id, description, root_device, architecture,
  size_gb, status, os, created_at, completed_at, …)` — backup EBS, restauration, snapshot-avant-suppression.
- `audit_log(...)` · `notifications(...)` · `request_comments(...)` (dormant).

Détails : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 8. Catalogue (src/presets.ts)

Une demande = **PERF × STORAGE × OS** (+ cours optionnel). Le compte n'est **plus Free-Tier** mais
soumis à un **plafond de coût 50 $** sur 120 $ de crédits → **alertes budget AWS** (`aws-budget.mjs`,
mail). `PERF` reste sur des types raisonnables x86_64 ; les AMIs sont des **IDs `eu-central-2`
vérifiés** (`aws-amis.mjs`). OS : Ubuntu 24.04, Debian 12, Amazon Linux 2023, Rocky 9, AlmaLinux 9,
**Windows Server 2022** et **Windows poste de travail** — Windows en RDP, Linux en SSH (ed25519).
Voir [ADR 0007](docs/adr/0007-catalogue-os-et-windows-rdp.md).

**Bundles d'outils par cours** (`COURSES`) : préinstalle des logiciels via cloud-init (Linux) /
EC2Launch (Windows) au premier boot ; callback `course-done` → l'UI affiche « outils prêts ».

## 9. Fonctionnalités clés (au-delà du socle)

- **Multi-VM & groupes** : 1–4 VM à la création (chacune configurable + **nommée**) ; >1 VM ⇒
  **groupe obligatoire** (nom demandé à la validation). Groupe = piloter/valider toutes les VM ensemble.
- **Snapshots EBS** : créer / lister / **supprimer** ; **snapshot auto avant suppression** ; **restaurer**
  une VM depuis un snapshot à la création (AMI enregistrée). Onglet « Snapshots & export » de la VM.
  [ADR 0009](docs/adr/0009-snapshots-et-restauration-locale.md). (L'export VMware/VirtualBox a été retiré.)
- **Nom de VM** : obligatoire ; tag EC2 `Name = <nom>.<préfixe-email>` (ex. `python.thomas.prudhomme`).
- **Arrêt sur inactivité** : CloudWatch CPU (`IDLE_STOP`).
- **Durcissement sécurité** (`HARDENING`) : in-VM (DNS Cloudflare for Families, blocage P2P/torrent,
  hostname verrouillé — Linux + Windows) **+** verrouillage **egress du Security Group** (couche réseau
  non contournable, `aws-harden-sg.mjs`). Voir §11.
- **Demande groupée formateur** : lot 1–30 VM attribuées en round-robin à des utilisateurs.
- **Console admin** : onglet **VM** unifié (demandes + machines), validation en cartes (groupe / VM
  seule), actions cycle de vie inline, recherche/filtre/CSV ; onglets Vue d'ensemble / Utilisateurs /
  Monitoring (Grafana).

## 10. Commandes

```bash
npm install && npm --prefix web install            # installer

npx wrangler dev                                   # Worker (API) :8787
npm --prefix web run dev                           # SPA hot-reload (proxy /api → :8787)
npx wrangler d1 migrations apply git_vm_portal --local   # migrations locales

npm run typecheck                                  # worker (tsc)  — AVANT tout commit
npm --prefix web run typecheck                     # SPA (tsc)
npm --prefix web run build                         # build SPA → web/dist
npx wrangler tail git-vm-portal --format pretty    # logs prod
```

## 11. Sécurité réseau des VM (durcissement)

Défense en profondeur, car un utilisateur **sudo/admin** peut défaire ce qui est *dans* la VM :

- **In-VM** (au provisioning, `linuxHardeningBody` / `windowsHardeningLines`) : DNS forcé vers
  **Cloudflare for Families** (1.1.1.3 / 1.0.0.3 — bloque adulte + malware), blocage des ports
  torrent/P2P, **hostname verrouillé** (`chattr +i`). Flag `HARDENING` (déf. true).
- **Réseau (la vraie barrière)** : `scripts/aws-harden-sg.mjs` verrouille l'**egress du Security
  Group partagé** en liste blanche (80/443, **DNS 53 → Cloudflare uniquement**, NTP, SSH, métadonnées,
  DHCP) + default-deny. Bloque torrents/P2P/sites X au niveau réseau, **force le DNS filtré**, et un
  root ne peut **pas** le contourner. À lancer une fois avec des creds.
- ⚠️ Effet de bord : le 53 est bloqué sauf vers Cloudflare → une VM **antérieure** au durcissement
  (DNS = résolveur VPC) perd la résolution ; régler son `resolv.conf` sur 1.1.1.3 ou la recréer.

## 12. Déploiement

**On NE lance PAS `wrangler deploy` à la main.** Un push/merge sur **`main`** déclenche, côté
Cloudflare Workers Builds, le **build** puis le **deploy command** :
`npx wrangler d1 migrations apply git_vm_portal --remote && npx wrangler deploy`. → **Les migrations
D1 remote sont appliquées automatiquement** avant le déploiement. Livrer = ouvrir une PR → vérifier →
**merger sur `main`**. Vérifier en live : `GET /healthz` et `GET /api/presets`. Détail / rollback :
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## 13. Secrets, IAM & credentials

Config **publique** dans `wrangler.jsonc` → `vars` (IDs Entra, AWS_REGION/SUBNET/SG, flags
`SCHEDULED_STOP`/`IDLE_STOP`/`IDLE_STOP_HOURS`/`HARDENING`, EmailJS public…). **Secrets** via
`wrangler secret put` : `SESSION_SECRET`, `ENTRA_CLIENT_SECRET`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `EMAILJS_PRIVATE_KEY`. Le Worker tourne avec un user IAM (`Claude`) dont les
droits couvrent EC2 + EBS snapshots + CloudWatch read (voir scripts `aws-iam-*`). Détail de chaque
variable, permissions IAM, app Entra, **rotation** : [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md)
et [ADR 0006](docs/adr/0006-gestion-des-secrets.md).

> ⚠️ Clés AWS fournies dans le chat/un fichier : usage **local uniquement** (env), **jamais
> commitées**, et **rappeler de les révoquer/roter** ensuite.

## 14. Pièges connus (gotchas)

- **`i18n.ts`** : `en: typeof fr` — toute clé `fr` doit exister en `en`.
- **Migrations** : additives uniquement ; le deploy command applique les migrations remote avant le deploy.
- **Windows RDP** : port **3389** sur le SG (`aws-open-rdp.mjs`). Mais le durcissement egress
  (`aws-harden-sg.mjs`) restreint la **sortie** — ne touche pas l'entrée 22/3389.
- **`SESSION_SECRET`** : double usage (sessions **+** chiffrement clés/mots de passe). Le roter
  invalide tout (re-télécharger les clés, re-provisionner).
- **AMIs** : IDs régionaux figés dans `presets.ts`, ils périment → `aws-amis.mjs`.
- **Idle stop inerte** sans le droit `cloudwatch:GetMetricStatistics` (`aws-iam-cloudwatch.mjs`).
- **Login KO** : presque toujours une **config Entra** (redirect URI / secret / domaine), pas le code.
- **Bash tool** parfois cassé sous Windows (fork errors) → utiliser PowerShell + les outils dédiés.

## 15. Où trouver quoi

| Besoin | Fichier |
|---|---|
| Architecture, diagrammes, flux, sécurité | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Déployer / publier / rollback | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
| Variables, secrets, IAM, Entra, rotation | [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) |
| Contribuer (workflow, conventions) | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Décisions techniques (ADR 0001 → 0009) | [`docs/adr/`](docs/adr/) |
| Monitoring Grafana | [`monitoring/README.md`](monitoring/README.md) |
