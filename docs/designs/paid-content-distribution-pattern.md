# Privacy-Preserving Paid Content Distribution

**Status:** Draft  
**Added:** Post v0.7.0 (documentation & guidance refresh)  
**Target:** Guidance for creators, independent publishers, and commercial platforms  
**Related Documents:**
- [Deletion Semantics and Client-Side Resilience](deletion-semantics-client-resilience.md)
- [Group Communication Design](group-communication-design.md)
- [Extensions](https://docs.didbox402.org/extensions.html)

---

## 1. The Core Idea

This pattern allows creators and publishers to monetize high-value digital content while preserving strong privacy for both the seller and the buyer.

**The model is simple:**

- The **economic transaction** (payment) happens directly between the buyer and the seller, outside of didbox402.
- The **distribution** of the encrypted content happens through didbox402.

This separation keeps the storage provider in its intended role as a neutral, privacy-preserving utility rather than turning it into a financial intermediary or marketplace operator.

---

## 2. Why This Model Aligns with didbox402 Principles

didbox402 was designed around a small set of strong principles:

- The provider should be a **"ghost"** — it holds no decryption keys and learns as little as possible about the content or the parties involved.
- Identity is protected through **salted hashing**. The storage layer should not build graphs of who is communicating with or paying whom.
- The protocol handles **micropayments for storage**, not general-purpose commerce or revenue splitting.

When a storage node is asked to receive money on behalf of a content creator and then forward the remainder (minus a platform fee), it is forced into a role that requires it to track economic relationships. This conflicts with the anonymity and minimal-knowledge goals of the protocol.

By moving the actual payment outside the protocol, we keep the didbox node focused on what it does best: storing and delivering encrypted blobs under time-bound leases with strong privacy guarantees.

---

## 3. The Recommended Pattern

1. **Content Preparation**  
   The seller encrypts the content client-side using a strong symmetric key (e.g., AES-256-GCM).

2. **Storage**  
   The encrypted content is stored in didbox402 (either by the seller or by a platform acting on their behalf). The seller pays for the storage lease using the normal protocol mechanisms.

3. **Payment**  
   The buyer pays the seller directly using their preferred method (Lightning, USDC on Base or Solana, bank transfer, etc.). This payment is completely outside didbox402.

4. **Delivery**  
   After the seller confirms payment, they deliver:
   - The `storageId` (or inbox reference)
   - The decryption key

   Key delivery can happen through another didbox, DIDComm, email, or any other private channel the parties agree on.

5. **Access**  
   The buyer retrieves the ciphertext from didbox402 using normal authenticated requests and decrypts it locally.

This pattern can be made more robust using the client-side mirroring and archive techniques described in the [Deletion Semantics and Client-Side Resilience](deletion-semantics-client-resilience.md) document.

---

## 4. Uplifting, Legal Use Cases

The following examples illustrate legitimate, high-value applications of this pattern:

### Independent Journalism and Research

An independent investigative journalist or small research organization produces a detailed report or analysis. Readers who want access pay the journalist or research group directly (for example via Lightning or USDC). After payment is received, the creator provides the storage reference and decryption key. The storage provider never learns who is reading the report or the financial relationship between the journalist and their readers.

This model supports independent voices without forcing creators to route payments through large platforms that take significant cuts and log reader behavior.

### Professional Knowledge and Playbooks

Specialized professionals (lawyers, consultants, operators, engineers) create high-signal playbooks, templates, methodologies, or due diligence packages. Buyers pay the expert directly. The materials are delivered privately through didbox402 so that even the storage infrastructure cannot see who is accessing which professional resources.

### Research Datasets and Methodologies

Academic groups, independent researchers, or small labs sell access to valuable (but legal) datasets or proprietary analysis methods. Paying researchers or companies receive the encrypted data through didbox402 after settling payment directly with the creators. This allows direct monetization while keeping the identities of the buyers private from the storage layer.

### Creative and Design Assets

Independent artists, designers, and studios sell high-resolution files, 3D models, music stems, or design packages. The buyer pays the creator directly, and the large encrypted files are delivered via didbox402. This gives creators better economics than most traditional platforms while protecting buyer privacy.

---

## 5. Benefits of This Approach

- **Stronger anonymity for both parties** — The storage provider does not become a witness to the financial transaction.
- **Simpler legal posture for node operators** — Operators are only providing paid storage, not acting as payment processors or marketplaces.
- **Better economics for creators** — No mandatory platform cut at the storage layer.
- **Flexibility** — Buyers and sellers can use whatever payment method they prefer, including privacy-preserving options.
- **Alignment with the protocol** — The node stays a commodity utility rather than a marketplace.

---

## 6. Implementation Notes

- This pattern works with didbox402 today (v0.7.0 and later) with no protocol changes required.
- Sellers should consider using the client-side mirroring techniques so that important paid content is not lost if a lease expires.
- For higher-volume or more automated scenarios, a lightweight platform layer can sit on top of didbox402 to help with discovery, invoice generation, and key delivery — while still keeping actual payments outside the storage node.
- Key distribution remains an out-of-band concern by design. This is a feature for privacy, not a limitation.

---

## 7. Relationship to Other Patterns

This distribution model pairs naturally with several other didbox402 patterns:

- **Client-side resilience and mirroring** — Protects paid content from lease expiry.
- **Group communication** — Can be used when a seller wants to deliver the same content to a small trusted group while maintaining individual provenance.
- **Sovereign mobility** — Allows creators to move their content between storage providers without lock-in.

---

**Conclusion**

By keeping the payment relationship outside of didbox402 and using the protocol only for private, paid distribution of encrypted content, creators and buyers can achieve strong privacy while node operators remain simple, neutral storage providers.

This approach is fully compatible with the current protocol and represents one of the most natural ways to build legitimate, privacy-respecting paid content experiences on top of didbox402.

---

*This document describes a client- and platform-level pattern. It does not propose changes to the didbox402 protocol itself.*