# Contribuer — GIT VM Portal

> Workflow, conventions et garde-fous. Lis d'abord [`AGENTS.md`](AGENTS.md) (l'essentiel) et
> [`CLAUDE.md`](CLAUDE.md) (contexte).

---

## Prérequis

- Node 20+, npm.
- `npm install && npm --prefix web install`.
- `.dev.vars` configuré (voir [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md)).

## Workflow Git

1. Pars de `main` à jour : `git switch main && git pull`.
2. Crée une branche : `git switch -c feat/<sujet>` (ou `fix/`, `docs/`, `chore/`).
3. Code en petits commits cohérents.
4. **Fais passer la qualité** (ci-dessous) en local.
5. Ouvre une **PR** vers `main`. La CI (typecheck/lint/test/build) doit être verte.
6. Après revue, **merge sur `main`** → Cloudflare déploie automatiquement
   (voir [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)).

> `main` est la **branche de production**. Les branches non-prod ne déploient pas, mais un merge sur
> `main` part directement en prod : ne merge que du vert.

## Qualité (avant chaque PR)

```bash
npm run typecheck                # worker
npm --prefix web run typecheck   # SPA  (⚠️ i18n : en doit rester aligné sur fr)
npm test                         # vitest
npm run lint                     # eslint
npm --prefix web run build       # build SPA
```

## Conventions de code

- **TypeScript strict** des deux côtés. Pas de `any` gratuit.
- **Backend** : Hono, pas de dépendances lourdes, appels AWS via `aws4fetch`.
- **Frontend** : composants fonctionnels, TanStack Query pour les données, primitives UI maison
  (`web/src/ui.tsx`) — pas de librairie de composants externe.
- **i18n** : `fr` est la source ; `en: typeof fr` → toute clé ajoutée à `fr` doit l'être à `en`.
- **Pas de secret** dans le code (voir [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md)).
- Suis le style existant (nommage, densité de commentaires, idiomes).

## Commits

Format **Conventional Commits** : `type(scope): sujet`
(`feat`, `fix`, `docs`, `refactor`, `chore`, `test`). Sujet à l'impératif, le « pourquoi » dans le
corps si non évident. Exemple : `feat(web): page de création de VM en cartes`.

## Base de données

- Migrations **additives** uniquement (`ALTER TABLE … ADD COLUMN`), jamais de reconstruction de table
  (conflits de clés étrangères sur D1 remote).
- Nouvelle migration : `migrations/NNNN_nom.sql`. Elle sera appliquée automatiquement au déploiement
  (deploy command Cloudflare). En local : `npx wrangler d1 migrations apply git_vm_portal --local`.

## Décisions d'architecture (ADR)

Toute décision structurante = un **ADR** dans [`docs/adr/`](docs/adr/). Copie le
format d'un ADR existant : Contexte → Décision → Justification → Conséquences → Alternatives écartées.

## Garde-fous projet

- **Ne casse pas l'existant** : on ajoute/corrige, on ne réécrit pas, on ne pivote pas.
- **Cycle de vie** : toute automatisation passe par le **réconciliateur** cron (`src/index.ts`).
- **Docs en français**, identifiants/code en anglais.
- Migrations **additives uniquement** (jamais de reconstruction de table sur D1 remote).
