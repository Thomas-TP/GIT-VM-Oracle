-- Per-target disk exports of a snapshot (VMware / VirtualBox), one row per target per snapshot.
-- Supersedes the single export_* columns on `snapshots` (0016, left dormant).
CREATE TABLE IF NOT EXISTS snapshot_exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  user_email TEXT NOT NULL,
  target TEXT NOT NULL,                 -- vmware | virtualbox
  status TEXT NOT NULL DEFAULT 'running', -- running | ready | error
  s3_key TEXT,
  url TEXT,
  instance_id TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_snapshot_exports_snap ON snapshot_exports(snapshot_id);
