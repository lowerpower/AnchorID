# AnchorID Package Signing Specification

**Version:** 0.1 (draft)
**Status:** Working draft — not stable. Section 3 (Assertions) and Section 15 (Non-Warranty) are considered normatively binding on all implementations and SHOULD NOT be weakened by profiles.
**Editor:** Mycal (`urn:uuid:4ff7ed97-b78f-4ae6-9011-5af714ee241c`)
**License:** CC BY-SA 4.0

---

## 1. Scope and Non-Goals

This document specifies how software artifacts are signed under AnchorID identities, how signing authority is delegated from a person or organization to a package, how a package with multiple owners authorizes distinct keys per owner, and precisely what a verifier learns from a valid signature.

### 1.1 In scope

- Identifier format for person, organization, and package identities
- Key lineage: an append-only, self-authenticating chain of key events
- Delegation of signing authority from owner identities to package identities
- Per-owner and per-workflow key partitioning within a single package
- The verification algorithm and its exact output
- Requirements on how verification results are displayed to end users

### 1.2 Explicitly not in scope

This specification does **not** define, and implementations MUST NOT claim it defines:

- Whether an artifact is safe, non-malicious, or fit for any purpose
- Whether a signer is honest, competent, or authorized by any third party
- A naming authority for package names (see §7.2)
- Replacement for platform code-signing (Authenticode, Apple notarization, etc.). AnchorID signatures are an additional, independent layer.

### 1.3 Requirements language

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in RFC 2119.

---

## 2. Terminology

| Term | Definition |
|---|---|
| **AnchorID** | A UUID-based identifier for a subject. Three subject types: `person`, `org`, `package`. |
| **Root key** | An offline key that anchors an identity's lineage. Never used to sign artifacts. |
| **Operational key** | A key authorized to sign artifacts, delegated from a root. |
| **Key event** | A signed, ordered record that adds, revokes, or re-scopes keys, or changes ownership. |
| **Lineage** | The complete ordered chain of key events for one identity. |
| **Owner** | A `person` or `org` AnchorID holding authority over a `package` AnchorID. |
| **Evidence graph** | The set of independently checkable claims associated with an identity. |
| **`identity_confidence`** | A level computed from the evidence graph by a named, versioned policy. Never called "trust." |
| **Transparency log** | An append-only, externally witnessed log of key events and signatures. |

---

## 3. Assertions (Normative)

A successful verification asserts exactly two things, and implementations MUST report them as separate outputs.

**Assertion A — Binding.**
> This artifact was signed by a key that was in package P's authorized key set at time T, and that key was delegated by owner O, who was a current owner of P at time T.

**Assertion B — Record.**
> The evidence graph for O contains the following claims, each independently verifiable by a party that distrusts the AnchorID operator.

Nothing else is asserted. Specifically, a valid signature does **not** assert that the artifact is safe, that the signer is trustworthy, that the package name is legitimate, or that AnchorID has vetted, reviewed, or endorsed anything.

### 3.1 Requirements on implementations

- Implementations MUST expose Assertion A and Assertion B as distinct fields. They MUST NOT be collapsed into a single boolean or a single score in any machine-readable output.
- Implementations MUST NOT use the word "trust," "trusted," "safe," "verified publisher," or equivalents to describe Assertion A alone.
- An implementation that reduces verification to a boolean MUST document which policy performed the reduction and at what level (see §11).

### 3.2 Worked example: valid signature, zero claims

An identity may be created and used to sign within minutes, with no domain, no linked accounts, and no history. Such a signature is cryptographically valid and MUST verify successfully under Assertion A.

```json
{
  "assertion_a": { "bound": true, "package": "urn:uuid:...", "owner": "urn:uuid:...", "signed_at": "2026-08-13T09:14:22Z" },
  "assertion_b": { "claims": [], "identity_confidence": "unverified", "policy": "anchorid-policy-v1" }
}
```

Expected verifier behavior: **treat as equivalent to unsigned.** See §14.2. This case is the primary reason Assertions A and B must remain separate.

---

## 4. Identifiers

### 4.1 Format

All AnchorIDs are URN-form UUIDs: `urn:uuid:4ff7ed97-b78f-4ae6-9011-5af714ee241c`.

