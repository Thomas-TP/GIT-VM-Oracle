# ADR 0007 — Catalogue d'OS élargi + support Windows (RDP)

**Statut** : Acté (2026-06-19)

## Contexte

La page de création n'offrait que 3 systèmes (Ubuntu 24.04, Ubuntu 22.04 — doublon perçu — et
Debian 12) et passait par une **modale** peu lisible. Demande produit : refonte en **pages dédiées**
(« Mes VM » + « Créer une VM »), catalogue d'OS diversifié (dont **Windows**), et **procédures de
connexion** (MobaXterm, Termius) intégrées au portail.

Contraintes techniques découvertes :
- Le pipeline existant = **SSH + clé RSA** ; le security list n'ouvre que **tcp/22**.
- **Termius** ne gère **que SSH** (pas de RDP) ; MobaXterm gère SSH **et** RDP.
- Les secrets OCI vivent dans Cloudflare → AMIs vérifiés via `scripts/oci-images.mjs`
  (DescribeImages, lecture seule) plutôt que devinés.

## Décision

1. **Catalogue d'OS** (AMI concrets `eu-zurich-1`, vérifiés) : Ubuntu 24.04 LTS (par défaut),
   Debian 12, **Oracle Linux 9**, **Rocky Linux 9**, **AlmaLinux 9**, **Windows Server 2022**.
   Ubuntu 22.04 conservé **masqué** (`hidden`) pour résoudre les demandes existantes sans l'afficher.
   Fedora écarté (aucune AMI publiée par le Fedora Project dans la région).
2. **Windows = RDP**, pas SSH : mot de passe Administrateur **généré au provisioning**, injecté via
   **UserData (cloudbase-init)**, stocké **chiffré AES-GCM** (même mécanisme que les clés SSH, cf.
   [ADR 0006](0006-gestion-des-secrets.md)), révélé au seul propriétaire/admin via une route auditée.
3. **Guide de connexion adaptatif** dans le détail de la VM : SSH → MobaXterm / Termius / Terminal ;
   RDP → MobaXterm / Bureau à distance (Termius explicitement marqué non supporté).
4. **AMIs concrets** (pas `resolve:ssm`) → conserve le chemin `DescribeImages rootDeviceName`
   existant ; aucune dépendance à la permission `ssm:GetParameters`.
5. Schéma **100 % additif** (migration 0006 : `vms.connect_method`, `vms.admin_password`).

## Conséquences

- (+) Choix d'OS large et **réellement provisionnables** (AMIs vérifiés, pas inventés).
- (+) Windows fonctionne sans dépendre du déchiffrement `GetPasswordData` (infaisable dans un Worker :
  WebCrypto ne fait pas de RSAES-PKCS1-v1_5).
- (+) Le chemin Linux existant **n'est pas modifié** (mêmes AMIs, même flux SSH).
- (−) **RDP nécessite d'ouvrir tcp/3389** sur le security list partagé. Exposition `0.0.0.0/0`
  acceptée pour la démo, **à restreindre** à une plage IP GIT en production (port ouvert via
  `scripts/oci-setup.mjs`, idempotent). Les hôtes Linux partagent ce SG mais n'écoutent pas sur 3389.
- (−) La migration 0006 doit être appliquée **avant** le déploiement (le code lit `connect_method` /
  `admin_password`) — voir runbook.

## Alternatives écartées

- **`resolve:ssm` pour les AMIs** : élégant (toujours à jour) mais ajoute une dépendance à
  `ssm:GetParameters` et casse le chemin `DescribeImages` ; AMIs concrets préférés pour la fiabilité démo.
- **Mot de passe Windows via `GetPasswordData`** : nécessite un déchiffrement RSA PKCS#1 v1.5
  indisponible dans WebCrypto → injection par UserData retenue.
- **Modale de création conservée** : rejetée (lisibilité, place pour toutes les options).
