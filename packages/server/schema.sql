CREATE TABLE IF NOT EXISTS storage_records (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  recipient_hash TEXT,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inboxes (
  owner_hash TEXT NOT NULL,
  alias TEXT NOT NULL,
  hashed_id TEXT NOT NULL PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_owner_hash ON storage_records(owner_hash);
CREATE INDEX IF NOT EXISTS idx_recipient_hash ON storage_records(recipient_hash);
CREATE INDEX IF NOT EXISTS idx_expires_at ON storage_records(expires_at);
CREATE INDEX IF NOT EXISTS idx_inboxes_owner ON inboxes(owner_hash);
