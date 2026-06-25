# ADR 0009 — Snapshots de boot volume et restauration

**Statut** : Acté (2026-06-22) · révisé pour OCI (2026-06-25) · complète
[ADR 0008](0008-suppression-auto-a-l-echeance.md) (qui renvoyait « snapshot avant suppression » à un futur ADR).

> 🕮 La version d'origine (socle AWS) proposait aussi un **export local OVA/VMware/VirtualBox**
> (`coldsnap` + `qemu-img`). Cette fonction a été **retirée** ; sur OCI on s'appuie sur les **boot volume
> backups** natifs. Voir [ADR 0010](0010-migration-vers-oci-compute.md).

## Contexte

[ADR 0008](0008-suppression-auto-a-l-echeance.md) supprime les VM à l'échéance (action irréversible) et
listait le « snapshot avant suppression » comme évolution. Le client a demandé de pouvoir **sauvegarder**
une VM et la **restaurer** à la création.

## Décision

**Sauvegarde = boot volume backup OCI** (`POST /20160918/bootVolumeBackups` sur le boot volume de l'instance).

- Bouton **« Créer un snapshot »** sur la page VM + case **« snapshot auto avant suppression / expiration »**
  (`vm_requests.snapshot_on_delete`). Le réconciliateur déclenche le backup avant `terminate` (suppression
  manuelle **et** `enforceExpiry`) et synchronise l'état (`*/2 min`, `syncSnapshots`).
- **Restauration à la création** : on choisit un snapshot terminé ; le Worker **crée un boot volume depuis
  le backup** (`POST /20160918/bootVolumes`, `sourceType=bootVolumeBackup`) puis lance l'instance avec
  `sourceDetails.sourceType=bootVolume` (même disque/OS). La clé SSH est ré-injectée via la metadata.
- Les colonnes D1 `aws_snapshot_id` / `aws_instance_id` sont conservées (elles stockent désormais des OCID).

## Justification

- Les **boot volume backups** sont natifs, couvrent **tout le catalogue** (Linux et Windows), sans infra
  supplémentaire (pas de bucket objet, pas de tâche d'export asynchrone).
- La restauration par **boot volume** est l'équivalent OCI direct de l'AMI-from-snapshot, sans étape
  d'enregistrement d'image.

## Conséquences

- (+) Sauvegarde / restauration couvrant tout le catalogue, avec les seules API OCI déjà utilisées.
- (−) La restauration crée un boot volume depuis le backup : le Worker **attend qu'il soit `AVAILABLE`**
  (polling borné) avant de lancer — quelques minutes pour les gros volumes.
- (−) Coût de stockage des backups (faible, $/Go-mois) — visible dans l'onglet **Coûts** (coût réel OCI).

## Alternatives écartées

- **Export local OVA (`coldsnap` + `qemu-img`)** : hérité du socle AWS, manuel (binaires + droits EBS),
  inadapté à OCI → **retiré**.
- **Service de conversion côté Worker** : transférer des Go de disque via un Worker est inadapté
  (limites CPU/mémoire/temps).
