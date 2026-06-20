-- 0010 — Notifications in-app (cloche). Le texte est rendu côté client à partir
-- du `type` (i18n FR/EN), `link` pointe vers la ressource concernée.

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL,
  type       TEXT NOT NULL,
  link       TEXT,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_email, read, created_at);
