# Deletion Semantics, Attestations, and Client-Side Resilience

**Status:** Draft (Exploratory / Guidance)  
**Added:** Post v0.7.0 (documentation & guidance refresh)  
**Target:** v0.8+ consideration + immediate client pattern documentation  
**Related:**  
- [PROTOCOL.md](../PROTOCOL.md) §1.2 (Ephemerality), §4.4 (Payment Replay), §10.2 (Security Requirements)  
- [Threat Model](../threat-model.html)  
- [Group Communication Design](group-communication-design.md)  
- [Client Patterns](#client-patterns) (this document seeds that section)

---

## 1. The Fundamental Limit

Once a client hands ciphertext to a didbox402 node, the node (or any party who can read its storage backend) can make a copy. There is no cryptographic mechanism that can force an arbitrary remote host to forget bytes it has seen.

This is not a flaw in didbox402 — it is a fundamental property of giving data to an untrusted party for storage. Any system that claims "we can prove we deleted your data" after you have given them a usable copy is either:

- Using trusted hardware / confidential computing (TEE) that the client must still trust, or
- Using legal/compliance language that does not correspond to technical reality, or
- Lying.

**didbox402 makes no such claim.** The protocol requires best-effort timely deletion on lease expiry (or explicit client delete), but deletion is an operational obligation, not a verifiable cryptographic event.

---

## 2. Remaining Trust Boundaries

Provider trust does not disappear. A malicious or negligent operator can still:

- Fail to purge ciphertext on time (or at all)
- Retain copies for later use, sale, or under legal compulsion
- Make false claims about having performed deletion

The didbox402 model narrows the scope of what must be trusted to the following known properties:

- The provider never receives decryption keys and never sees plaintext (client-side encryption is mandatory).
- Historical data can only become readable after the client has discarded its keys if the client itself previously leaked the plaintext or keys.
- Sovereign Mobility (client-orchestrated migration using signed proofs) allows the data owner to move a lease to another provider without the original node's cooperation.
- Client-side redundancy patterns (such as the mirroring approach described in Section 4) can be used to reduce reliance on any single provider's deletion behavior.

The remaining trust obligation on the provider is narrow and explicit: the provider is expected to stop serving (and best-effort delete) the ciphertext bytes after the lease `expires_at`, subject to its operational practices and reputation incentives.

No technical mechanism in the current protocol allows a client to obtain cryptographic proof that deletion has occurred on an untrusted host.

---

## 3. Practical Approaches to Deletion Accountability

Here are the realistic options, from most immediately usable to more ambitious:

### 3.1 Client-Side Redundancy & Mirroring (Primary Recommendation Today)

The most robust protection against lease expiry surprises or provider failure to delete/purge is for clients to maintain their own copies of important data.

See Section 4 for the detailed mirroring pattern, especially valuable for group conversations and agent handoff threads.

### 3.2 Signed Purge Attestations (Accountability Layer)

A node can periodically (or on-demand) emit a signed statement:

> "As of ISO timestamp T, I have purged all leases whose `expires_at` ≤ T-Δ for the following storage IDs (or a Merkle root / range commitment)."

The statement is signed with the node's `node_identity` Ed25519 key (the same key used for Migration Authorizations).

**Properties:**
- Provides non-repudiation: the node cannot later deny that it claimed to have deleted the data.
- Clients, auditors, or reputation services can verify the signature against the published `node_identity`.
- Does **not** prove that the bytes are actually gone from every backup, snapshot, or log the operator may have.
- Still useful for reputation systems, insurance, and dispute resolution.

This can be implemented entirely out-of-band (operator publishes attestations to a log or on-chain) or as a future optional protocol extension (new endpoint or response header).

### 3.3 Economic Mechanisms (Bonding / Slashing)

Providers post a bond (on-chain or with a trusted third party). Clients who can demonstrate (via Migration Proofs + later evidence that data was still retrievable after expiry from the same provider) can trigger a slash.

This moves part of the enforcement into economic incentives. It requires an arbitration or oracle layer and is complex, but viable for high-value commercial providers.

### 3.4 Heavy Cryptographic Techniques (Future / High-Assurance Only)

- Deletion inside a TEE with remote attestation that the client verifies.
- Zero-knowledge proofs that a storage system no longer contains a record for a given ciphertext hash.
- Time-locked encryption where the client only ever gave the server material that becomes useless after a certain date without client action.

These are heavyweight, add latency/cost, and still ultimately require trusting the TEE manufacturer or the ZK circuit. They are appropriate only for the highest-stakes use cases and are out of scope for the core didbox402 protocol in the near term.

---

## 4. Recommended Client Pattern: Conversation / Thread Mirroring

This pattern is **purely client-side** and requires no protocol or server changes. It is the strongest practical defense against both "provider failed to delete" and "lease expired and the last copy was lost."

### Use Cases
- Group conversations (multiple DIDs writing to a shared inbox alias)
- Long-running agent-to-agent handoff threads
- Any data the participants consider worth preserving beyond a single lease

### Pattern

1. **Shared "live" inbox** (as described in the Group Communication Design)
   - Participants write messages to a common `inboxAlias` (e.g., `"team-alpha-strategy"`).
   - Each message is signed by the sender's personal DID and encrypted with the group symmetric key.
   - The sender of each message pays for its storage lease.

2. **Per-participant archive copies** (the new resilience step)
   - On successful send (or periodically for readers), each participant also stores a copy of the message (or a batch of recent messages) into one of *their own* inboxes under a private archive alias (e.g., `"archive:team-alpha-strategy"` or `"personal:group-2026-05"`).
   - The participant pays for their own archive copy using their own DID.
   - Archive leases can be longer (or auto-extended by the client on a schedule).

3. **Reconciliation / recovery**
   - When a participant comes back online or detects a gap, they:
     - Fetch from the shared group inbox (what the provider currently has).
     - Cross-check / merge with their personal archive.
     - Re-store any missing messages back into the group inbox (paying fresh leases) if desired.
   - Because every message carries the original sender's DID signature, provenance is preserved even across archives.

### Benefits
- No single lease expiry can destroy the conversation.
- A provider that fails to delete the "live" copy still only has what was mirrored; the participants control the authoritative copies in their own archives.
- Migration becomes per-participant: anyone can move their archive (and, with coordination, help repopulate a new group inbox on a different node).
- Works today with v0.7.0.

### Trade-offs & Recommendations
- **Storage cost**: Roughly 2× (or N× for N participants who all mirror) the live cost. Acceptable for high-value threads; clients should offer "mirror level" settings (none / sender-only / all participants / designated archivist).
- **Consistency**: Last-writer-wins or vector-clock merging is an application-level concern on top of the encrypted blobs.
- **Key rotation**: When the group rotates the symmetric key, new archive copies should be made with the new key for forward secrecy. Old archives remain readable with the old key (documented acceptable trade-off in the group design).

SDKs should make this pattern easy:
- `mirrorToArchive(message, myArchiveAlias, durationHours)`
- Background reconciliation helpers
- "Archive this thread" convenience methods for group clients

---

## 5. Optional Future Protocol Extension Sketch: Purge Attestation Endpoint

If the ecosystem wants stronger accountability, a future minor version could add:

```
GET /purge-attestation?since=...&until=...
```

Returns a signed object (using the node's Ed25519 identity key) containing:

- Time window
- Count or Merkle root of purged storage records in that window
- Signature over the canonical form

Clients and auditors can verify these independently.

This is **not required** for v0.7.x or v0.8. It can remain an operator best practice (publish attestations to a public log) until there is clear demand.

---

## 6. Implications & Recommendations

- **Protocol**: No normative change required today. The existing "best-effort purge on expiry" obligation in PROTOCOL.md §1.2 and §10.2 remains the bar. Future work may define an optional attestation format.
- **Client SDKs**: Highest leverage area. Make mirroring, archive management, and lease-extension reminders first-class conveniences. This is where the real resilience lives.
- **Node implementers**: Document your actual purge cadence and retention behavior clearly. Consider emitting signed attestations even before a protocol extension exists (great differentiator for serious providers).
- **Threat model**: We should add a short note cross-referencing this document so readers understand both the limitation and the practical mitigations.

---

**Conclusion**

didbox402 deliberately keeps deletion as an operational + reputational obligation rather than pretending it can be cryptographically enforced after the client has surrendered the bytes. This is honest.

The compensating strengths — client-side encryption, easy migration, narrow trust, and especially client-controlled redundancy — make the overall system more trustworthy for privacy-sensitive agent communication than the vast majority of current "ephemeral" storage solutions that simply ask users to trust a company.

The primary defense is and should remain **thoughtful client architecture**, of which conversation mirroring is a powerful and immediately usable example.

---

*Version note: This design document captures thinking as of 2026-05. It may be promoted to a normative or strongly-recommended client pattern in a future revision of the protocol documentation.*