- Identifiers MUST be opaque. Implementations MUST NOT parse meaning out of them.
- Identifiers MUST be stable for the life of the subject. A key rotation, an owner change, or a rename MUST NOT change the identifier.
- Human-readable names are claims (§7.2), never identifiers.

### 4.2 Subject types

| Type | Subject | May own packages | May be owned |
|---|---|---|---|
| `person` | A natural person, possibly pseudonymous | Yes | No |
| `org` | A legal entity or an unincorporated group | Yes | No |
| `package` | A software artifact lineage | No | Yes |

### 4.3 Resolution

An AnchorID resolves to a **key document** by one or both of:

1. **Domain anchor.** `https://<anchor-domain>/.well-known/anchorid/<uuid>.json`
2. **DNS anchor.** A `TXT` record at `_anchorid.<anchor-domain>` carrying the root key fingerprint. DNSSEC SHOULD be enabled. The DNS anchor exists so that compromise of the web host alone is insufficient to forge an identity; verifiers SHOULD check both channels and MUST report disagreement as a hard failure.

Verifiers MUST NOT require network access to the AnchorID operator to verify a signature. All material needed for Assertion A MUST be stapled into the bundle (§9.3).

---

## 5. Key Material and Lineage

### 5.1 Root keys

- Every identity MUST have a root key generated offline and held on hardware.
- Root keys MUST NOT sign artifacts. They sign only key events.
- Root keys SHOULD be non-exportable and hardware-attested. Attestation, where available, is a claim in the evidence graph.

### 5.2 Key events

The lineage is an append-only chain. Each event:

```json
{
  "anchorid_spec": "0.1",
  "type": "key_event",
  "subject": "urn:uuid:4ff7ed97-b78f-4ae6-9011-5af714ee241c",
  "seq": 7,
  "prev": "sha256:9f2c...",
  "issued_at": "2026-08-13T09:00:00Z",
  "action": "add_key",
  "key": {
    "keyid": "SHA256:kP3n...",
    "algorithm": "ecdsa-p256",
    "purpose": "sign_artifact",
    "valid_from": "2026-08-13T09:00:00Z",
    "valid_to": null,
    "hardware_backed": true
  }
}
```

Requirements:

- `seq` MUST increment by exactly 1. `prev` MUST be the SHA-256 of the canonical serialization of event `seq - 1`.
- Event `seq: 0` MUST be self-signed by the root key.
- Every subsequent event MUST be signed by the root key, or by a key whose `purpose` includes `sign_key_event` and which was valid at `issued_at`.
- Every key event MUST be submitted to a transparency log (§10) before any key it authorizes is used to sign an artifact.
- A verifier that observes two distinct events with the same `subject` and `seq` MUST treat the identity as **forked** and fail verification with a distinguished error. A fork is the expected signature of key theft (§13.3).

### 5.3 Actions

`add_key`, `revoke_key`, `rotate_root`, `add_owner`, `remove_owner`, `set_signing_policy`, `set_claim`, `retire_identity`.

### 5.4 Time

Every signature and every key event MUST carry verifiable time. Implementations MUST use at least one of:

- Inclusion proof in a transparency log (preferred)
- RFC 3161 timestamp token from an independent TSA

Without verifiable time, a single later key compromise retroactively invalidates every prior signature. Implementations MUST NOT rely on the signer's self-asserted clock.

---

## 6. Person and Org Identities

A `person` or `org` identity carries the root of authority. Its key document contains its lineage, its anchor domains, and its claim set.

Claims are typed and each carries its own verification method. A claim is only useful if a party that distrusts the operator can re-derive it. See §11.2.

```json
{
  "claims": [
    { "type": "domain_control", "value": "mycal.net", "method": "dns_txt+dnssec",
      "first_observed": "2004-11-02", "verified_at": "2026-08-13" },
    { "type": "code_history", "platform": "github", "handle": "lowerpower",
      "account_created": "2009-04-18", "third_party_merges": 214,
      "method": "public_api", "verified_at": "2026-08-13" },
    { "type": "cross_signature", "by": "urn:uuid:...", "expires": "2027-08-13" }
  ]
}
```

---

## 7. Package Identities

### 7.1 Purpose

A package identity exists for two reasons, neither of which is adding a level of trust:

