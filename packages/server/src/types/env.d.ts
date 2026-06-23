export interface Env {
  STORAGE_BUCKET: R2Bucket;
  DB: D1Database;
  SERVICE_SALT: string;
  BASE_RATE_PER_MB_HOUR: string; // Satoshis
  EGRESS_RATE_PER_MB: string;     // Satoshis
  INBOX_CREATION_FEE: string;    // Satoshis
  DEV_MODE: string;              // "true" or "false"
  ADMIN_TOKEN: string;           // Secret for Janitor
  MIN_CHARGE_MB?: string;        // Operator-configured billing floor (default 1)
  PRICING_MODE?: string;         // "public" (default) or "authenticated"
  BILLING_MODE?: string;         // "micropayment" (default) or "entitlement"
  ENTITLEMENT_KEY_HASHES?: string; // "id:sha256hex,id2:sha256hex"
  NODE_DID?: string;             // Optional node identity
  NODE_SIGNING_PRIVATE_KEY?: string;
}
