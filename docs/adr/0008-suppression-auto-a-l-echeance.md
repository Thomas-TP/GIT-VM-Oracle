# ADR 0008 — Suppression automatique des VM à l'échéance

**Statut** : Acté (2026-06-19) · **supersède la décision « stop » de [ADR 0004](0004-cycle-de-vie-reconciliateur.md)**

## Contexte

[ADR 0004](0004-cycle-de-vie-reconciliateur.md) avait choisi d'**arrêter** (stop) les VM à leur
`end_date` pour préserver le travail des étudiants — un écart assumé au **Must M8** (qui exige la
*destruction* automatique). Décision du client (2026-06-19) : revenir à la **suppression
automatique**, conforme au cahier des charges.

## Décision

À `end_date`, le réconciliateur (`enforceExpiry`, cron `*/2 min`) **détruit** la VM au lieu de
l'arrêter :

- `terminateInstance` (instance OCI + boot volume) **+ `deleteKeyPair`** (no-op sur OCI : pas de key pair gérée côté cloud) ;
- `vms.state = 'terminated'`, `vm_requests.status = 'terminated'`, `expired_at` posé (trace de
  l'expiration, distingue l'auto-suppression d'une suppression manuelle dans l'UI) ;
- email **« VM supprimée »** au propriétaire.
- L'email **« échéance proche »** (24 h avant, une fois) est conservé mais **réécrit** : il prévient
  désormais que la VM sera **supprimée** et que les données seront perdues → inciter à sauvegarder.

Le reste d'ADR 0004 (dates obligatoires, pattern réconciliateur, extinction nocturne `0 19 * * *`
comme garde-fou coûts, UTC) **reste en vigueur**.

## Justification

- **Conforme au Must M8** (destruction automatique) — supprime l'écart documenté dans ADR 0004.
- **Coût nul** après échéance : ni compute ni stockage Block Volume résiduel (le disque est détruit avec
  l'instance, `DeleteOnTermination=true`).
- Réutilise le réconciliateur (idempotent) — aucun mécanisme parallèle.

## Conséquences

- (+) Cycle de vie complet et conforme : « aucune machine sans date de fin », purge automatique.
- (+) Aucune ressource OCI orpheline / facturée après l'échéance.
- (−) **Action destructive et irréversible** : les données de la VM expirée sont perdues. Mitigation :
  email de pré-échéance à 24 h **+** l'utilisateur peut demander une prolongation (changement de
  `end_date` par un admin) **avant** l'échéance.
- (−) Une VM expirée ne peut plus être « redémarrée » (elle n'existe plus) → il faut une nouvelle demande.

## Alternatives écartées

- **Garder le stop (ADR 0004)** : écarté à la demande du client (non conforme au Must M8).
- **Flag `AUTO_TERMINATE`** (stop par défaut, terminate optionnel) : complexité inutile, la décision
  est tranchée en faveur du terminate.
- **Snapshot avant suppression** : préserverait les données mais ajoute coût + complexité (hors scope
  hackathon) ; pourra faire l'objet d'un futur ADR si besoin.
