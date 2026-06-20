-- 0009 — Respecter un arrêt manuel : une VM planifiée arrêtée à la main par
-- l'utilisateur est mise en PAUSE (le planning ne la rallume pas tant que
-- l'utilisateur ne reprend pas / ne la redémarre pas). 100 % additif.

ALTER TABLE vm_requests ADD COLUMN schedule_paused INTEGER NOT NULL DEFAULT 0;
