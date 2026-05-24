# Group Communication Design on didbox402

**Status:** Draft (Exploratory / Future Direction)  
**Target:** Post v0.7.0 (client-side pattern today; potential protocol extensions later)  
**Related Documents:**
- [PROTOCOL.md](../PROTOCOL.md) – Inboxes (§5.4)
- [v0.7.0 Sovereign Mobility – Phase 1](v070-sovereign-mobility-phase1.md)
- [Client SDK Migration Design](v070-client-sdk-migration.md)
- [TESTING.md](../../TESTING.md)

---

## 1. Overview

This document describes a **client-side design pattern** for enabling secure, attributable group communication on top of the existing didbox402 protocol (v0.7.0 and later), without requiring any changes to the server or the core protocol.

The goal is to allow a group of people or autonomous agents to communicate through shared storage (inboxes) while preserving:

- **Cryptographic Sovereignty** — The server never sees plaintext or holds any decryption keys.
- **Individual Provenance** — Every message is verifiably authored by a specific DID.
- **Fair Economics** — The sender of a message pays for its storage using the standard prepaid lease model.
- **Ephemerality** — Messages naturally expire unless re-stored.

---

## 2. Core Idea

**Each participant uses their own DID for signing, while the group shares a symmetric encryption key.**

- Every member has their own Decentralized Identifier (`did:key`) and corresponding signing key.
- The group shares **one secret symmetric key** (e.g., AES-256-GCM) used only for encryption.
- When sending:
  1. Sign the message with your personal DID.
  2. Encrypt the signed message with the group key.
  3. Store the ciphertext via `POST /store` using the group’s `inboxAlias`.
  4. **You pay** for the storage lease (size × duration).

This pattern requires **zero server-side changes**. It works entirely with the existing `/store`, `/retrieve`, and inbox mechanisms defined in v0.7.0.

---

## 3. Message Structure

```json
{
  "version": 1,
  "group_id": "team-alpha-2026",
  "timestamp": "2026-05-15T14:32:00.000Z",
  "sender_did": "did:key:z6MkAlice...",
  "sender_signature": "<hex-ed25519-signature>",
  "content": "Here is the updated strategy document..."
}
```

**Signing scope** (recommended):
- The `sender_signature` covers a canonicalized form of `group_id + timestamp + content`.

**Encryption**:
- The entire JSON object above is encrypted using the shared group symmetric key.

The resulting ciphertext is what gets stored on the node.

---

## 4. Sending Flow (Sender Pays)

1. **Prepare message**
   - Construct the JSON object above.
   - Sign it with your personal private key.
   - Encrypt it with the current group key.

2. **Store**
   - Call `POST /store` with:
     - `inboxAlias`: the group’s shared alias (e.g., `"team-alpha"`)
     - `ciphertext`: the encrypted blob
     - `durationHours`: chosen by the sender

3. **Payment**
   - The sender receives the normal `402 Payment Required` challenge.
   - The sender pays using L402 or x402.
   - The `owner_hash` recorded on the server is the sender’s DID (not the group’s).

This model is already fully supported by the v0.7.0 protocol.

---

## 5. Receiving & Verification Flow

Any group member who possesses the current group encryption key can:

1. Retrieve messages from the shared inbox (using `X-Inbox-Alias` or the inbox endpoint).
2. Decrypt the blob using the group key.
3. Verify the `sender_signature` against the `sender_did` using the sender’s public key (extracted from the DID).
4. Now has cryptographic proof of authorship.

---

## 6. Key Management (Client-Side Only)

### 6.1 Initial Group Creation
- One member generates a strong symmetric group key.
- They create the group inbox (paying any `inbox_creation_fee` if required).
- They distribute the group key to other members, encrypted to each member’s DID (via DIDComm, another inbox, or out-of-band).

### 6.2 Member Joins
- New member receives the current group key encrypted to their DID.
- They can immediately read existing messages and send new ones.

