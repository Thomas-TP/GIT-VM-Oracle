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
- 🖥️ **Demande de VM en libre-service** depuis un catalogue **performance × stockage × OS** ;
  **1 à 4 VM** d'un coup, chacune **nommée** et configurée ; >1 VM ⇒ **groupe** (piloté ensemble).
- 🐧 **7 systèmes** : Ubuntu 24.04, Debian 12, Amazon Linux 2023, Rocky Linux 9, AlmaLinux 9,
  **Windows Server 2022** et **Windows poste de travail** (bureau).
- 👥 **3 rôles** : membre · **formateur** (page « Demande groupée » : 1–30 VM attribuées à des
  utilisateurs) · admin.
- ✅ **Workflow de validation** (admin approuve/refuse, à la VM ou au groupe) + **notifications**.
- ⚙️ **Provisioning AWS EC2 automatique** et idempotent via un **réconciliateur** cron.
- 🔑 **Accès sécurisé par VM** : clé SSH **ed25519 chiffrée AES-GCM** (Linux) ou **mot de passe RDP**
  chiffré (Windows) — propriétaire uniquement. Guides intégrés (MobaXterm, Termius, Bureau à distance).
- 💾 **Snapshots EBS** : créer / supprimer, **snapshot auto avant suppression**, **restaurer** une VM
  depuis un snapshot à la création.
- ⏱️ **Cycle de vie** : dates obligatoires, **suppression auto à l'échéance**, **arrêt sur
  inactivité** (CPU CloudWatch), extinction nocturne, **planification** start/stop par VM.
- 🛡️ **Durcissement sécurité** : DNS filtré (Cloudflare for Families), blocage P2P/torrent, hostname
  verrouillé, **+ egress du Security Group verrouillé** (filtrage réseau non contournable).
- 📊 **Console admin unifiée** (demandes + machines), **monitoring Grafana**, export CSV, **audit**.
- 🌗 Thème clair/sombre · 🌐 FR/EN.

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
| [AGENTS.md](AGENTS.md) | **Référence canonique** — IA & onboarding : stack, archi, données, sécurité, déploiement |
| [CLAUDE.md](CLAUDE.md) | Redirige vers AGENTS.md |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture, flux, modèle de données, sécurité |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Pipeline CI/CD, publication, rollback |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Variables, secrets, IAM AWS, Entra, EmailJS, rotation |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Workflow, conventions, qualité, PR |
| [docs/adr/](docs/adr/) | Décisions d'architecture (ADR) |

## 📄 Licence

Projet éducatif interne — tous droits réservés.
