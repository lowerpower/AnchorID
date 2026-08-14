# AnchorID vs. Prior Art — Comparison Matrix

**Companion to:** `anchorid-package-signing-spec-v0.1.md`
**Compiled:** 2026-08-13 · facts verified against primary sources on this date
**Status:** Point-in-time snapshot. Several systems below changed within the last 12 months; §11 lists the contested and fast-moving entries.

---

## 0. How to read this document

Comparing AnchorID to "Bitcoin multi-sig" or "Apple notarization" as though they were alternatives is a category error — they answer different questions. This document separates the field into **six independent axes** and compares systems only within an axis where the dimension is meaningful.

A system can be excellent on one axis and absent on another. Sigstore is world-class on transparency and has no reputation model at all. EV code signing has a reputation model and won't show you the formula. Neither is a defect; they were built for different problems.

### Legend

| Mark | Meaning |
|:--:|---|
| ✓ | Yes, and it is a designed, load-bearing property |
| ~ | Partial, optional, conditional, or achievable but not the default |
| ✗ | No |
| n/a | Dimension does not apply to this system |

### The six axes

| Axis | The question | Section |
|---|---|---|
| **Identity** | Who is the subject, and what survives a key change? | §2 |
| **Authorization** | Who may sign, how many must agree, and can you tell who did? | §3 |
| **Transparency** | Can a stranger check the history, and can the operator lie? | §4 |
| **Standing** | Is there a reputation notion, and is it re-derivable? | §5 |
| **Failure** | Recovery, revocation, theft, and transfer | §6 |
| **Surface** | Naming, display, and what the human is actually asked | §7 |

---

## 1. The field

### 1.1 Artifact and package signing

| System | One-line | Deployed at scale |
|---|---|:--:|
| **AnchorID 0.1** | UUID lineage + evidence graph + per-owner keys | No — draft |
| **Sigstore** (cosign/Fulcio/Rekor) | Ephemeral keys bound to OIDC identity, all logged | ✓ |
| **TUF** | Role-based thresholds and delegation for repositories | ✓ |
| **Notary v1 / DCT** | TUF for Docker registries — **retired, shutdown 2026-12-08** | ✗ dying |
| **Notation** (Notary Project) | OCI-native X.509 signing, no log, no rotation | ~ |
| **in-toto** | Attestation format for supply-chain steps | ✓ |
| **SLSA** | Build-integrity level framework, not a signing scheme | ✓ |
| **npm provenance** | Sigstore + CI OIDC, proves repo and workflow | ✓ |
| **PyPI attestations** (PEP 740) | Sigstore-backed; produced widely, **verified by nothing** | ~ |
| **Maven Central** | Mandatory OpenPGP signatures on publish | ✓ |
| **Debian / RPM** | Distro keyring signs the index; packages inherit | ✓ |
| **Arch Linux** | Packager keys certified by a 5-master marginal-trust web | ✓ |
| **Go checksum DB** | Transparency log of module hashes, no identity | ✓ |
| **Nix / NixOS** | Ed25519-signed binary caches + reproducible builds | ✓ |
| **Guix** | In-repo authorized-key set, commit-chain authentication | ✓ |
| **F-Droid** | Reproducible builds, distro-held or dev-held keys | ✓ |
| **crates.io** | **No artifact signing at all** — SHA-256 + TLS only | ✓ |

### 1.2 Platform code signing

| System | One-line | Who holds the signing key |
|---|---|---|
| **Windows Authenticode** (OV/EV) | CA-issued cert naming a legal entity | Developer, on certified hardware |
| **Azure Artifact Signing** | Cloud-custodial, 72-hour certs (GA Jan 2026) | Microsoft |
| **Apple Developer ID** | Apple-issued cert + notarization malware scan | Developer |
| **Apple App Store** | Apple re-signs everything it distributes | Apple |
| **Android APK v3 / v3.1** | Signature scheme with an explicit key-rotation lineage | Developer |
| **Play App Signing** | Google holds the app key; dev holds an upload key | Google |
| **Java jarsigner** | JAR manifest signing, X.509 | Developer |

### 1.3 Identity and key-binding

| System | One-line |
|---|---|
| **OpenPGP / web of trust** | Long-lived keys, peer signatures on UIDs |
| **Keyoxide** | Key ↔ online-account proofs, decentralized, no server of record |
| **Keybase** | Same idea, centralized, effectively dormant post-acquisition |
| **W3C DID / VC** | Identifier + resolvable key document + credentials |
| **X.509 WebPKI + CT** | CA hierarchy, publicly logged issuance |
| **Signal AKV** | Key transparency with **three client-enforced independent auditors** |
| **WhatsApp / Messenger KT** | Auditable key directory, one external auditor |
| **Apple IMCKV** | CONIKS-derived, internal auditing only, no published spec |
| **IETF KEYTRANS** | Standardization in progress, no RFC yet |
| **SSH `allowed_signers`** | Flat allowlist of keys for git commit/tag signing |

### 1.4 Quorum and threshold

| System | One-line |
|---|---|
| **Bitcoin multi-sig** | M-of-N over pubkeys, on-chain, signers visible |
| **Gnosis Safe** | M-of-N over addresses, on-chain policy, signers visible |
| **Shamir secret sharing** | M-of-N to *reconstruct one key* — no attribution |
| **FROST** (RFC 9591) | M-of-N threshold Schnorr — one aggregate, **non-attributable** signature |
| **DNSSEC root KSK** | 3-of-7 Crypto Officers; 5-of-7 for share recovery |
| **TUF thresholds** | M-of-N over keys held by a role |
| **Arch master keys** | 3 marginal certifications from a 5-key peer set |
| **AnchorID §8.4** | M-of-N over **distinct owners**, attribution mandatory |

