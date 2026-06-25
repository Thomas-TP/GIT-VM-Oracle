# 03 — Écarts & dette technique (registre priorisé)

> Chaque entrée : impact, effort, et **action recommandée**. Tri par priorité.
> Effort : XS (<1h) · S (½ j) · M (1 j) · L (2 j+).

## 🔴 P0 — Bloquants recevabilité (chemin critique)

### D1. Pas de dates de début/fin
- **Impact** : viole le Must le plus martelé (« aucune machine sans date de fin ») ; bloque M8, S2, S3.
- **Cause** : `vm_requests` n'a pas `start_date`/`end_date` ; `createRequest()` ne les prend pas.
- **Action** : migration `0005_lifecycle.sql` (`start_date TEXT`, `end_date TEXT NOT NULL`,
  `group_id TEXT`, `qty INTEGER DEFAULT 1`) + champ obligatoire dans `NewRequestDialog.tsx` +
  validation API (refus si `end_date` absente ou < `start_date`). **Effort : M.**

### D2. Pas de destruction automatique à l'échéance
- **Impact** : Must M8 + exigence coûts + scénario de démo (« destruction programmée »).
- **Action** : étendre `reconcile()` dans `src/index.ts` — toute VM `active` avec
  `end_date < now()` → `terminateInstance` + `deleteKeyPair` + statut `terminated` + email.
  Réutilise le pattern existant. **Effort : S** (après D1).

### D3. Pas de rôle formateur ni de demande groupée
- **Impact** : Must M5.
- **Cause** : rôles limités à `member`/`admin` ; pas de notion de lot.
- **Action** : ajouter rôle `trainer` (dérivé d'une liste `TRAINER_EMAILS` ou d'un groupe Entra) ;
  formulaire « N machines » → crée N `vm_requests` partageant un `group_id` ; vue admin groupée.
  **Effort : M.**

### D4. Pas d'Ansible (outils du cours)
- **Impact** : Must M7 + scénario de démo (« outils installés »).
- **Action** : créer `ansible/` (playbook + rôle commun + 1 rôle par cours). Le worker injecte
  un **user-data cloud-init** qui fait `ansible-pull` du repo et applique le playbook du template.
  Ansible **réel**, dans le repo, démoable, **sans serveur de contrôle**. Voir `docs/adr/0003`. **Effort : M.**

## 🟠 P1 — Fort impact sur la note (archi / coûts / monitoring)

### D5. Catalogue non orienté cours
- **Impact** : Must M2 (qualité) ; clarté de la démo.
- **Action** : refondre `presets.ts` → un **template = {cours, perf par défaut, OS, playbook
  Ansible, liste d'outils}**. Garder perf/stockage en « options avancées ». **Effort : M.** (couplé à D4)

### D6. IaC « non standard » (API directe vs Terraform)
- **Impact** : Must M6 + critère Architecture (20 %).
- **Action** : **ADR de justification** (`docs/adr/0002`) + livrer un **module Terraform/OpenTofu**
  documenté (même si le live utilise l'API) pour cocher l'exigence et la défendre. **Effort : S→L.**

### D7. Monitoring des ressources absent
- **Impact** : Must M11 (partie « ressources ») + critère Monitoring (20 %).
- **Action rapide** : OCI Monitoring basic CPU lu via API et affiché. **Action « pro »** : `node_exporter`
  via cloud-init + mini Prometheus + Grafana (bonus archi, open source, valorisé marché). **Effort : M→L.**

### D8. Isolation réseau non segmentée
- **Impact** : Must M10 (partiel).
- **Action** : un **security list par classe/`group_id`** créé à la demande groupée ; documenter
  le modèle d'isolation. **Effort : M.**

### D9. Dashboard coûts par cours
- **Impact** : Should S1 + critère Coûts.
- **Action** : agréger `coût horaire × heures up` par `group_id`/cours dans l'admin (métriques déjà présentes). **Effort : S.**

## 🟡 P2 — Dette & polish

| # | Écart | Action | Effort |
|---|---|---|:--:|
| D10 | Extinction week-end + redémarrage matinal | Affiner les crons (jour/heure) | S |
| D11 | Notif avant échéance (J-1) | Email depuis `reconcile()` quand `end_date - now < 24h` | XS |
| D12 | ~~Parsing XML par regex~~ — **résolu** : le client OCI (`oci.ts`) parse du **JSON natif** | Plus de parsing XML fragile depuis la bascule OCI | ✅ |
| D13 | `start/stop` n'attendent pas l'état réel | Déjà rattrapé par le réconciliateur ; OK | — |
| D14 | Secrets : pas de rotation | Documenter la procédure de rotation `wrangler secret` | XS |
| D15 | Tests : couverture limitée (crypto, presets) | Ajouter tests sur le cycle de vie (dates, auto-destroy) | M |
| D16 | Pas de `.env.example` ni README « from zero » complet vis-à-vis de la stack réelle | Mettre à jour pour le test de redéploiement (livrable, 20 %) | S |

## Risques transverses

- **R1 — Démo live** : un appel OCI qui échoue en direct = démo cassée. → **Plan B obligatoire**
  (vidéo + env. de secours pré-provisionné). Garde-le à jour dès maintenant.
- **R2 — Quotas/coûts OCI** : surveiller le nombre d'instances ; l'auto-destroy + le stop nocturne
  sont les garde-fous. Vérifier les limites du compte avant la démo.
- **R3 — Git local non initialisé** : le repo téléchargé n'a pas de `.git`. Reconnecter au remote
  GitHub avant de committer (voir roadmap J1).
- **R4 — Ambiguïté « pas de destroy »** : confirmé avec l'équipe que l'auto-destruction à
  l'échéance **reste** au plan (c'est un Must). Ne pas la retirer sans validation client.