### 6.3 Member Leaves / Key Rotation
- The group generates a new symmetric key.
- The new key is distributed only to remaining members.
- Old messages remain readable with the old key (acceptable for most use cases).
- If forward secrecy is required, the group can re-encrypt important historical messages with the new key.

All of this happens client-side. The server is never involved in key distribution or rotation.

---

## 7. Economics & Lease Ownership

- **Storage cost**: Paid by the sender at the time of posting (`size × duration`).
- **Inbox creation fee** (if charged): Paid by whoever first creates the group inbox.
- **Lease extension**: Can be done by the original sender or by any group member who knows the storage ID (they would pay for the extension).
- **Ownership on the server**: The `owner_hash` is always the DID that performed the `POST /store`. This is acceptable — the group treats the inbox as a shared view rather than a single owner.

This keeps incentives aligned: people pay for the messages they contribute to the group.

---

## 8. Interaction with Existing Protocol Features

### Sovereign Mobility (v0.7.0)
- Any group member can use `getMigrationProof()` + `migrate()` to move the group’s messages to another node.
- They only need the storage IDs and the ability to sign as the original sender (or coordinate with the original sender).

### Inboxes
- The group uses a single named inbox alias (e.g., `"team-alpha"`).
- Multiple senders naturally write to the same alias.
- Readers fetch using `X-Inbox-Alias`.

### Privacy
- The server sees only encrypted blobs and individual DIDs.
- It cannot determine group membership or message content.
- This satisfies the strongest interpretation of the didbox402 privacy model.

---

## 9. Security Properties

| Property                    | Guarantee                                      | Notes |
|----------------------------|------------------------------------------------|-------|
| Server blindness           | Full                                           | Server sees only ciphertext |
| Individual authorship      | Cryptographically provable                     | Via per-DID signatures |
| Forward secrecy on rotation| Optional (requires re-encryption)              | Client choice |
| Group membership privacy   | Strong                                         | Not visible to the server |
| Message integrity          | Strong                                         | Signatures + encryption |

---

## 10. Implementation Recommendations

This pattern is best implemented as a **higher-level SDK layer** rather than being baked into the core `@didbox/sdk-core`.

Suggested structure:

- `@didbox/sdk-group` (new package, future)
  - `GroupClient`
  - `createGroup()`, `joinGroup()`, `sendMessage()`, `getMessages()`
  - Key management helpers
  - Integration with `DidBoxClient`

Until such a package exists, implementers can build this pattern directly on top of the existing `DidBoxClient` + `@didbox/sdk-crypto`.

---

## 11. Limitations & Open Questions

- **Lease ownership & deletion**: Currently, only the original sender (or someone who can act as them) can easily extend or delete a message. Group-level deletion would require coordination.
- **Spam / abuse**: A malicious group member can still post large or expensive messages that the group has to pay for. Social or cryptographic rate-limiting may be needed at the application layer.
- **Key distribution protocol**: This design assumes some out-of-band or DIDComm-based key distribution. A standardized way to do this inside didbox402 inboxes would be valuable.
- **Read receipts / presence**: Not addressed by this design (would require additional messages or a separate presence mechanism).

---

## 12. Relation to Future Work

This design is intended as a **client-side pattern** that can be used immediately with v0.7.0.

It may inform future protocol extensions, such as:
- Native “Group Inbox” types
- Capability-based shared storage
- Standardized group key distribution via inboxes

For now, the recommendation is to keep the protocol surface small and push group semantics into the client/agent layer.

---

**Conclusion**

Group communication on didbox402 does **not** require server-side changes. By combining:

- Personal DIDs for signing (provenance)
- A shared symmetric group key (confidentiality)
- The existing prepaid `/store` model (economics)

…we can achieve secure, attributable, and economically fair group communication while preserving the core principle that **the server never sees anything**.

This approach keeps didbox402 simple and sovereign while enabling powerful collaborative use cases for both humans and autonomous agents.