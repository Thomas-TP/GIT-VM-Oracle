# ADR 0001 — Garder le socle déployé (cloud public + Cloudflare Workers)

**Statut** : Acté (2026-06-19) · **Décideurs** : binôme Groupe 3

> 🕮 **ADR historique** : décision de garder la solution **déjà déployée** plutôt que de repartir sur
> Infomaniak/OpenTofu. La couche compute tourne désormais sur **OCI** — voir
> [ADR 0010](0010-migration-vers-oci-compute.md).

## Contexte

Le cahier des charges attribue un compte **Infomaniak** et un plan initial prévoyait
OpenTofu + Ansible + FastAPI + PostgreSQL sur Infomaniak. Or l'équipe a déjà **construit et
déployé** une solution sur **OCI Compute + Cloudflare Workers + D1**, fonctionnelle. Il reste **7 jours**
avant la démo.

## Décision

**Nous gardons la stack OCI + Cloudflare Workers** et nous comblons les écarts de façon
**additive**. Nous **ne pivotons pas** vers Infomaniak/OpenTofu/FastAPI.

## Justification

- Un socle **déployé et fonctionnel** à J-7 a une valeur immense ; un pivot remettrait à zéro le
  risque sur le critère le plus lourd (Démo fonctionnelle, 30 %).
- L'architecture **serverless** (un worker = API + cron + assets) est cohérente, à coût quasi nul
  au repos, et **élimine l'administration de serveurs** — un argument fort en revue.
- OCI Compute reste un **choix marché** parfaitement défendable ; le cahier autorise « le choix
  d'architecture vous appartient — mais justifié ».

## Conséquences

- (+) Continuité, risque minimal, démo plus sûre.
- (+) Garde-fous coûts natifs (auto-destroy + stop nocturne via cron).
- (−) On s'écarte de la « préférence outils » du cahier (OpenTofu/Ansible/Prometheus) →
  compensé par les ADR 0002/0003 et le monitoring (roadmap P1).
- (−) Pas de bastion/OpenStack par classe « clé en main » → isolation par security list (ADR à venir).

## Alternatives écartées

- **Pivot Infomaniak/OpenTofu** : trop risqué à 7 jours, jette une base qui marche.
- **Double stack** : dispersion de l'effort, incohérence de démo.
