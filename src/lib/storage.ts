export interface StorageRecord {
  id: string;
  ownerHash: string;
  recipientHash: string | null;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
}

export interface InboxRecord {
  ownerDid: string;
  alias: string;
  hashedId: string;
  createdAt: string;
}

export async function saveStorageRecord(db: D1Database, record: StorageRecord) {
  return db
    .prepare(
      "INSERT INTO storage_records (id, owner_hash, recipient_hash, size_bytes, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(
      record.id,
      record.ownerHash,
      record.recipientHash,
      record.sizeBytes,
      record.createdAt,
      record.expiresAt
    )
    .run();
}

export async function saveInbox(db: D1Database, inbox: InboxRecord) {
  return db
    .prepare(
      "INSERT INTO inboxes (owner_did, alias, hashed_id, created_at) VALUES (?, ?, ?, ?)"
    )
    .bind(inbox.ownerDid, inbox.alias, inbox.hashedId, inbox.createdAt)
    .run();
}

export async function getInboxes(db: D1Database, ownerDid: string): Promise<InboxRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM inboxes WHERE owner_did = ?")
    .bind(ownerDid)
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
