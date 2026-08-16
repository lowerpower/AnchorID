# AnchorID Organizations (MVP Design)

## Purpose

Add first-class support for **Organization** identities in AnchorID while preserving the system’s core principles:

* **Boring, durable primitives**
* **JSON-first canonical records**
* **Minimal writes, mostly reads**
* **Auditability over authority**

This document specifies the minimal, future-proof design for Organizations in the AnchorID data model, API surface, and rendering.

---

## Guiding principles

* **AnchorID doesn’t need to be big — it needs to be right.**
* Treat records as long-lived artifacts that should remain interpretable with only:

  * a URL fetcher
  * a JSON parser
* Avoid semantics that imply institutional authority or HR-grade truth.

---

## Entity types

AnchorID supports two top-level entity types for MVP:

* `Person`
* `Organization`

The `/resolve/<uuid>` endpoint returns **exactly one canonical JSON-LD record** for either type.

---

## Canonical identifier

Each record is anchored by:

* `@id`: `https://anchorid.net/resolve/<uuid>`
* `identifier`: schema.org `PropertyValue` with a canonical URN

Example:

```json
"identifier": {
  "@type": "PropertyValue",
  "propertyID": "canonical-uuid",
  "value": "urn:uuid:<uuid>"
}
```

---

## Organization schema (MVP)

### Required fields

* `@context`: `https://schema.org`
* `@type`: `Organization`
* `@id`: `https://anchorid.net/resolve/<uuid>`
* `identifier` (canonical-uuid)
* `name`
* `dateCreated`
* `dateModified`

### Optional fields (recommended)

* `url` (absolute `https://`)
* `sameAs` (array of absolute `https://` URLs)
* `alternateName` (array)

### Optional relationship fields (MVP)

#### `founder` (array)

Schema.org allows multiple founders; model as an array from day one.

* Optional
* If present: **array** of objects containing only `@id`

Example:

```json
"founder": [
  {"@id": "https://anchorid.net/resolve/<person-uuid>"}
]
```

#### `foundingDate` (optional)

ISO 8601 date string if available.

### Claims page linkage

Include `subjectOf` pointing to the human audit page:

```json
"subjectOf": {
  "@type": "WebPage",
  "@id": "https://anchorid.net/claims/<uuid>",
  "url": "https://anchorid.net/claims/<uuid>",
  "name": "AnchorID Claims"
}
```

---

## Person schema additions (MVP)

### Existing fields

Person records remain as implemented today.

### Optional relationship field: `affiliation` (constrained)

Schema.org allows `affiliation` to target `Organization | Person`. For MVP, AnchorID **constrains** affiliation targets to **Organization** records.

* Optional
* If present: **array** of objects containing only `@id`
* Each `@id` must resolve to an AnchorID record whose `@type` is `Organization`

Example:

```json
"affiliation": [
  {"@id": "https://anchorid.net/resolve/<org-uuid>"}
]
```

### Deferred fields (explicitly not MVP)

* `member`
* `employee`
* `worksFor`

Rationale: these are semantics-heavy, change over time, and introduce governance/dispute surface.

---

## API / routes (MVP)

### Public read endpoints (no auth)

* `GET /resolve/<uuid>`

  * Returns canonical JSON-LD for either `Person` or `Organization`.
* `GET /claims/<uuid>`

  * Human-readable audit page for either type.

### Content negotiation (recommended)

Keep JSON canonical while supporting HTML views:

* `/resolve/<uuid>` returns JSON-LD by default.
* If `Accept: text/html` (or `?format=html`), return minimal HTML that **embeds the same JSON-LD**.

### Write endpoints (minimal; unchanged conceptually)

No new endpoints are required solely to support Organizations, assuming your create/update APIs accept `@type`.

At minimum, write operations should support:

* Create record with `@type: Organization`
* Update limited fields (`name`, `url`, `sameAs`, `alternateName`, `founder`, timestamps)

---

## Validation and normalization rules

### Type safety

* `@type` must be exactly `Person` or `Organization`.

### URL hygiene

* `url` and all `sameAs` entries must be absolute `https://` URLs.
* Normalize `sameAs` URLs (as you already do).

### `founder` rules

* If present: must be an array.
* Each entry must be an object with `@id` only.
* For MVP: each `@id` must point to an AnchorID record of type `Person`.

### `affiliation` rules (MVP constraint)

* If present: must be an array.
* Each entry must be an object with `@id` only.
* For MVP: each `@id` must resolve to an AnchorID record of type `Organization`.

### Minimalism

Avoid adding fields that require interpretation or authority beyond simple verification.

---

## Claims / verification (MVP impact)

Organizations use the **same claims mechanics** as persons:

* claims are observations over time
* proofs are public, human-readable artifacts

MVP goal: Organizations can be created and read immediately; verification types can be the same:

* domain proof (/.well-known/...)
* GitHub proof (repo/profile)
* other URL-based proofs

---

## HTML pages and JSON-LD embedding (Cloudflare deploy)

### Recommendation

* Embed JSON-LD in **all human-facing HTML pages** you serve (including `/claims/<uuid>` and any HTML view of `/resolve/<uuid>`).

### Canonical truth rule

The JSON-LD embedded in HTML must be **identical** (or a strict subset of) the canonical JSON returned by `/resolve/<uuid>`.

---

## Minimal example: Organization record

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://anchorid.net/resolve/<org-uuid>",
  "identifier": {
    "@type": "PropertyValue",
    "propertyID": "canonical-uuid",
    "value": "urn:uuid:<org-uuid>"
  },
  "name": "AnchorID",
  "url": "https://anchorid.net/",
  "sameAs": ["https://github.com/<org>"],
  "founder": [
    {"@id": "https://anchorid.net/resolve/<person-uuid>"}
  ],
  "dateCreated": "2026-01-18T00:00:00Z",
  "dateModified": "2026-01-18T00:00:00Z",
  "subjectOf": {
    "@type": "WebPage",
    "@id": "https://anchorid.net/claims/<org-uuid>",
    "url": "https://anchorid.net/claims/<org-uuid>",
    "name": "AnchorID Claims"
  }
}
```

---

## Release checklist (MVP)

* [ ] Add `Organization` to allowed `@type` set
* [ ] Update validation to support `founder[]`
* [ ] Update rendering for `/claims/<uuid>` to display `Organization` and founders
* [ ] Add optional `affiliation[]` on Person, constrained to Organization targets
* [ ] Ensure `/resolve/<uuid>` works for both types
* [ ] Ensure embedded JSON-LD in HTML is identical/subset of canonical JSON

---

## Explicit non-goals (MVP)

* Membership graphs (`member`, `employee`, `worksFor`)
* Role modeling (titles, tenure, permissions)
* Governance/attestation systems
* Complex org structures (departments, subsidiaries)





