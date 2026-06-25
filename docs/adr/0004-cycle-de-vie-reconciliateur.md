# ADR 0004 — Cycle de vie (dates + extinction à l'échéance) via le réconciliateur

> ⛔ **Partiellement remplacé par [ADR 0008](0008-suppression-auto-a-l-echeance.md)** (2026-06-19) :
> la décision *« arrêter (stop) à l'échéance »* est annulée — à l'échéance la VM est désormais
> **supprimée (terminate)**. Le reste de cet ADR (dates obligatoires, pattern réconciliateur,
> email de pré-échéance, stockage UTC) **reste valide**.

**Statut** : Acté (2026-06-19) · **révise la 1ʳᵉ version (auto-destruction)** suite à décision équipe

## Contexte

Must M3 (date de fin obligatoire). Le cahier demande aussi la **destruction** automatique à
l'échéance (M8). **Décision de l'équipe : ne PAS détruire les VM à l'échéance** (préserver le
travail des étudiants). Le projet a déjà un **réconciliateur cron** (`*/2 min`).

## Décision

- Ajouter `start_date` et `end_date` (**NOT NULL**) à `vm_requests` (migration `0005`).
- À l'échéance, **arrêter (stop) la VM** au lieu de la détruire, via le réconciliateur :
  - `end_date < now()` → `stopInstance` + statut `expired` + email,
  - `end_date - now() < 24h` → email « échéance proche » (une fois).
- **Pas de terminate automatique.** La destruction reste **manuelle** (bouton existant).
- (Optionnel) extinction nuit/week-end via stop, comme garde-fou coûts complémentaire.

## Justification

- L'auto-**stop** ramène le coût compute à ≈ 0 (seul l'Block Volume reste facturé) tout en **préservant les
  données** → répond à l'exigence métier *coûts* sans perte de travail.
- Réutilise le pattern réconciliateur existant → effort et risque minimaux.

## ⚠️ Risque & mitigation (Must M8)

Le cahier exige la *destruction* automatique. Choisir le *stop* est un **écart à un Must** :
- **Mitiger** : le justifier explicitement au client (« nous arrêtons pour préserver le travail ;
  la destruction reste possible »), et **pouvoir activer le terminate pour la démo** si le client
  l'exige (un simple flag `AUTO_TERMINATE`). À trancher avant la démo.

## Conséquences

- (+) « Aucune machine sans date de fin » garanti côté serveur ; coût compute borné.
- (+) Pas de perte de données accidentelle.
- (−) Le stockage Block Volume des VM expirées continue d'être facturé (faible) → prévoir une purge manuelle/règle.
- (−) Écart documenté au Must M8 (voir ci-dessus).
- Stocker les dates en **UTC**, convertir à l'affichage.

## Alternatives écartées

- **Destruction automatique** (cahier) : écartée par décision équipe (perte de travail).
- **Rien à l'échéance** (date purement informative) : ne contrôle pas les coûts, vide le sens de la date de fin.
