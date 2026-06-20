-- 0012 — Suivi de l'installation des outils de cours : la VM appelle le portail
-- quand cloud-init a fini (course_ready_at posé). 100 % additif.

ALTER TABLE vm_requests ADD COLUMN course_ready_at TEXT;
