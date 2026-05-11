export interface StorageRecord {
  id: string;
  owner_hash: string;
  recipient_hash: string | null;
  size_bytes: number;
  created_at: string;
  expires_at: string;
}

export interface InboxRecord {
  owner_hash: string;
  alias: string;
  hashed_id: string;
  created_at: string;
}

export async function saveStorageRecord(db: D1Database, record: StorageRecord) {
  return db
    .prepare(
      "INSERT INTO storage_records (id, owner_hash, recipient_hash, size_bytes, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(
      record.id,
      record.owner_hash,
      record.recipient_hash,
      record.size_bytes,
      record.created_at,
      record.expires_at
    )
    .run();
}

export async function saveInbox(db: D1Database, inbox: InboxRecord) {
  return db
    .prepare(
      "INSERT INTO inboxes (owner_hash, alias, hashed_id, created_at) VALUES (?, ?, ?, ?)"
    )
    .bind(inbox.owner_hash, inbox.alias, inbox.hashed_id, inbox.created_at)
    .run();
}

export async function getInboxes(db: D1Database, ownerHash: string): Promise<InboxRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM inboxes WHERE owner_hash = ?")
    .bind(ownerHash)
    .all();
  return results as unknown as InboxRecord[];
}

export async function getStorageRecord(db: D1Database, id: string): Promise<StorageRecord | null> {
  return db
    .prepare("SELECT * FROM storage_records WHERE id = ?")
    .bind(id)
    .first();
}

export async function updateExpiration(db: D1Database, id: string, newExpiresAt: string) {
  return db
    .prepare("UPDATE storage_records SET expires_at = ? WHERE id = ?")
    .bind(newExpiresAt, id)
    .run();
}

export async function getInboxRecords(db: D1Database, recipientHash: string): Promise<StorageRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM storage_records WHERE recipient_hash = ? AND expires_at > ?")
    .bind(recipientHash, new Date().toISOString())
    .all();
  return results as unknown as StorageRecord[];
}

export async function deleteStorageRecord(db: D1Database, id: string) {
  return db.prepare("DELETE FROM storage_records WHERE id = ?").bind(id).run();
}

export async function getExpiredRecords(db: D1Database, limit: number = 100): Promise<StorageRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM storage_records WHERE expires_at < ? LIMIT ?")
    .bind(new Date().toISOString(), limit)
    .all();
  return results as unknown as StorageRecord[];
}