1. **Continuity.** It gives the question "is this the same artifact lineage I installed before?" a well-defined subject, independent of maintainer turnover.
2. **Scoping.** A key compromised in one project's CI burns that project, not the owner's entire identity.

### 7.2 Names are claims, not identifiers

AnchorID is **not** a naming authority and MUST NOT adjudicate name disputes.

- A package's human-readable name MUST be expressed as a `name` claim scoped to an anchor domain the owner controls: `mycal.net/packages/uNetSerial`.
- Two packages MAY assert the same unscoped name. Verifiers MUST disambiguate by UUID, never by name.
- Display surfaces MUST show the scope alongside the name.

### 7.3 Package manifest

```json
{
  "anchorid_spec": "0.1",
  "type": "package",
  "id": "urn:uuid:c19b7f42-8a03-4d61-93ee-2f0a5b8c7d10",
  "seq": 14,
  "prev": "sha256:71ad...",
  "issued_at": "2026-08-13T09:00:00Z",

  "names": [
    { "name": "uNetSerial", "scope": "mycal.net", "asserted_by": "urn:uuid:4ff7ed97-..." }
  ],

  "owners": [
    { "anchorid": "urn:uuid:4ff7ed97-...", "since": "2019-03-01T00:00:00Z" },
    { "anchorid": "urn:uuid:9a2c1e80-...", "since": "2024-06-12T00:00:00Z" }
  ],

  "signing_policy": { "threshold": 1 },

  "keys": [ /* see §8 */ ]
}
```

Requirements:

- A package MUST have at least one owner at all times.
- `add_owner` and `remove_owner` MUST be signed under the package's existing signing policy and MUST be recorded permanently in the lineage.
- The package manifest is itself a key event chain and follows all of §5.2.

### 7.4 Owner change is a first-class event

Long artifact continuity combined with a recent owner change is the signature of a package-handoff attack. Therefore:

- Owner changes MUST be logged permanently and MUST NOT be prunable.
- Verifiers MUST surface owner changes within a configurable recency window (default: 180 days) as a distinct display state (§14.3).
- A package's `identity_confidence` MUST NOT exceed the lowest `identity_confidence` among its **current** owners. Reputation does not survive transfer to an owner who has not earned it.

---

## 8. Multi-Owner Packages and Per-Owner Key Sets

This is the core of this revision. A package with multiple owners does not share one key. Each owner authorizes its own keys, and every signature is attributable to the specific owner and workflow that produced it.

### 8.1 Key entries are partitioned by owner

```json
"keys": [
  {
    "keyid": "SHA256:kP3n...",
    "owner": "urn:uuid:4ff7ed97-...",
    "workflow": "github:lowerpower/uNetSerial/.github/workflows/release.yml@refs/heads/main",
    "purpose": "sign_artifact",
    "valid_from": "2026-01-04T00:00:00Z",
    "valid_to": null,
    "hardware_backed": false,
    "ephemeral": true
  },
  {
    "keyid": "SHA256:m7Qd...",
    "owner": "urn:uuid:9a2c1e80-...",
    "workflow": "gitlab:acme/unetserial/release@protected",
    "purpose": "sign_artifact",
    "valid_from": "2024-06-12T00:00:00Z",
    "valid_to": null,
    "hardware_backed": true,
    "ephemeral": false
  },
  {
    "keyid": "SHA256:t0Xa...",
    "owner": "urn:uuid:4ff7ed97-...",
    "workflow": null,
    "purpose": "sign_artifact",
    "valid_from": "2019-03-01T00:00:00Z",
    "valid_to": "2026-01-04T00:00:00Z",
    "hardware_backed": true,
    "ephemeral": false
  }
]
```

Requirements:

- Every key entry MUST name exactly one `owner`, and that owner MUST be an AnchorID listed in `owners` with `since` ≤ the entry's `valid_from`.
- A key entry MUST be added by a key event signed by **the owner it names**, or by that owner's root. One co-owner MUST NOT be able to authorize a key attributed to another co-owner.
- An owner MAY hold multiple concurrent keys — typically one per CI workflow plus one offline release key. This is expected and MUST NOT be modeled as key sharing.
- `workflow`, when present, binds the key to a specific automation identity. Verifiers MAY require that the workflow identity asserted in the signing certificate matches this field, and MUST fail if it is present and mismatched.