### 1.5 Provenance and review

| System | One-line |
|---|---|
| **C2PA 2.4** | Signed provenance manifests for media |
| **CAWG Identity Assertion 1.2** | Binds a creator identity into a C2PA manifest (a DIF WG, not C2PA) |
| **cargo-crev** | Distributed, signed human code reviews |
| **OpenSSF Scorecard** | Automated repo-hygiene heuristics, no identity |
| **Reproducible builds** | Independent rebuild agreement — trust *removal*, not identity |

---

## 2. Axis: Identity

The load-bearing question is not "is there a key" but **what is the subject**, and what happens to accumulated standing when the key changes.

| System | Subject of identity | Stable across key rotation | Cryptographic lineage | Who can impersonate the subject |
|---|---|:--:|:--:|---|
| **AnchorID 0.1** | UUID (§4.1) | ✓ | ✓ append-only chain (§5.2) | Holder of the offline root only |
| **Sigstore** | OIDC account (email / workflow URI) | ~ | ✗ | Your OIDC provider; Fulcio |
| **TUF** | A role in one repository | ✓ | ~ via root rotation | Quorum holders of the role's keys |
| **Notation** | X.509 subject | ~ | ✗ **no rotation mechanism** | The issuing CA |
| **OpenPGP** | Key fingerprint | ✗ | ~ via cross-signed transition | Anyone holding your key |
| **npm provenance** | Repo + workflow | ✗ | ✗ | GitHub (OIDC issuer); npm |
| **PyPI attestations** | Trusted Publisher (repo/workflow) | ✗ | ✗ | The forge; PyPI |
| **crates.io** | **none** | n/a | n/a | Anyone who can publish; the CDN |
| **Go checksum DB** | none — bytes only | n/a | n/a | Google, if you don't check witnesses |
| **Guix** | Key set in `.guix-authorizations` | ✓ | ✓ commit chain | Quorum of authorized committers |
| **Authenticode OV/EV** | Legal entity | ~ name persists | ✗ | Any trusted code-signing CA |
| **Azure Artifact Signing** | Microsoft-validated account | ✓ | ✗ | Microsoft (fully custodial) |
| **Apple Developer ID** | Apple developer account | ✓ | ✗ | Apple |
| **Android APK v3** | Signing cert **lineage** | ✓ | ✓ old key signs next | Holder of current key in lineage |
| **Play App Signing** | Google-held app key | ✓ | ✓ | Google |
| **Keyoxide** | Key + proof set | ~ | ✗ | Key holder + account holder |
| **W3C DID** | DID string | ✓ | ~ method-dependent | Method-dependent |
| **Signal AKV** | Account handle | ✓ | ✓ auditable directory | Signal, but **detectably** |
| **C2PA / CAWG** | Cert subject, optionally a CAWG identity | ~ | ✗ | The issuing CA / identity provider |

### 2.1 Reading the last column

That column is the most useful in this document. Almost every deployed system has a party that can mint a signature in your name: your OIDC provider, your CA, Apple, Google, Microsoft. This is not usually presented as a limitation because for those systems it isn't one — they *are* the trust root by design.

AnchorID §9.5 removes the operator from that list for `person` identities. The residual exposure is different in kind: an operator running an **unwitnessed** log could equivocate about history. §10 addresses this by requiring independent witnesses — the Certificate Transparency insight applied to key events. **§4.2 below explains why "requiring witnesses" is not sufficient on its own.**

### 2.2 The closest living relative: Android signing lineage

Android's APK Signature Scheme v3 is the nearest deployed analogue to AnchorID §5.2, and it works at billions-of-devices scale.

Mechanically: proof-of-rotation lives in additional attribute `0x3ba06f8c` inside the v3 signer's *signed* data, so it is protected by the current key. The lineage is a **strictly linear singly-linked list**, ordered oldest→newest, each node's cert signing the next — the design explicitly precludes branching and convergence of different ancestor certs. Each ancestor node carries capability flags (`PAST_CERT_INSTALLED_DATA`, `SHARED_USER_ID`, `PERMISSION`, `ROLLBACK`, `AUTH`) describing what the old key is *still* trusted for. Notably `PAST_CERT_ROLLBACK` is **off by default**, so downgrading to an ancestor key is not permitted unless explicitly granted.

v3.1 (block ID `0x1b93ad61`, min SDK 33) exists because the v3.1 block is *unrecognized* on Android 12 and below — old devices fall back to the original signer while Android 13+ uses the rotated one. That is a deployment lesson worth internalizing: **rotation had to be made invisible to old verifiers**, because old verifiers cannot be upgraded.

| | Android v3 lineage | AnchorID lineage |
|---|---|---|
| Scope | One app, one publisher | Person/org **and** package, separately |
| Events | Rotation only | add/revoke/rotate, owner change, policy, claims (§5.3) |
| Shape | Strictly linear, no branching | Linear, `seq` + `prev` hash |
| Ordering proof | Cert chain | Gap-detectable sequence (§5.2) |
| Fork detection | ✗ | ✓ distinguished hard failure (§5.2) |
| Capability scoping of old keys | ✓ five explicit flags | ~ `purpose` field only |
| Public log | ✗ | ✓ required before key use (§5.2) |
| Multi-owner | ✗ | ✓ per-owner partition (§8) |

