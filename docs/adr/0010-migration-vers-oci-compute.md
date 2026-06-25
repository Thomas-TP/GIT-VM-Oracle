# ADR 0010 — Migration du provisioning AWS EC2 → Oracle Cloud (OCI) Compute

**Statut** : Acté (2026-06-24) · remplace la couche compute des [ADR 0001](0001-garder-aws-et-cloudflare-workers.md)
et [ADR 0002](0002-provisioning-api-directe-vs-terraform.md) (API directe conservée, fournisseur changé).

## Contexte

Une copie du portail (repo `GIT-VM-Oracle`, worker `git-vm-oracle`, base D1 `git_vm_oracle`) doit
provisionner sur **Oracle Cloud Infrastructure (OCI) Compute** au lieu d'AWS EC2, à iso-fonctionnalités,
**sans toucher** au projet AWS existant (repo `GIT-VM`, worker `git-vm-portal`, D1 `git_vm_portal`).
Toute la dépendance cloud était isolée dans `src/aws.ts` + quelques points d'appel.

## Décision

**On garde l'architecture** (réconciliateur, D1 = état désiré, OIDC Entra, EmailJS, SPA). On remplace
`src/aws.ts` par **`src/oci.ts`**, qui expose les **mêmes signatures** → `src/index.ts` ne change qu'à
la marge. Choix structurants :

1. **Signature API OCI** (pas de lib dans le runtime Workers) : on implémente le schéma **HTTP
   Signature « version 1 » (RSA-SHA256)** avec Web Crypto. Import de la clé API PKCS#8
   (`importKey('pkcs8', …, RSASSA-PKCS1-v1_5)`), en-tête `x-date` (le header `Date` est interdit côté
   fetch), `(request-target)`/`host`/`x-date` (+ `x-content-sha256`/`content-type`/`content-length`
   pour les corps). Les scripts Node signent via `node:crypto` (`scripts/_oci.mjs`).
2. **Clés SSH générées côté Worker** : OCI n'a pas de key pairs gérées. On génère une paire RSA-2048
   (Web Crypto), on injecte la **clé publique OpenSSH** dans la metadata `ssh_authorized_keys`, et on
   stocke la **privée PKCS#8 PEM** chiffrée AES-GCM (inchangé). `deleteKeyPair` devient un no-op.
3. **Shapes x86 AMD Flex** (`VM.Standard.E4/E5.Flex`) + palier gratuit `E2.1.Micro` → parité (Windows
   OK, installeurs de cours x86_64 inchangés). Catalogue complet (perfs/SSD), **un OS par famille**
   (Ubuntu 24.04, Oracle Linux 9, Windows Server 2022 ; Debian/Rocky/Alma ne sont pas des images
   plateforme OCI).
4. **Snapshots = boot volume backups** ; **restauration** = boot volume créé depuis un backup puis
   lancement `sourceType=bootVolume` (remplace `RegisterImage`/AMI). **Idle-stop** via OCI Monitoring
   (`oci_computeagent`/`CpuUtilization`). **Durcissement réseau** = egress de la security list en
   allowlist (`scripts/oci-harden.mjs`).
5. **D1** : on **conserve les noms de colonnes** `aws_instance_id` / `aws_snapshot_id` (on y stocke des
   OCID). Règle « migrations additives uniquement » respectée — aucune reconstruction de table.
6. **Cron natif Cloudflare** : le worker est déployé sur le compte **satom.ch** (qui a des slots de cron
   libres) avec une **cron `*/2 * * * *`** exécutant `runReconcile()`. Le compte git.swiss d'origine était
   plafonné à **5 cron triggers** (déjà consommés) → d'où le déménagement de compte. `POST
   /api/internal/reconcile` (gardé par `RECONCILE_TOKEN`) reste un déclencheur manuel de secours.

## Conséquences

- (+) Parité fonctionnelle complète, à côté du projet AWS, sans modifier ce dernier.
- (+) Aucune dépendance runtime ajoutée (`aws4fetch` retiré ; signature OCI faite en Web Crypto).
- (+) Le « jamais débité » repose sur le **mode crédits/Free Tier** du compte OCI (ne pas passer en
  Pay As You Go) ; budget + alertes 20/50/100 CHF en complément (`scripts/oci-budget.mjs`).
- (+) Réconciliateur fiable via **cron natif 2 min** (compte satom.ch). L'essai initial sur git.swiss
  via GitHub Actions était throttlé à plusieurs heures — abandonné au profit du cron natif.
- (−) `inspect availability-domains` et `manage usage-budgets` ne sont pas accordés à l'utilisateur API
  → l'AD est découverte via le service **Limits** (`scripts/_oci.mjs`), et le budget se crée à la main
  dans la Console (ou après ajout de la policy IAM).

## Alternatives écartées

- **ARM Ampere A1 (Always Free)** : casse Windows (pas d'ARM) et impose de réécrire tous les
  installeurs de cours en arm64. Écarté au profit de x86 AMD Flex (parité).
- **Terraform / SDK OCI** : même raisonnement qu'[ADR 0002](0002-provisioning-api-directe-vs-terraform.md)
  (API REST directe, pas de runtime lourd dans le Worker).
- **GitHub Actions comme planificateur** : essayé (compte git.swiss plafonné à 5 crons) mais les runs
  planifiés sont throttlés (plusieurs heures) → abandonné. **Déménagement sur le compte satom.ch** avec
  cron natif `*/2` retenu.
