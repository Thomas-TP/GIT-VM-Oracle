# Architecture Decision Records (ADR)

Décisions d'architecture, format léger : **Contexte → Décision → Conséquences → Alternatives**.
Chaque ADR répond à « nous avons choisi X plutôt que Y parce que… » (exigence cahier des charges).

| # | Décision | Statut |
|---|---|---|
| [0001](0001-garder-aws-et-cloudflare-workers.md) | Garder un cloud public + Cloudflare Workers (socle d'origine ; bascule OCI → ADR 0010) | ✅ Acté |
| [0002](0002-provisioning-api-directe-vs-terraform.md) | Provisioning par API OCI directe + module Terraform documenté | ✅ Acté |
| [0003](0003-ansible-via-cloud-init.md) | Installation des outils via Ansible + cloud-init (`ansible-pull`) | ✅ Acté |
| [0004](0004-cycle-de-vie-reconciliateur.md) | Cycle de vie (dates, auto-destroy) via le réconciliateur cron | ✅ Acté |
| [0005](0005-roles-et-demande-groupee.md) | Rôle formateur + demande groupée par `group_id` | ✅ Acté |
| [0006](0006-gestion-des-secrets.md) | Secrets : Wrangler Secrets + chiffrement AES-GCM au repos | ✅ Acté |
| [0007](0007-catalogue-os-et-windows-rdp.md) | Catalogue d'OS élargi (AMIs vérifiés) + support Windows (RDP) | ✅ Acté |
| [0008](0008-suppression-auto-a-l-echeance.md) | Suppression automatique des VM à l'échéance (supersède le « stop » d'ADR 0004) | ✅ Acté |
| [0009](0009-snapshots-et-restauration-locale.md) | Snapshots de boot volume + restauration depuis backup (export local retiré) | ✅ Acté |

> Convention : un ADR n'est jamais réécrit une fois acté ; s'il est remis en cause, on crée un
> nouvel ADR qui le « supersède ».
