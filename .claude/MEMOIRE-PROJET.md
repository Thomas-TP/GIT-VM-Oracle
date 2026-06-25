# Mémoire projet — GIT VM Portal

> Faits durables non déductibles du seul code. Pour l'équipe et la continuité de l'assistance IA.
> Tenir à jour. Dernière màj : 2026-06-20.

## Identité
- **Projet** : plateforme self-service de provisioning de VM pour le Geneva Institute of Technology (GIT).
- **Prod** : `https://git-vm-oracle.satom-openstack.workers.dev` · **Repo** : `https://github.com/Thomas-TP/GIT-VM`.
- Contexte canonique : [`AGENTS.md`](../AGENTS.md).

## Décisions structurantes
- **Stack = OCI Compute + Cloudflare Workers + D1** (socle ADR 0001, bascule OCI [ADR 0010]). On ne réécrit pas l'archi.
- Toute logique de cycle de vie passe par le **réconciliateur cron** (ADR 0004).
- À l'échéance, la VM est **supprimée** (terminate), pas seulement arrêtée (ADR 0008).
- Ansible via cloud-init `ansible-pull` (ADR 0003). IaC : API OCI directe + Terraform de référence (ADR 0002).
- Secrets via Wrangler Secrets + chiffrement AES-GCM au repos (ADR 0006).
- Catalogue **Free-Tier uniquement** (compte OCI restreint) + Windows en RDP (ADR 0007).

## État connu (2026-06-20)
- **Login OIDC Entra fonctionnel.**
- Déploiement via **Cloudflare Workers Builds** (push sur `main` → migrate + deploy). Pas la CI GitHub.
- Points forts : OIDC propre, clé/mot de passe chiffrés AES-GCM par VM, réconciliateur idempotent,
  planification auto start/stop, prolongation avec validation admin, notifications, audit log, i18n.

## Préférences de travail (équipe)
- **Ne rien casser** de l'existant fonctionnel ; ajouter et corriger, pas réécrire.
- Attendu de l'assistance : analyser, proposer, optimiser, corriger, recommander — puis exécuter.
- Documentation et ADR en **français**.
- Livraison par **PR** mergées sur `main` (déploiement auto Cloudflare), branches supprimées ensuite.