**Borrow candidate:** Android's per-ancestor capability flags are more expressive than AnchorID's `purpose` field. "This retired key may still validate installed data but may not authorize a rollback" is a distinction §5.2 currently cannot express.

---

## 3. Axis: Authorization and quorum

**This is where the multi-sig question lands, and it produced the most interesting finding in the document.**

| System | Quorum unit | Threshold | Per-signer attribution | Can signer A authorize a key for signer B? |
|---|---|:--:|:--:|:--:|
| **AnchorID §8** | **Distinct owner** | ✓ | ✓ **mandatory output** | ✗ **forbidden** (§8.1) |
| **TUF** | Key held by a role | ✓ | ~ visible, not required output | ✓ root can |
| **Bitcoin multi-sig** | Pubkey | ✓ | ✓ visible on-chain | ✗ |
| **Gnosis Safe** | Address | ✓ | ✓ visible on-chain | ~ via owner-management tx |
| **Shamir** | Share | ✓ | ✗ **none** | n/a |
| **FROST** | Participant | ✓ | ✗ **none by design** | ✗ |
| **DNSSEC root KSK** | Human credential holder | ✓ 3-of-7 | ✓ filmed ceremony record | ✗ |
| **Arch Linux** | Master key (marginal trust) | ✓ 3 needed | ✓ | ✓ masters certify packagers |
| **Debian** | Keyring membership | ✗ flat | ✓ | ✓ via keyring maintainers |
| **Guix** | Authorized committer | ~ | ✓ per commit | ✓ via `.guix-authorizations` |
| **Notation** | Cert | ✗ | ✓ | ✓ CA |
| **Sigstore** | OIDC identity | ✗ | ✓ | ✗ |
| **Apple / Windows / Play** | Account | ✗ | ✗ | n/a |

### 3.1 Is multi-sig a good comparison? Yes — and it inverts

Multi-sig is a good comparison **on the authorization axis and nowhere else**. It says nothing about identity, standing, or naming. But on that one axis it exposes something no other comparison does.

Threshold cryptography has spent two decades optimizing toward **aggregate, non-attributable** signatures. RFC 9591 (FROST, June 2024, IRTF/CFRG) states it plainly: FROST *"produces signatures that can be verified as if they were produced from a single signer."* The signature carries no participant set, no threshold parameter, no indication that threshold signing occurred at all. An observer cannot tell whether one party or fifteen participated.

AnchorID §8.2 mandates the **exact opposite**: verification output must name the owner and the workflow. A signature that concealed which co-maintainer produced it would violate the spec.

| | Threshold crypto (FROST, Shamir) | AnchorID §8 |
|---|---|---|
| Goal | Hide the quorum | Expose the quorum |
| Output | One aggregate signature | Per-owner attributable signatures |
| Signature size | Constant regardless of N | Grows with signers |
| Consumer policy | Accept the group or don't | "Accept Alice's releases, not Bob's" (§8.3) |
| Compromise blast radius | Whole group key | One owner, one workflow (§7.1) |
| Incident forensics | Nothing to learn | Which owner, which pipeline |

Both are correct for their domain. In finance you want "the treasury approved this transfer," not which three officers signed. In supply chain, "which maintainer's CI produced this build" is precisely the fact an incident responder needs at 3 a.m.

**Conclusion: AnchorID should not adopt threshold signatures.** Defining the threshold over identities rather than keys is the right call, and §8.4's rule that multiple keys from the same owner count once is what makes it an *identity* threshold rather than a key threshold.

One caveat worth knowing if FROST ever comes up: FROST signatures are **not deterministic** — RFC 9591 forbids deterministic nonce derivation because it enables full key recovery in multi-party discrete-log schemes. So a FROST(Ed25519) signature verifies under a stock RFC 8032 verifier but is not bit-identical to deterministic Ed25519 output. Distinguishing on that basis requires the private key, so the indistinguishability claim holds for any realistic threat model.

### 3.2 The genuinely novel constraint

§8.1's rule — a key entry MUST be added by an event signed by *the owner it names* — has no equivalent in any system in the table.