### 8.2 Attribution is mandatory output

Because keys are partitioned, verification yields not just "signed by this package" but "signed by owner O of this package, via workflow W." Implementations MUST include `owner` and `workflow` in Assertion A output.

This enables per-owner verifier policy: a consumer MAY accept releases signed by owner A and reject those signed by co-owner B, without any change to the package.

### 8.3 Removing an owner

When an owner is removed:

- All key entries naming that owner MUST be closed with `valid_to` set to the removal time. They MUST NOT be deleted.
- Signatures made before the removal time remain valid under Assertion A. Removal is not retroactive; only revocation for cause (§12) carries retroactive weight.
- Verifiers MUST be able to report "signed by an owner who is no longer an owner" as a distinct, non-fatal state.

### 8.4 Thresholds

`signing_policy.threshold` specifies how many **distinct owners** must sign a release for it to satisfy policy.

- Multiple signatures from distinct keys belonging to the *same* owner count once.
- `threshold: 1` (default) means any single current owner may release.
- `threshold: 2` on a two-owner package means one compromised owner is insufficient to ship. High-value packages SHOULD use a threshold ≥ 2.
- Verifiers MUST evaluate threshold against the policy in force at signing time, stapled per §9.3.

---

## 9. Signing and Envelope Format

### 9.1 Reuse, do not reinvent

- Envelope: **DSSE** (`application/vnd.dsse.envelope.v1+json`)
- Payload: **in-toto Statement**, `subject` = artifact digest(s)
- Bundles SHOULD be cosign-compatible so existing CI verifiers work without modification.

### 9.2 Predicate

Predicate type: `https://anchorid.net/attestation/v0.1`

```json
{
  "package": "urn:uuid:c19b7f42-...",
  "owner": "urn:uuid:4ff7ed97-...",
  "keyid": "SHA256:kP3n...",
  "workflow": "github:lowerpower/uNetSerial/.github/workflows/release.yml@refs/heads/main",
  "package_manifest_seq": 14,
  "package_manifest_hash": "sha256:8c11...",
  "signed_at": "2026-08-13T09:14:22Z",
  "evidence_snapshot": {
    "policy": "anchorid-policy-v1",
    "identity_confidence": "corroborated",
    "claims_hash": "sha256:4d90..."
  }
}
```

### 9.3 Stapling

The bundle MUST contain everything required for offline verification of Assertion A:

- The DSSE envelope
- The package manifest at `seq` named in the predicate, plus the lineage back to `seq: 0`
- The owner's lineage covering the signing key's validity window
- The transparency log inclusion proof or RFC 3161 token

Rationale: a signature that requires fetching `anchorid.net` at verification time makes the operator a hard availability dependency and a censorship point. It also makes verification unrepeatable after the operator ceases to exist.

### 9.4 Evidence snapshot semantics

The stapled `evidence_snapshot` records confidence **at signing time**. A signature verified today at `corroborated` MUST NOT silently re-verify at a different level next year because a GitHub account lapsed.

- Verifiers MUST report the snapshot level by default.
- Verifiers MAY recompute current level, but MUST present it as a separate value, clearly labeled as recomputed.
- Evidence decay MUST NOT retroactively invalidate past signatures. It MAY inform policy about *future* signatures from that identity.

### 9.5 Key custody

- The AnchorID operator MUST NOT hold root keys for `person` identities.
- Ephemeral keys are RECOMMENDED for CI signing: generate at signing time, bind to an authenticated workflow identity, log, and discard. Nothing persists to steal or subpoena.
- Where the operator performs custodial signing for an `org`, it MUST emit a **signing receipt** to the org for every signature made in its name, and the org MUST retain an offline root capable of revoking the operator's authority.

---

## 10. Transparency Log

- All key events and all artifact signatures MUST be submitted to an append-only, externally witnessed transparency log.
- Implementations MAY use an existing public log (e.g. Rekor) rather than operating one. The log is not a differentiator and operating one is the hardest infrastructure problem in this design.
- The log MUST be witnessed by parties independent of the AnchorID operator, so that the operator cannot rewrite history undetected.
- Identities SHOULD publish a periodic signed heartbeat. Silence then becomes a signal: a hijacked identity that stops its usual cadence is visible before any bad artifact is noticed.

