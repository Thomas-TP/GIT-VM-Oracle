# ADR 0002 — Provisioning par API OCI directe + module Terraform documenté

**Statut** : Acté (2026-06-19)

## Contexte

Le Must M6 exige un « provisioning automatisé (Infrastructure as Code) ». L'implémentation
actuelle crée les VM par **appels API OCI directs** depuis le Worker (`Web Crypto (RSA-SHA256)`). Un Cloudflare
Worker **ne peut pas exécuter de binaire** (`terraform`/`tofu`/`ansible`) : il faudrait un runner
externe (CI, conteneur) pour de la « vraie » IaC déclarative.

## Décision

1. **Le chemin live reste l'API OCI directe** depuis le Worker (provisioning à l'approbation).
2. Nous fournissons **en parallèle un module Terraform/OpenTofu** (`infra/`) reproduisant la même
   VM (instance, Block Volume, SG, clé), **documenté et testé**, pour : (a) cocher l'exigence IaC au sens
   du marché, (b) servir de référence/plan B, (c) être défendu en revue d'archi.

## Justification

- Le Worker offre un provisioning **automatique, idempotent, sans runner** — c'est de
  l'« infra définie par code », même si ce n'est pas du HCL. On l'assume et on l'explique.
- Forcer Terraform dans la boucle live imposerait un **runner CI** (latence + point de panne
  supplémentaire en démo live) pour un parc de petite taille → mauvais rapport risque/bénéfice.
- Le module Terraform livré démontre la **maîtrise de l'outil attendu** sans fragiliser la démo.

## Conséquences

- (+) Démo robuste (pas de dépendance CI au runtime).
- (+) Exigence IaC satisfaite et **argumentée** (le cahier demande de savoir défendre ses choix).
- (−) Deux représentations de l'infra à garder cohérentes → limiter le module Terraform au
  périmètre démo et le marquer comme « référence/évolution ».

## Alternatives écartées

- **Tout Terraform via GitHub Actions déclenché par le Worker** (`repository_dispatch`) :
  élégant mais ajoute latence + un maillon qui peut casser le live. Envisageable post-hackathon.
- **Rien d'autre que l'API directe** : laisserait le Must M6 contestable en revue.
