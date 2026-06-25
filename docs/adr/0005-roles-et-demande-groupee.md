# ADR 0005 — Rôle formateur + demande groupée

**Statut** : Acté (2026-06-19)

## Contexte

Must M5 : « rôle formateur : demande groupée de N machines identiques pour un cours ». Le modèle
actuel n'a que `member`/`admin` et des demandes unitaires.

## Décision

- Ajouter le rôle **`trainer`** (3 rôles : `member` / `trainer` / `admin`), dérivé d'une liste
  `TRAINER_EMAILS` (var Wrangler) — extensible plus tard à un **groupe Entra** (claim `roles`/`groups`).
- Le formateur remplit **un** formulaire (template + dates + **quantité N** + nom du cours) → le
  Worker crée **N `vm_requests`** partageant un **`group_id`** (UUID) et un `course`.
- Vue admin/validateur : demandes **groupées par `group_id`** ; approbation/refus possible par lot.

## Justification

- `group_id` est le minimum qui relie N VM sans complexifier le schéma.
- Dériver le rôle d'une **liste d'emails** est trivial à mettre en place pour la démo, tout en
  gardant la porte ouverte aux groupes Entra (parcours « pro » documenté).

## Conséquences

- (+) Couvre M5 et prépare l'isolation **par classe** (un `group_id` = une classe = un security list, voir roadmap D8).
- (+) Le dashboard coûts par cours (S1) s'appuie naturellement sur `group_id`/`course`.
- (−) Approbation par lot = penser à l'idempotence (réutiliser le réconciliateur pour le provisioning des N).
- (−) Garde-fou : plafonner N (ex. ≤ 30) pour éviter de saturer le quota OCI pendant la démo.

## Alternatives écartées

- **Table `groups` dédiée** : plus propre mais plus lourde ; `group_id` sur `vm_requests` suffit au périmètre.
- **Rôles 100 % Entra dès maintenant** : dépend de la config du tenant (incertaine) → risque sur la démo.
