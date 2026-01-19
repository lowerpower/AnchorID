# AnchorID Identity Model

This document describes how AnchorID represents and manages identity.

---

## Core Concept

An AnchorID is a **permanent, UUID-based identity anchor**. It provides a stable reference point that can be linked to external identities (websites, GitHub profiles, etc.) through verifiable proofs.

The system does not authenticate users or grant identity. It answers a narrower question:

> "Can this person demonstrate continuity across independent systems?"

---

## The Canonical Profile

Each AnchorID is a schema.org `Person` object stored as JSON-LD. The canonical URL is:

```
https://anchorid.net/resolve/<uuid>
```

### Required Fields

| Field | Description |
|-------|-------------|
| `@context` | Always `"https://schema.org"` |
| `@type` | Always `"Person"` |
| `@id` | The canonical resolve URL |
| `identifier` | A `PropertyValue` containing `urn:uuid:<uuid>` |
| `dateCreated` | ISO 8601 timestamp, set once at creation, never changes |
| `dateModified` | ISO 8601 timestamp, updated only when profile content changes |
| `mainEntityOfPage` | Reference to the resolve URL |
| `subjectOf` | Reference to the claims ledger URL |
| `isPartOf` | Reference to the AnchorID website |

### Optional Fields

| Field | Description |
|-------|-------------|
| `name` | Primary human-readable name |
| `alternateName` | Array of other names (legal name, handle, transliteration) |
| `description` | Short description of the person |
| `url` | Canonical "about me" page |
| `sameAs` | Array of URLs representing the same person |

---

## Timestamp Semantics

AnchorID treats timestamps as meaningful signals, not metadata.

- **`dateCreated`**: Immutable. Set once when the profile is first created. Represents the birth of this identity anchor.

- **`dateModified`**: Updated only when the profile structurally changes. If you save without changing anything, the timestamp does not bump. This makes `dateModified` a reliable indicator of actual change.

---

## URL Canonicalization

All URLs in the profile are normalized to a canonical form:

1. Protocol forced to `https://`
2. Hostname lowercased
3. Fragments removed
4. Default ports (80, 443) removed
5. Trailing slashes removed

This ensures that `http://Example.com/` and `https://example.com` resolve to the same canonical URL, preventing duplicate entries and simplifying comparisons.

---

## The sameAs Model

The `sameAs` field links an AnchorID to external identities. AnchorID maintains three conceptual sets:

### 1. Manual sameAs (stored)

URLs you explicitly add via the edit interface. These are stored directly in your profile and can be edited at any time.

Examples:
- `https://github.com/username`
- `https://linkedin.com/in/username`
- `https://example.com`

### 2. Verified sameAs (from claims)

URLs proven through the claims verification system. These cannot be edited directly—they are derived from successful claim verifications.

When you verify ownership of a website or GitHub profile, that URL is automatically included in your public sameAs.

### 3. Effective sameAs (public)

What the public sees at `/resolve/<uuid>`. This is the union of manual and verified URLs, deduplicated and sorted.

```
effective = manual ∪ verified
```

This merge happens at resolve-time, not storage-time, so:
- Manual links can be removed without affecting verified claims
- Verified claims persist independently of manual edits
- The public view is always the complete set

---

## Claims and Verification

Claims are assertions of identity linkage, stored in a separate ledger at:

```
https://anchorid.net/claims/<uuid>
```

### Claim Types

**Website Claim**
- Proof: Place a file at `https://domain/.well-known/anchorid.txt`
- Contents: Must include the full resolve URL
- Verification: AnchorID fetches the file and checks for the URL

**GitHub Claim**
- Proof: Add your resolve URL to your GitHub profile README
- The README must be in a repo matching your username (`username/username`)
- Verification: AnchorID fetches the raw README and checks for the URL

### Claim States

| State | Meaning |
|-------|---------|
| `pending` | Claim submitted, not yet verified |
| `verified` | Proof successfully observed |
| `failed` | Verification attempted but proof not found |

### Claim Lifecycle

1. User submits claim (type + URL)
2. System generates a claim ID and proof requirement
3. User places proof at the required location
4. User triggers verification
5. System checks proof, updates claim status
6. If verified, URL appears in effective sameAs

Claims are append-only with status updates. The ledger provides a history of when claims were made and verified.

---

## Access Model

AnchorID has no accounts or passwords. Access is controlled through:

### Email Magic Links

- Request an edit link at `/login`
- A one-time link is sent to your registered email
- Link expires after 15 minutes
- Consumed after first successful save

### Backup Token

- Generated once at profile creation
- Shown only once (store it securely)
- Allows edit access if email is unavailable
- Can be rotated but not recovered

### Admin Access

- Separate token for administrative operations
- Not used for normal profile editing

---

## Data Storage

All data is stored in Cloudflare KV with predictable key patterns:

| Key Pattern | Contents |
|-------------|----------|
| `profile:<uuid>` | Canonical Person JSON-LD |
| `claims:<uuid>` | Claims ledger array |
| `email:<hash>` | Maps email hash to UUID |

Profiles are permanent. There is no delete operation by design—the identifier is meant to be stable forever.

---

## Design Principles

1. **Proof over trust**: Claims are publicly verifiable, not asserted by authority
2. **Durability over convenience**: Boring technologies that will remain interpretable
3. **Immutability where it matters**: UUID and dateCreated never change
4. **Transparency**: All proofs, claims, and resolutions are public
5. **Minimal surface area**: No features that aren't essential to the core mission

---

## Example Profile

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://anchorid.net/resolve/550e8400-e29b-41d4-a716-446655440000",
  "identifier": {
    "@type": "PropertyValue",
    "propertyID": "canonical-uuid",
    "value": "urn:uuid:550e8400-e29b-41d4-a716-446655440000"
  },
  "dateCreated": "2025-01-15T10:30:00.000Z",
  "dateModified": "2025-01-16T14:22:00.000Z",
  "name": "Jane Developer",
  "alternateName": ["jdev", "Jane D."],
  "url": "https://janedev.example.com",
  "sameAs": [
    "https://github.com/janedev",
    "https://linkedin.com/in/janedev"
  ],
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://anchorid.net/resolve/550e8400-e29b-41d4-a716-446655440000",
    "url": "https://anchorid.net/resolve/550e8400-e29b-41d4-a716-446655440000"
  },
  "subjectOf": {
    "@type": "WebPage",
    "@id": "https://anchorid.net/claims/550e8400-e29b-41d4-a716-446655440000",
    "url": "https://anchorid.net/claims/550e8400-e29b-41d4-a716-446655440000",
    "name": "AnchorID Claims"
  },
  "isPartOf": {
    "@type": "WebSite",
    "@id": "https://anchorid.net/#website",
    "url": "https://anchorid.net",
    "name": "AnchorID"
  }
}
```

This document can be fetched, parsed, and understood by any system that supports JSON and schema.org—no AnchorID-specific software required.