- **TUF**: root can add keys to any role.
- **Arch**: master keys certify packager keys. (Note the correct model here: the 5 master keys carry **marginal** ownertrust, and the "3 signatures" requirement is just GnuPG's `--marginals-needed` default, not an Arch-specific constant. There is no root CA; the masters are peers.)
- **Debian**: keyring maintainers admit members.
- **Gnosis Safe**: existing owners vote to add an address, and nothing binds that address to the person they claim it belongs to.

Every one of these has a path by which a compromised administrator introduces a key that *appears* to belong to someone else. AnchorID closes it. A fully compromised co-owner can sign as themselves and vote on owner changes, but cannot manufacture a key that verification will attribute to a co-maintainer. Combined with mandatory attribution (§8.2), the forensic record after a compromise stays honest.

### 3.3 Where AnchorID's threshold model is underspecified

§16.5 flags it: if a 2-of-2 package loses an owner, the spec doesn't say whether releases halt. Compare:

- **Gnosis Safe** — removing an owner and changing the threshold are a **single atomic transaction**; you cannot strand the Safe by accident.
- **TUF** — the root role can always re-delegate, so a stranded target role is recoverable from above.
- **AnchorID** — has no "above." A package's only authority is its owner set, so a 2-of-2 dropping to one owner has nobody who can amend the policy.

This is a real gap, not a documentation gap. The Gnosis atomic-change pattern is the obvious borrow.

---

## 4. Axis: Transparency

| System | Append-only log | Independent witnesses | Client **enforces** witnesses | Proof stapled | Verifies offline |
|---|:--:|:--:|:--:|:--:|:--:|
| **AnchorID 0.1** | ✓ required (§10) | ✓ required | **unspecified** | ✓ required (§9.3) | ✓ required (§4.3) |
| **Signal AKV** | ✓ | ✓ 3 independent | ✓ **all 3, ≤7 days old** | n/a | n/a |
| **WhatsApp / Messenger KT** | ✓ | ✓ 1 (Cloudflare) | ✗ | n/a | n/a |
| **Apple IMCKV** | ✓ | ✗ internal only | ✗ | n/a | n/a |
| **X.509 WebPKI** | ✓ CT | ✓ | ✓ Chrome requires SCTs | ✓ SCT in cert | ✓ |
| **Sigstore** | ✓ Rekor | ~ v2 checkpoints cosigned | ✗ no witness policy yet | ✓ bundle | ✓ with pinned trust root |
| **Go checksum DB** | ✓ Trillian | ✓ 8+ ArmoredWitnesses | ✗ **client checks one key** | ✓ via `go.sum` | ✓ |
| **npm provenance** | ✓ Rekor | ~ | ✗ | ✓ | ~ |
| **PyPI attestations** | ✓ Rekor, mandatory proof | ~ | ✗ | ✓ | ~ |
| **Guix** | ~ the git history is the log | ✗ | n/a | ✓ repo is self-contained | ✓ |
| **TUF** | ✗ | ✗ | n/a | ✓ metadata | ✓ |
| **Notation** | ✗ **none in any form** | ✗ | n/a | ✓ | ✓ |
| **Authenticode** | ✗ | ✗ | n/a | ✓ RFC 3161 token | ✓ |
| **Apple notarization** | ✗ | ✗ | n/a | ✓ stapled ticket | ✓ |
| **Android / Play** | ✗ | ✗ | n/a | ✓ in APK | ✓ |
| **OpenPGP** | ✗ | ✗ | n/a | ✓ detached sig | ✓ |
| **C2PA** | ~ optional | ✗ | n/a | ✓ manifest | ✓ |

### 4.1 Stapling is the strongest engineering claim in the spec

§9.3's rationale — a signature requiring a call to `anchorid.net` makes the operator an availability dependency and a censorship point, and makes verification unrepeatable after the operator ceases to exist — is correct, and it is the thing most systems get wrong.

Prior art that got it right: Apple's stapled notarization tickets; Authenticode's RFC 3161 timestamps (the signature survives cert expiry); Go's `go.sum`, where verification provably never contacts the sumdb once a hash is recorded.

Sigstore gets it *mostly* right, and its current state is worth stating precisely because the ecosystem moved recently. Fully offline verification **is** supported: `cosign --bundle <file> --trusted-root <file>` performs no network I/O. But the **trust root must already be local**, and it is mandatory for new-format bundles. The flags changed too — `--offline` is now deprecated in favor of exactly that `--bundle` + `--trusted-root` pairing. Rekor v2 (GA 2025-10-10, Trillian Tessera, C2SP tile-based) pushes further: Sigstore's own client spec says newer clients *SHOULD NOT* offer online verification of v2 entries. Note that v2 is **GA but not the public-good default** — v1 still is, and v1 currently holds ~2.34 billion entries against v2's ~65 million.

AnchorID goes further than all of them by requiring the **full owner and package lineage** in the bundle, not merely an inclusion proof. That makes bundles larger and makes §16.4 (log durability past the operator) the sharper remaining question. Stapling solves verification; it does not solve the log.

### 4.2 The Go sumdb lesson — witnesses nobody checks

**This is the most important cautionary tale for §10, and it should change the spec.**

Independent witnesses *do* cosign sum.golang.org checkpoints today: the transparency.dev distributor serves the same checkpoint with eight or more ArmoredWitness cosignatures. But `x/mod/sumdb/client.go` builds its verifier list from **exactly one key** — Google's. The source comment reads *"accepted verifiers (just one…)"*. There is no witness policy, no quorum rule, no `c2sp.org/tlog-policy` support.

So from the perspective of every `go build` on Earth, **Google is a trusted single operator.** The witness network provides out-of-band detection for anyone who chooses to look; it does not provide split-view prevention for Go users. (A further caveat: all the current cosigners are ArmoredWitness devices from the same transparency.dev/TrustFabric program, so operator diversity is itself still aspirational.)

Sigstore is in a similar position — live Rekor v2 checkpoints carry three witness cosignatures, but no witness-policy TUF target exists, so no M-of-N policy is enforced anywhere.

Contrast with the two systems that got it right:

- **Signal Automatic Key Verification** (launched 2026-08-11) — three independent auditors (Signal, Cloudflare, Trail of Bits), and the **client requires valid signatures from all three, issued within the last 7 days**. Trail of Bits wrote its auditor from scratch against Signal's written spec rather than against Signal's implementation, and is not paid by Signal.
- **Certificate Transparency** — Chrome hard-requires SCTs, which is the entire reason CT changed CA behavior.

**Recommendation for §10:** the spec currently requires that the log *be* witnessed. That is necessary and not sufficient. It should additionally require that **verifiers enforce a witness quorum policy**, with a minimum count and a maximum cosignature age, and that the policy be named in verification output alongside the confidence policy. Signal's "all three, ≤7 days" is the model. Without this, AnchorID inherits Go's failure mode: a witness ecosystem that looks like split-view protection and isn't.

---

## 5. Axis: Standing and reputation

| System | Standing concept | Formula public | Re-derivable by hostile party | Survives ownership transfer | Negative evidence recorded |
|---|---|:--:|:--:|---|:--:|
| **AnchorID 0.1** | Bucketed levels over evidence graph (§11) | ✓ versioned, deterministic (§11.4) | ✓ by design (§11.2) | **Capped at lowest current owner** (§7.4) | ✓ permanent (§11.5) |
| **SmartScreen** | Per-publisher/file reputation | ✗ | ✗ | Opaque | ✗ publicly |
| **Apple** | Internal account standing | ✗ | ✗ | Opaque | ✗ publicly |
| **npm / PyPI / crates.io** | Informal: age, downloads, org | ~ | ~ | **Silent** | ✗ |
| **OpenPGP WoT** | Signature graph, mostly non-expiring | ✓ | ✓ | Silent | ✗ in practice |
| **Arch** | Marginal-trust web, 3-of-5 masters | ✓ GnuPG semantics | ✓ | n/a | ~ key revocation |
| **cargo-crev** | Signed human reviews of code | ✓ | ✓ | n/a — reviews artifacts | ✓ negative reviews |
| **OpenSSF Scorecard** | Automated repo heuristics | ✓ | ✓ | n/a | ~ |
| **Sigstore / TUF / Go / Notation** | **None** | n/a | n/a | n/a | n/a |
| **EV code signing** | The validation *is* the standing | ~ CA/B rules public | ✗ unreproducible | Transfers with the entity | ✗ |

### 5.1 The gap AnchorID is aiming at

Every deployed system with *useful* reputation computes it privately (SmartScreen, Apple, registry heuristics). Every system with *checkable* history has no reputation at all (Sigstore, Go, TUF, Notation). **Nobody currently occupies the intersection.**

§11.4's requirement — a versioned, deterministic policy any party derives the same level from — is closest in spirit to **cargo-crev**, the only system in the table publishing both its evidence and its aggregation while letting you substitute your own trust set. crev is worth studying closely: it is small, it works, and it never reached critical mass. That is §16.1's bootstrapping problem showing up as empirical data rather than as a theoretical worry.

### 5.2 Bucketed levels vs. scores

§11.1's refusal to emit a number is validated by history:

- **SmartScreen** is numeric internally and opaque externally; developers spend real money gaming it rather than earning it.
- **Scorecard** emits 0–10 and is now routinely optimized for directly.
- **CVSS** is the canonical cautionary tale: a number that became a compliance target and stopped conveying risk.

The five-bucket model with `legal-entity` explicitly *not* atop a ladder (§11.3) is better than anything deployed. It is also the hardest part to hold onto — every downstream consumer will want to sort by it.

### 5.3 Pseudonymity, compared honestly

| System | Can a pseudonym reach top standing |
|---|---|
| **AnchorID** | ✓ `corroborated` by explicit design (§11.3) |
| **cargo-crev** | ✓ |
| **Arch / Debian** | ~ pseudonymous handles exist, but keysigning assumes in-person ID |
| **OpenPGP WoT** | ✓ in principle; key-signing parties assumed legal ID in practice |
| **Sigstore** | ✗ needs an OIDC account; the email is written into the certificate |
| **PyPI / npm Trusted Publishers** | ✗ tied to a forge account |
| **EV / Apple / Play** | ✗ documentary identity required |
| **Azure Artifact Signing** | ✗ **third-party document capture + face liveness** |

Azure Artifact Signing is the sharpest contrast available. Individual validation runs through Microsoft Entra Verified ID with a named third-party verifier performing document capture and FaceCheck liveness detection, capped at three document upload attempts, and individuals must be resident in the US or Canada. That is the maximal-identity end of the spectrum, shipping today.

§11.3's claim — that a decade of independently checkable history is *stronger* evidence than a passport check, because the passport check is unreproducible by definition — is the deepest philosophical difference between this spec and the entire platform-signing family. It is also the claim enterprise procurement will reject most reliably.

### 5.4 The empirical case for §15, updated

§15 says identity verification is not malware detection, and that well-resourced attackers satisfy identity requirements. Two 2025 events prove it more sharply than the EV precedent the spec cites:

- **Azure Artifact Signing abuse (March 2025).** Attackers obtained Microsoft's short-lived certificates and signed **Crazy Evil Traffers** and **Lumma Stealer** malware. Microsoft's response on 2025-04-02 was to restrict new subscriptions to US/Canada organizations with three or more years of verifiable history and to **pause individual onboarding entirely**. Individual signups have since reopened under geographic restriction. The strongest identity validation in the industry — document capture, liveness check, custodial HSM keys — did not prevent malware from being validly signed.
- **The Nikon Z6 III C2PA break (September 2025).** A researcher copied a raw file from a non-C2PA camera onto the Z6 III's card and used multiple-exposure mode to obtain a valid signature, later getting an AI-generated image signed with valid Content Credentials. Nikon suspended the service and **revoked every certificate issued since launch**.

Both belong in §15. They demonstrate the failure mode the section warns about, in production, in systems with far more identity assurance than AnchorID proposes to require.

---

## 6. Axis: Failure — recovery, revocation, theft, transfer

| System | Operator can restore access | Revocation | Retroactive | Theft detectable | Mandatory delay |
|---|:--:|---|:--:|---|:--:|
| **AnchorID 0.1** | ✗ forbidden (§13.1) | key revoke + revoke-for-cause (§12) | ~ only for cause | ✓ fork is visible (§13.2) | ✓ 30d recommended |
| **Sigstore** | ✓ via OIDC recovery | Certs are ephemeral; log is permanent | ✗ | ~ log shows unexpected signings | ✗ |
| **OpenPGP** | ✗ | Revocation cert, if pre-made and distributed | ✗ | ✗ | ✗ |
| **TUF** | n/a | Root rotation, key removal | ~ | ✗ | ✗ |
| **Notation** | n/a | OCSP / CRL / delta CRL | ~ | ✗ | ✗ |
| **Authenticode** | ✓ CA reissues | CRL / OCSP | ~ CA may backdate | ✗ | ✗ |
| **Azure Artifact Signing** | ✓ Microsoft | Cert expires in 72h regardless | ~ | ✗ | ✗ |
| **Apple** | ✓ | Cert + notarization ticket revocation | ✓ can kill running apps | ✗ | ✗ |
| **Play App Signing** | ✓ Google | Key upgrade request to Google | ✗ | ✗ | ✗ |
| **Android v3 lineage** | ✗ | Rotate via lineage | ✗ | ~ | ✗ |
| **Guix** | ✗ | Remove from `.guix-authorizations` (children only) | ✗ | ✓ non-fast-forward blocked | ✗ |
| **Signal AKV** | ✓ provider | Directory update | ✗ | ✓ **that is the whole point** | ~ |
| **DNSSEC root** | ✗ | Ceremony rollover | ✗ | ✓ filmed, witnessed ceremony | ✓ long |

### 6.1 The no-recovery stance has few precedents, and they're the right ones

§13.1's "the operator MUST NOT be able to unilaterally restore access to a `person` identity" puts AnchorID in a small club: OpenPGP, Android lineage, Guix, DNSSEC root, self-custody wallets. Everything commercial here has a support desk, because everything commercial has churn and support cost.

The reasoning — support-desk recovery makes the identity exactly as strong as the least careful support agent — is empirically correct and describes how a large share of high-value account takeovers actually happen. The 30-day public veto window is good design with unacknowledged prior art worth citing: **domain transfer lock periods** and **timelocked recovery modules in smart-contract wallets**, both of which use exactly the "attacker must complete the takeover in public against a running clock" structure.

DNSSEC is the useful high-assurance comparison. Its barrier is **3-of-7 Crypto Officers** per facility to activate an HSM and **5-of-7 Recovery Key Share Holders** to reconstruct the storage master key, across two facilities (El Segundo and Culpeper), with roughly four filmed ceremonies a year and a stated design target of under one-in-a-million collusion probability. That is what maximal ceremony looks like — and it is the model for §13.1's M-of-N social recovery option, at a scale a person cannot replicate.

### 6.2 Guix's rule is subtler than AnchorID's and worth studying

Guix authenticates each commit against the `.guix-authorizations` file of its **parent** commit — so authorization changes bind children, not the commit that makes them. The rule people get wrong: **merge commits require a key present in the authorizations of *both* branches** — intersection, not union. The trust anchor is a **channel introduction**, a pair of (introductory commit ID, fingerprint of the key that signed it), obtained out of band. Keys live on a dedicated `keyring` branch and **must never be removed**, because old keys are needed to authenticate old commits.

The property worth highlighting: everything needed to authenticate is inside the repository. No forge, no keyserver, no trusted third party. That is the same goal as AnchorID §9.3's stapling, reached by a different route. AnchorID's §8.3 rule that removed owners' key entries must be closed rather than deleted is the same insight as Guix's never-remove-keys rule, and citing the precedent would strengthen it.

### 6.3 Voluntary transfer: nobody has solved this

§13.3 admits the spec cannot cryptographically prevent sale of an established identity. Worth stating plainly: **no system in this document can.** Browser extension sales, npm package handoffs, and expired-domain purchases are the recurring real-world attack, and the industry's entire answer so far is "notice it afterwards."

AnchorID's four structural mitigations — expiring cross-signatures, owner-change display states, confidence ceiling on transfer, thresholds ≥2 — are collectively stronger than anything deployed. **§7.4's confidence ceiling is the single most valuable idea in the spec** and has no equivalent anywhere in the table. A package's confidence capped at the lowest current owner means reputation does not survive a handoff to someone who has not earned it. npm, PyPI, and every extension store let a decade of standing transfer overnight with zero user-visible change.

---

## 7. Axis: Surface — naming and display

| System | Naming authority | Adjudicates disputes | Display normatively specified | Shows continuity to the user |
|---|---|:--:|:--:|:--:|
| **AnchorID 0.1** | ✗ none; names are scoped claims (§7.2) | ✗ forbidden | ✓ **§14, extensively** | ✓ required (§14.3) |
| **npm / PyPI / crates.io** | ✓ registry owns the namespace | ✓ | ✗ | ✗ |
| **Maven Central** | ✓ reverse-DNS, domain-verified | ✓ | ✗ | ✗ |
| **Go modules** | ✓ the URL *is* the name | ✗ not needed | ✗ | ✗ |
| **Authenticode** | ✓ CA validates the org name | ✓ | ~ OS dialog, undocumented | ✗ |
| **Apple** | ✓ bundle ID + team ID | ✓ | ~ Gatekeeper dialog | ✗ |
| **Android** | ✓ package name, first-come | ✓ Play | ~ | ✗ |
| **Sigstore / TUF / Notation** | ✗ | ✗ | ✗ | ✗ |
| **C2PA** | ~ | ✗ | ✓ UX Guidance 1.0 (2026-02-05) | ~ |

### 7.1 Two things here are unusual

**Go's naming model is closest to AnchorID's** and is a success case worth citing. The module path *is* a URL you control, so there is no namespace to squat and no registry to adjudicate. AnchorID §7.2's scoped-name claim (`mycal.net/packages/uNetSerial`) is the same insight, with the improvement that the UUID stays the identifier — so the name can change without breaking continuity, which Go modules handle badly.

**Almost no signing spec constrains the UI.** §14 is close to unique; C2PA's UX Guidance 1.0 is the only real precedent and is softer. Two of AnchorID's rules are novel as *normative* requirements:

- **§14.2**: unsigned and signed-at-`unverified` MUST be visually indistinguishable. This inverts what Authenticode, Gatekeeper, and every registry badge do today. It is the correct response to the observation that a checkmark meaning "a signature exists" is worse than no checkmark.
- **§14.3**: change is a first-class display state. `same package since 2019 · owner changed 3 weeks ago` has no counterpart in any shipping installer.

§14.2's "SHOULD NOT present a spectrum of increasingly worried icons; graduated warnings are clicked through at uniform rates" matches the browser-security literature that pushed Chrome and Firefox from graduated SSL warnings to hard interstitials.

### 7.2 The PyPI warning: mandating verifier behavior is the hard part

PEP 740 is the cautionary tale that most directly threatens AnchorID's §14, because PyPI did almost everything right and it still doesn't matter yet.

Production and distribution both shipped. Attestations are Sigstore-backed with **mandatory Rekor inclusion proofs**, generation has been default-on in the official GitHub publish action since late 2024, and PyPI serves them through a dedicated integrity endpoint and the Simple API. PyPI's own 2025 review reports **17% of all uploads in the trailing year carried an attestation**, across 50,000+ projects on Trusted Publishing.

**And no installer verifies any of it.** pip has no verification code and no flag. `uv`'s tracking issue has sat open since November 2024 with no maintainer commitment. The one working verifier is a plugin that isn't published on PyPI and depends on pip's plugin architecture — itself an unmerged RFC open since June 2024.

The lesson for AnchorID: §14 is normatively binding on implementations, but a spec cannot compel a package manager to implement it. **Every property in §3 and §14 is worth exactly as much as the verifier adoption behind it, and adoption is where the comparable efforts have stalled** — not at the crypto, not at the log. AnchorID's §9.1 advice to stay cosign-bundle-compatible so existing CI verifiers work unmodified is the right instinct and deserves more weight than one bullet.

---

## 8. Summary: borrowed vs. invented

### 8.1 Deliberately borrowed — and the spec says so

| Component | Borrowed from | Spec |
|---|---|---|
| DSSE envelope + in-toto statement | Sigstore / in-toto | §9.1 |
| Transparency log, external witnesses | Certificate Transparency → Rekor | §10 |
| RFC 3161 timestamping | Authenticode | §5.4 |
| Stapled offline verification | Apple notarization tickets; Go `go.sum` | §9.3 |
| Ephemeral CI keys bound to workflow identity | Sigstore keyless | §9.5 |
| Thresholds and delegation | TUF | §8.4 |
| Append-only key lineage | Android APK v3 | §5.2 |
| Never delete retired keys | Guix keyring branch | §8.3 |
| Domain + DNS dual anchor | DANE / DKIM patterns | §4.3 |

§9.1's "reuse, do not reinvent" and §10's "the log is not a differentiator and operating one is the hardest infrastructure problem in this design" are the right calls and unusually honest for a draft.

### 8.2 Genuinely novel

| Idea | Spec | Nearest prior art | Gap |
|---|---|---|---|
| Verification MUST emit two non-collapsible assertions | §3 | none | No system separates "key was authorized" from "who this is" |
| Confidence ceiling at the lowest current owner | §7.4 | none | Reputation transfer is unmitigated everywhere else |
| Key must be authorized by the owner it names | §8.1 | none | TUF/Arch/Debian/Safe all allow admin-attributed keys |
| Threshold over distinct *owners*, not keys | §8.4 | TUF (keys), Safe (addresses) | Inverts threshold crypto's aggregation goal |
| Signed-at-`unverified` renders as unsigned | §14.2 | none | Everyone shows an affirmative badge |
| Operator forbidden from gatekeeping who may sign | §12 | none | Every CA and store gates on identity |
| Evidence weighted by cost-to-forge and time observed | §11.2 | cargo-crev partially | Registries count, they don't weight |
| Confidence snapshot frozen at signing time | §9.4 | none | Others recompute silently or not at all |

### 8.3 Where incumbents are clearly ahead

| Gap | Who does it better | Why it matters |
|---|---|---|
| Bootstrapping with no one to vouch | Sigstore and TUF **sidestep it** by needing no reputation | §16.1 unanswered; it killed PGP's WoT and stalled cargo-crev |
| Client-enforced witness quorum | **Signal AKV** (3 auditors, ≤7 days, hard requirement) | §10 requires witnesses but not that anyone check them — see §4.2 |
| Deployed log infrastructure | Rekor (2.3B entries), CT, sum.golang.org | §10 says use an existing log — take that seriously |
| Log durability past the operator | CT's multi-operator ecosystem | §16.4 unanswered; stapling covers verification only |
| Malware detection | Apple notarization actually scans | §15 correctly disclaims it, but users conflate them |
| Threshold policy edge cases | Gnosis Safe's atomic owner+threshold change | §16.5 can strand a package |
| Capability-scoping of retired keys | Android's five per-ancestor flags | §5.2's `purpose` field is coarser |
| Verifier adoption | npm, PyPI, Maven ship today | A spec nothing verifies is worth nothing — see §7.2 |

### 8.4 Verdict

AnchorID is not competing with Sigstore or TUF; it sits on top of them. Sigstore answers "was this signed by an authenticated identity, and is it logged," and stops there deliberately. TUF answers "did enough role keys agree." Notation answers even less — it has no transparency log and no key-rotation mechanism at all, which is a real regression from the Notary v1/TUF design it replaced. None of them has any notion of *who the publisher is over time*, and none claims to.

AnchorID's contribution is a durable subject with attributable multi-owner authority, plus a reputation function a hostile party can recompute, plus the discipline to keep that reputation strictly separate from the cryptographic assertion — which is precisely the separation whose absence made EV code signing worthless. The three unsolved problems are bootstrapping (§16.1), log durability (§16.4), and verifier adoption (not currently in §16, and arguably the largest).

---

## 9. Suggested changes to the spec

Ordered by value.

1. **§10 — require verifiers to enforce a witness quorum policy**, with a minimum count and maximum cosignature age, named in output alongside the confidence policy. Signal's "three independent auditors, signatures ≤7 days old, client refuses without all three" is the model. Without this, AnchorID inherits Go's failure mode: a witness ecosystem that looks like split-view protection but is only out-of-band detection. **This is the single highest-value change in this list.**
2. **§16 — add verifier adoption as an open question.** PEP 740 shipped production and distribution and has zero consumption. That is the failure mode most likely to make this spec irrelevant, and it is currently unacknowledged.
3. **§16.5 — adopt the Gnosis Safe atomic-change pattern**: owner removal and threshold amendment as one signed event, so a package cannot be stranded.
4. **§15 — cite the 2025 empirical cases.** Azure Artifact Signing's certificates signing Lumma Stealer, and the Nikon Z6 III C2PA break with full certificate revocation. Both are stronger evidence than the EV precedent already cited, and both are recent.
5. **§5.2 — borrow Android's per-ancestor capability flags.** "This retired key may still validate installed data but may not authorize a rollback" is a distinction the `purpose` field cannot currently express.
6. **Cite the prior art throughout.** §5.2 → Android signing lineage; §8.3 → Guix's never-remove-keys rule; §13.1 → domain transfer locks and timelocked recovery modules; §10 → Certificate Transparency by name.
7. **§11 — study cargo-crev before finalizing.** It is the only system that shipped a re-derivable public reputation function, and its adoption curve is data about §16.1.
8. **§14 — say what the on-ramp is.** §12 correctly refuses to gatekeep, but a new identity is `unverified` and §14.2 says render that as unsigned. State plainly that early adopters get no display benefit, and why that is acceptable.

---

## 10. Systems deliberately excluded

| System | Why |
|---|---|
| **Keybase** | Effectively dormant post-acquisition; Keyoxide covers the design |
| **Google Key Transparency** | Repo archived 2024-10-11, no successor. Google's shipping "Key Verifier" is QR comparison, not transparency |
| **Android Binary Transparency** | Real and expanded in 2026, but logs *binaries*, not identity |
| **Notary v1 / DCT** | Retired; full shutdown 2026-12-08. Listed in §1.1 for completeness only |
| **Nix / F-Droid** | Signing models add nothing the distro row doesn't already cover |
| **ROAST** | No RFC, no CFRG draft; a robustness wrapper on FROST |
| **W3C DID methods** | Too method-dependent to compare as a unit |

---

## 11. Confidence notes

Everything above was checked against primary sources on 2026-08-13. Items that were **wrong in the first draft of this document** and are now corrected: the Windows service name and cert lifetime, Arch's trust model, Rekor v2's default status, cosign's offline flags, C2PA's version and standardization status, CAWG's organizational home, Google's key-transparency status, and PyPI's PEP 740 deployment state.

Known-contested or fast-moving, hedge if citing:

| Item | Status |
|---|---|
| Play App Signing key-upgrade platform floor | Google's own docs disagree — API 33 on one page, API 24 on another |
| Azure Artifact Signing 3-year-history rule | Announced April 2025; absent from all current Learn pages post-GA |
| C2PA ISO status | ISO/CD 22144 under development, DIS draft on sale; **not a published standard**. Claims that C2PA "is ISO/IEC 22144" are unsupported |
| Azure Artifact Signing HSM level | Microsoft's docs are internally inconsistent (FIPS 140-3 L3 vs 140-2 L3) |
| Rekor v1 sunset date | **None exists.** Any specific date is fabricated; a freeze would be announced a year ahead |
| DNSSEC root KSK | Rollover in progress — KSK-2024 (tag 38696) takes over **2026-10-11**. Separate algorithm rollover to ECDSA planned 2027–2029 |
| CA/B code signing cert lifetime | Cut to **460 days** for certs issued on/after 2026-03-01 (was 39 months). Most write-ups still say 39 months |

Do not cite: the Trail of Bits "Are we PEP 740 yet?" tracker (currently serves an unrendered template), the "132,360 packages with attestations" figure (unsourced), or any claim that CNCF archived Notary or TUF (only the Notary v1 *repo* was archived, 2025-07-31; TUF graduated CNCF in 2019).
