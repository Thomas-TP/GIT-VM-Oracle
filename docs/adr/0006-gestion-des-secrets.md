# ADR 0006 — Gestion des secrets

**Statut** : Acté (2026-06-19)

## Contexte

Should S5 : « gestion des secrets propre (Vault, Ansible Vault…) ». Exigence transverse de
sécurité (critère 20 %). La stack est serverless (pas de serveur où héberger Vault simplement).

## Décision

- Secrets d'exécution (identifiants OCI, secret Entra, `SESSION_SECRET`, clé EmailJS) via
  **Cloudflare Wrangler Secrets** (chiffrés côté plateforme, jamais commités, injectés à l'exécution).
- Données sensibles au repos (**clés privées SSH**) **chiffrées AES-GCM** en DB, clé dérivée de
  `SESSION_SECRET` → une fuite de la base seule ne révèle aucune clé.
- Secrets utilisés par Ansible (le cas échéant) via **Ansible Vault**.

## Justification

- Wrangler Secrets est le **mécanisme natif** de la plateforme : pas de composant à opérer, pas de
  secret en clair dans `wrangler.jsonc` ni dans le repo.
- Le chiffrement applicatif des clés SSH **dépasse** l'attendu (défense en profondeur).
- Déployer HashiCorp Vault serait disproportionné pour une archi serverless à 7 jours.

## Conséquences

- (+) Aucun secret en clair dans le repo ; séparation config publique (`vars`) / secrets.
- (+) Argument sécurité solide en revue.
- (−) Pas de **rotation automatisée** → documenter la procédure manuelle (`wrangler secret put`) dans le runbook.
- (−) `SESSION_SECRET` sert à la fois aux sessions et au chiffrement des clés → sa rotation invalide
  les sessions ET rend les clés stockées illisibles : documenter (re-télécharger la clé après rotation).

## Alternatives écartées

- **HashiCorp Vault** : surdimensionné, serveur à opérer, contre l'archi serverless.
- **Secrets dans des variables d'env. en clair** : inacceptable (fuite via le repo/dashboard).
