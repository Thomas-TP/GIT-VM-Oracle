-- 0015 — Restauration : créer une VM à partir d'un snapshot existant. 100 % additif.
-- On stocke l'OS d'origine sur le snapshot (pour la connexion SSH/RDP après restauration).

ALTER TABLE snapshots ADD COLUMN os TEXT;
ALTER TABLE vm_requests ADD COLUMN restore_snapshot_id INTEGER;