---

## 11. Confidence Levels

### 11.1 Levels

Buckets, not a numeric score. A precise number invites arguments about why an identity is 71 rather than 78.

| Level | Meaning |
|---|---|
| `unverified` | Identity exists. No checkable evidence. **Renders identically to unsigned.** |
| `domain-verified` | Control of a DNS name demonstrated via TXT + DNSSEC. |
| `attributed` | Domain control plus linked accounts with checkable history. |
| `corroborated` | Independent evidence: third-party acceptance events, cross-signatures from identities with their own history, or sustained clean signing history over time. |
| `legal-entity` | Binding to a legal person or incorporated entity via documents. |

`legal-entity` is **not** the top of a linear ladder. It answers a different question (linkage to a legal person) than `corroborated` does (continuity of an actor). A pseudonymous identity with a decade of unbroken, independently checkable history MAY be `corroborated` and never `legal-entity`, and that is not a deficiency.

### 11.2 Weighting principle

Weight evidence by **cost to forge** and **time under observation**, not by claim count.

- Cheap and self-issued: an email address, a fresh account, a claimed job title.
- Expensive: a domain held for years, commits merged into repos owned by other people, package registry ownership predating the identity, cross-signatures that cost the voucher something.
- The strongest evidence required *other parties to act* or *time to elapse*. Neither can be purchased at signing time.

Claims that cannot be re-derived by a hostile third party MUST be marked `operator_attested` and MUST NOT alone raise an identity above `attributed`.

### 11.3 Pseudonymous path to `corroborated`

There MUST exist a path to `corroborated` that requires no institutional or documentary evidence:

- N signing events over T elapsed time, same lineage, zero substantiated abuse reports
- Cross-signatures from identities that themselves hold history, weighted by the voucher's own record and **expiring** on a fixed term
- Third-party acceptance events (merged contributions, registry ownership) predating the identity

All of the above are checkable by a party that distrusts the operator entirely. This is the property document verification can never have: a passport check is unreproducible by definition.

### 11.4 Reference policy

The operator MUST publish a versioned, deterministic reference policy (`anchorid-policy-v1`) that computes a level from an evidence graph. It MUST be reproducible: any party with the same evidence set MUST derive the same level.

Verifiers MAY substitute their own policy. Output MUST always name the policy that produced the level.

### 11.5 Negative evidence

`unverified` means **unknown**, never **bad**.

- A distinct state MUST exist for negative evidence: `revoked`, `disputed`, `abuse_confirmed`.
- Negative evidence MUST be permanent in the log. The value of a five-year unblemished record depends entirely on a blemish having been recordable.
- Negative states MUST NOT be reachable by the absence of evidence, and MUST NOT be entered without published cause.

---

## 12. Revocation

Two distinct mechanisms, which MUST NOT be conflated:

**Key revocation** — a key is compromised or retired. `revoke_key` closes the entry. Signatures made before the compromise window remain valid if their time is independently attested.

**Revocation for cause** — an identity is confirmed to be distributing malware or otherwise abusing the system. This is entered as negative evidence with published cause, and MAY be retroactive. It is an abuse response, not a policy gate, and it is categorically different from declining to onboard an identity.

The operator MUST NOT impose a minimum evidence level as a precondition for signing at the protocol layer. Refusal is unenforceable — a refused party signs with other tooling and ships anyway — and it destroys the on-ramp by which time-based reputation accrues. Minimum levels MAY be imposed on **custodial signing services**, where the operator carries actual liability.

---

## 13. Recovery and Theft

### 13.1 Recovery

Support-desk recovery of a pseudonymous identity makes the identity exactly as strong as the least careful support agent. Therefore:

- The operator MUST NOT be able to unilaterally restore access to a `person` identity.
- Permitted mechanisms: (a) no recovery — loss of root is loss of identity; (b) M-of-N social recovery via cross-signers.
- Any recovery mechanism MUST include a mandatory public delay window (RECOMMENDED: 30 days) announced in the transparency log before it takes effect, so that a legitimate holder can veto and an attacker must complete the takeover in public against a running clock.

### 13.2 What theft actually takes

