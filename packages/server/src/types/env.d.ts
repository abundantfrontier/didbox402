export interface Env {
  STORAGE_BUCKET: R2Bucket;
  DB: D1Database;
  SERVICE_SALT: string;
  BASE_RATE_PER_MB_HOUR: string; // Satoshis
  EGRESS_RATE_PER_MB: string;     // Satoshis
  INBOX_CREATION_FEE: string;    // Satoshis
  DEV_MODE: string;              // "true" or "false"
  ADMIN_TOKEN: string;           // Secret for Janitor
}
