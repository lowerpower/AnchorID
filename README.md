
# AnchorID

**TL;DR:** AnchorID provides a durable, UUID-based identity anchor that lets people prove who they are across websites and platforms without relying on any single service.

**AnchorID** is a minimal, durable identity resolver for people — built on UUIDs, JSON-LD, and verifiable external claims.

It provides a stable, canonical identity record (`/resolve/<uuid>`) that can be linked to websites, GitHub profiles, and other public identities using simple, auditable proofs.

AnchorID is designed for **longevity, decentralization, and crawlability**, not account silos or proprietary identity systems.

---

## Why AnchorID Exists

The modern web has no durable way to say *“this person is the same person”* across time, platforms, and failures. Usernames change, domains expire, companies disappear, and social graphs rot. Identity today is fragmented across silos that users do not control and cannot reliably preserve.

AnchorID exists to provide a **stable, platform-agnostic identity anchor**: a UUID-backed record that is independent of any single service, yet verifiable through many of them. It favors URLs over accounts, proofs over trust, and auditability over convenience. The goal is not to replace identity systems, but to give humans and machines a long-lived reference point that can survive migrations, outages, and decades of change.

---

## What AnchorID Does

At its core, AnchorID provides:

* **Canonical identity URLs**
  `https://anchorid.net/resolve/<uuid>`

* **Machine-readable profiles** (schema.org JSON-LD)

* **Human-readable claims pages**

* **Verifiable external identity claims**

* **Immutable identity anchors** decoupled from platforms

You can think of it as a **permanent “about me” record** that outlives any single website or service.

---

## Core Endpoints

### `/resolve/<uuid>` — Canonical identity record

Returns a JSON-LD `Person` object.

Example:

```bash
curl https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

Includes:

* Stable UUID-based identifier
* `sameAs` links (merged from verified claims)
* Provenance metadata (`dateCreated`, `dateModified`)
* Link to the claims ledger

---

### `/claims/<uuid>` — Claims ledger (JSON + HTML)

Returns the list of identity claims associated with a UUID.

* `Accept: application/json` → machine-readable claims
* `Accept: text/html` → human-readable audit page

Example:

```bash
curl -H "Accept: text/html" https://anchorid.net/claims/<uuid>
```

This page acts as a **public verification ledger**.

---

## Identity Claims

AnchorID supports **self-asserted claims** that can be **verified automatically**.

### Supported claim types

* **Website ownership**
  Proof via:

  ```
  https://example.com/.well-known/anchorid.txt
  ```
* **GitHub identity**
  Proof via GitHub profile README (`username/username` repo)

Each claim includes:

* Proof location
* Verification status
* Verification timestamps
* Failure reasons (if any)

Verified claims are automatically merged into the canonical profile’s `sameAs`.

---

## Data Model (Profiles)

Profiles are stored as schema.org `Person` objects in KV:

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://anchorid.net/resolve/<uuid>",
  "identifier": {
    "@type": "PropertyValue",
    "propertyID": "canonical-uuid",
    "value": "urn:uuid:<uuid>"
  },
  "name": "...",
  "description": "...",
  "url": "...",
  "sameAs": ["..."],
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://anchorid.net/resolve/<uuid>"
  },
  "subjectOf": {
    "@type": "WebPage",
    "@id": "https://anchorid.net/claims/<uuid>"
  },
  "dateCreated": "...",
  "dateModified": "..."
}
```

### Timestamp semantics

* **`dateCreated`** — immutable, set at UUID creation
* **`dateModified`** — updated whenever the stored profile changes
  (manual edits or automated merges from verified claims)

Verification timestamps live **only** in the claims ledger.

---

## Architecture

* **Runtime**: Cloudflare Workers
* **Storage**: Cloudflare KV
* **Language**: TypeScript
* **Auth (admin)**: token-based (cookie or bearer)
* **No database**
* **No user accounts**
* **No platform lock-in**

This is intentional.

---

## Local Development

```bash
git clone https://github.com/lowerpower/AnchorID.git
cd AnchorID
npm install
npm run dev
```

Local server:

```
http://localhost:8787
```

---

## Deploy

```bash
npm run deploy
```

Set admin token if needed:

```bash
npx wrangler secret put ANCHOR_ADMIN_TOKEN
npm run deploy
```

---

## Who AnchorID Is For / Who It’s Not For

### AnchorID *is for*:

* **Independent creators, engineers, and researchers** who want a stable identity that outlives platforms.
* **People publishing long-lived work** (blogs, papers, software, art) who care about attribution decades from now.
* **Systems and crawlers** that need a canonical, machine-readable reference for a person.
* **Decentralization-friendly projects** that prefer URLs, proofs, and auditability over opaque identity providers.

### AnchorID *is not for*:

* **Authentication or login flows** (OAuth, SSO, password systems).
* **Real-time social graphs** or follower-based identity.
* **Privacy-anonymous personas** or unlinkable identities.
* **Consumer onboarding funnels** optimized for growth or engagement.

AnchorID is deliberately boring infrastructure. It optimizes for correctness, persistence, and clarity—not virality or convenience.

---

## AnchorID vs DIDs (Decentralized Identifiers)

AnchorID overlaps conceptually with DIDs, but it makes different tradeoffs.

* **AnchorID** uses plain UUIDs, HTTPS URLs, and schema.org JSON-LD. It is intentionally simple, crawlable, and compatible with today’s web and search infrastructure.
* **DID systems** often introduce new URI schemes, resolution layers, cryptographic key management, and blockchain or registry dependencies.

AnchorID favors **boring, durable primitives** over formal decentralization frameworks. It aims to be something that can still be resolved, understood, and archived decades from now using ordinary web tooling.

---

## Threat Model & Trust Assumptions

AnchorID does not attempt to solve all identity problems. Its trust model is explicit and limited:

* **You control what you publish.** Anyone can create a UUID, but claims must be publicly verifiable to carry weight.
* **Proof beats assertion.** External identities are only elevated when verifiable through durable, third-party-controlled surfaces (e.g., websites, GitHub).
* **Resolvers are not authorities.** AnchorID asserts *canonical references*, not absolute truth. Consumers decide how much trust to place in a record.
* **No hidden trust roots.** There are no private databases, opaque reputation scores, or undisclosed validators.

AnchorID assumes an adversarial web where links rot, platforms fail, and incentives shift. It is designed so that identity continuity can be evaluated long after the original system or operator is gone.

---

## Design Principles

* **Stability over novelty**
* **URLs over accounts**
* **Proof over trust**
* **Human-auditable by default**
* **Machine-readable always**
* **Decentralization-friendly**

AnchorID does not try to replace identity systems.
It gives you a **durable anchor** that other systems can reference.

---

## Status

Active development.
Single-maintainer project.
Schema-first, migration-light, intentionally boring.

---

## License

MIT


