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

CREATE TABLE IF NOT EXISTS nonces (
  signature TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_owner_hash ON storage_records(owner_hash);
CREATE INDEX IF NOT EXISTS idx_recipient_hash ON storage_records(recipient_hash);
CREATE INDEX IF NOT EXISTS idx_expires_at ON storage_records(expires_at);
CREATE INDEX IF NOT EXISTS idx_inboxes_owner ON inboxes(owner_hash);
CREATE INDEX IF NOT EXISTS idx_nonces_expiry ON nonces(expires_at);

-- Payment replay protection (spec 4.4). Servers MUST populate and check this table.
CREATE TABLE IF NOT EXISTS used_payments (
  payment_id TEXT PRIMARY KEY,   -- txHash (0x...) or L402 paymentHash
  rail TEXT NOT NULL,            -- 'L402' | 'x402'
  amount INTEGER NOT NULL,
  used_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_used_payments_expiry ON used_payments(expires_at);