Reputation attaches to the **lineage**, not to any key and not to a handle. A thief holding a current operational key can sign, but cannot rewrite the chain. When the legitimate holder rotates from the offline root, the result is a publicly visible fork (§5.2), not a silent substitution.

### 13.3 Voluntary transfer

The attack this specification cannot cryptographically prevent is sale of an established identity or package. The buyer holds real keys with a valid lineage. Mitigations are structural:

- Cross-signature vouches expire, forcing re-vouching by parties who would notice a substitution
- Owner-change display states (§14.3)
- Confidence ceiling bounded by current owner (§7.4)
- Thresholds ≥ 2 for high-value packages (§8.4)

---

## 14. Verifier Display Requirements

The install moment allows roughly one question of a human's attention. That question is **"is this who I expected?"** — not "is 71 enough."

### 14.1 Show identity, not score

Primary install surfaces MUST NOT display a numeric score or a raw level as the headline. They MUST display the publisher name, its scope, and continuity information.

```
Mycal (mycal.net) — mycal.net/packages/uNetSerial
Signed 12 Aug 2026 · same publisher as your previous 6 installs
[ Install ]  [ Details ]
```

### 14.2 Levels map to behavior, not to badges

| Level | Required behavior |
|---|---|
| `corroborated` and above | Install without friction; publisher name shown |
| `domain-verified` / `attributed` | Install; show name **and** what is missing |
| `unverified` | Block by default; override behind an expansion |
| negative states (§11.5) | Block; override requires explicit typed confirmation |

- Implementations MUST NOT display an affirmative indicator for the mere fact of a valid signature. Unsigned and signed-at-`unverified` MUST be visually indistinguishable.
- Implementations SHOULD NOT present a spectrum of increasingly worried icons; graduated warnings are clicked through at uniform rates.

### 14.3 Change is the strongest human signal

The following MUST be first-class display states, independent of level:

- **Publisher change** — this package lineage was signed by a different owner than previously observed
- **Owner change** — the package's owner set changed within the recency window
- **Lineage fork** — two conflicting event chains observed (hard failure)
- **Cadence break** — heartbeat silence beyond the expected interval

`same package since 2019 · owner changed 3 weeks ago` is a sentence a non-expert can act on correctly. A score is not.

### 14.4 Prohibited patterns

- MUST NOT ask a user to compare digests by eye
- MUST NOT place a level in a dialog title, where it becomes something to argue with rather than act on
- MUST NOT describe an unverified-but-signed artifact as "signed" in a way that implies assurance

---

## 15. Non-Warranty (Normative)

The AnchorID operator does not vouch for any signer or any artifact. It publishes verifiable evidence and a reproducible function over that evidence.

- A valid signature is a statement about **key authorization and lineage**, and nothing more.
- Identity verification is not malware detection. A well-resourced attacker can satisfy identity requirements; this has been repeatedly demonstrated against EV code-signing certificates.
- `identity_confidence` is an **input to** a safety decision, never the decision.
- Every claim in an evidence graph is intended to be independently checkable by a party that distrusts the operator completely. Where a claim is not so checkable, it is marked `operator_attested` and carries correspondingly less weight.

---

## 16. Open Questions

1. **Bootstrapping.** The first identities have no one to cross-sign from. PGP's web of trust died in this valley. Seeding with identities whose history already exists outside the system is the proposed answer; the seeding criteria are unspecified.
2. **Sleeper identities.** Clean history is cheap to accumulate and can be cashed in once. Expiring vouches and threshold signing bound the damage but do not eliminate it.
3. **Cross-medium subjects.** The same lineage signing a binary, an audio master, and a text work is the intended differentiator. Alignment with C2PA / CAWG identity assertions is unresolved.
4. **Wind-down.** Signatures made in good faith must not stop verifying because the operator ceases to exist or an invoice lapses. Stapling (§9.3) addresses verification; log durability does not yet have an answer.
5. **Threshold semantics under owner removal.** If a 2-of-2 package drops to one owner, whether existing policy blocks all releases until amended is unspecified.

---

## 17. Changelog

- **0.1** — Initial draft. Establishes two-assertion model, key lineage, package delegation, per-owner key partitioning for multi-owner packages, and display requirements.
