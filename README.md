<div align="center">

# 🖥️ GIT VM Portal

**Plateforme self-service de provisioning de machines virtuelles**
SSO Microsoft → demande → validation → VM AWS EC2 automatique → arrêt à l'échéance.
Le tout sur **Cloudflare Workers**.

[![CI](https://github.com/Thomas-TP/GIT-VM/actions/workflows/ci.yml/badge.svg)](https://github.com/Thomas-TP/GIT-VM/actions/workflows/ci.yml)
&nbsp;·&nbsp; **Prod** : <https://git-vm-portal.thomas-prudhomme.workers.dev>

</div>

---

## ✨ Fonctionnalités

- 🔐 **SSO Microsoft Entra ID** (OIDC authorization-code, in-Worker, aucun mot de passe stocké).
- 🖥️ **Demande de VM en libre-service** depuis un catalogue : **performance × stockage × OS**.
- 🐧 **7 systèmes** : Ubuntu 24.04, Debian 12, Amazon Linux 2023, Rocky Linux 9, AlmaLinux 9,
  **Windows Server 2022** et **Windows poste de travail** (bureau).
- ✅ **Workflow de validation** (admin approuve/refuse) avec **notifications email**.
- ⚙️ **Provisioning AWS EC2 automatique** et idempotent via un **réconciliateur** cron.
- 🔑 **Accès sécurisé par VM** : clé SSH **ed25519 unique chiffrée AES-GCM** (Linux) ou **mot de
  passe RDP** généré et chiffré (Windows) — accessible au seul propriétaire.
- 📖 **Guides de connexion intégrés** : MobaXterm, Termius (SSH) et Bureau à distance (RDP).
- ⏱️ **Cycle de vie** : dates début/fin obligatoires (sélecteur calendrier), **suppression
  automatique à l'échéance** (ADR 0008), extinction nocturne (garde-fou coûts),
  démarrage/arrêt/reboot à la demande.
- 🕒 **Planification auto** : **démarrage / extinction programmés par l'utilisateur** (jours +
  horaires, heure de Genève) — la VM s'allume et s'éteint toute seule.
- 📊 **Console admin** : stats, métriques, recherche/tri/pagination, gestion des rôles, export CSV.
- 🌗 Thème clair/sombre · 🌐 FR/EN · 🧾 **journal d'audit** sur les actions sensibles.

## 🧱 Stack

| Couche | Techno |
|---|---|
| Frontend | React 19 · Vite · TypeScript · Tailwind v4 · TanStack Query · react-i18next |
| Backend | Cloudflare Worker (**Hono**) — API JSON + cron `scheduled()` |
| Base de données | Cloudflare **D1** (SQLite) |
| Hébergement | Cloudflare Workers Static Assets (SPA) + Worker (API) |
| Auth | Microsoft **Entra ID** (OIDC) |
| Compute | **AWS EC2** (`eu-central-2` / Zurich), signé `aws4fetch` |
| Email | EmailJS (REST) · Erreurs : Sentry (optionnel) |

Choix d'architecture justifiés dans les [ADR](docs/adr/).

## 🚀 Démarrage rapide

```bash
# 1. Installer les dépendances (worker + SPA)
npm install && npm --prefix web install

# 2. Migrer la base locale
npx wrangler d1 migrations apply git_vm_portal --local

# 3. Lancer le worker (API) et la SPA
npx wrangler dev                 # → http://localhost:8787  (API)
npm --prefix web run dev         # → http://localhost:5173  (SPA, proxy /api → :8787)
```

> Les secrets locaux se mettent dans un fichier `.dev.vars` (non commité). Voir
> [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md).

## 🗺️ Architecture en bref

```
Navigateur ──HTTPS──> Cloudflare Worker (Hono)
   │  React SPA            │  OIDC Entra ID · API JSON · cron scheduled()
   │  (static assets)      ├──> D1 (SQLite)  = état désiré
   │                       ├──> AWS EC2 (aws4fetch) = provisioning réel
   │                       └──> EmailJS = notifications
   └─ La cron réconcilie en continu l'état réel AWS avec la DB (provisioning→active, drift, expiry).
```

Détails et diagrammes : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 📁 Structure

```
src/            Worker Cloudflare (API, OIDC, AWS, email, D1, cron)
migrations/     Migrations de schéma D1
web/            SPA React (build → web/dist, servie en static assets)
scripts/        Helpers AWS one-off (découverte AMIs, ouverture RDP, e2e…)
docs/           Architecture, déploiement, configuration, ADR, analyse, roadmap
wrangler.jsonc  Config Worker + bindings
AGENTS.md       Guide d'entrée pour agents IA & nouveaux devs
CLAUDE.md       Contexte projet détaillé
```

## 🚢 Déploiement

Le déploiement est **automatique via Cloudflare Workers Builds** : un merge sur **`main`** déclenche
build + migrations D1 + déploiement. **Pas de `wrangler deploy` manuel.** Voir
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## 🔐 Secrets

Config publique dans `wrangler.jsonc` (`vars`). Secrets via `wrangler secret put` (jamais commités) :
`SESSION_SECRET`, `ENTRA_CLIENT_SECRET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`EMAILJS_PRIVATE_KEY`. Détail, IAM, rotation : [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md).

## 📚 Documentation

| Document | Contenu |
|---|---|
| [AGENTS.md](AGENTS.md) | Point d'entrée IA & onboarding — l'essentiel pour travailler ici |
| [CLAUDE.md](CLAUDE.md) | Contexte projet détaillé, échéances, priorités |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture, flux, modèle de données, sécurité |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Pipeline CI/CD, publication, rollback |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Variables, secrets, IAM AWS, Entra, EmailJS, rotation |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Workflow, conventions, qualité, PR |
| [docs/adr/](docs/adr/) | Décisions d'architecture (ADR) |

## 📄 Licence

Projet éducatif interne — tous droits réservés.
