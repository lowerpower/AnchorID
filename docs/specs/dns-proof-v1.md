# docs/spec/dns-proof-v1.md

# AnchorID DNS Proof (v1) - Developer Spec

## 0. Purpose

DNS Proof binds an AnchorID UUID to control of a DNS zone by publishing a TXT record
and having AnchorID verify it.

This proof demonstrates **domain control**, not personhood or legal identity.

## 1. Record Name (QNAME)

### Default / Recommended
`_anchorid.<domain>`

Example:
- `_anchorid.example.com`

Rationale: avoids collisions with apex TXT records (SPF/DKIM/DMARC), keeps intent clear.

### Optional (allowed)
Apex TXT at `<domain>` for providers/users who insist.

Implementation MUST support verifying either:
- `_anchorid.<domain>` (default), or
- `<domain>` (explicit user choice)

## 2. Record Type

TXT

## 3. Record Value

### Canonical value (recommended)
`anchorid=urn:uuid:<uuid>`

Example:
`anchorid=urn:uuid:4ff7ed97-b78f-4ae6-9011-5af714ee241c`

### Accepted value forms (tolerance)
To reduce support burden, v1 SHOULD accept all of the following after normalization:

- `anchorid=urn:uuid:<uuid>` (canonical)
- `anchorid=<uuid>`
- `urn:uuid:<uuid>`
- `https://anchorid.net/resolve/<uuid>`

Matching is exact after normalization (see §7).

## 4. Verification Inputs

- `domain` (string; accept IDN but normalize to ASCII/punycode before query)
- `uuid` (canonical UUID string)

Optional:
- `method`: `"subdomain"` (default) or `"apex"`

## 5. Verification Procedure (MUST)

1. Determine `qname`:
   - if method = subdomain: `_anchorid.${domain}`
   - if method = apex: `${domain}`

2. Query TXT records for `qname`.

3. For each TXT RR, the resolver may return an array of strings.
   Implementations MUST:
   - join the strings in-order to form the record text value
   - treat each RR as one candidate value

Note: TXT strings are limited per-string (often 255 bytes). Long TXT data may be split
into multiple strings which must be concatenated by the reader. See RFC 4408 notes
and common DNS operator guidance. (AnchorID behavior: concatenate). 

4. Normalize candidate values (see §7).

5. Build the set of expected normalized tokens for the UUID (based on accepted forms).

6. Verification succeeds if ANY normalized candidate equals ANY expected token.

## 6. Resolver Method (Cloudflare Workers)

Workers cannot do raw UDP DNS, but DNS proof can be implemented via DNS-over-HTTPS:

### Option A: node:dns (recommended)
Enable `nodejs_compat`, then use `node:dns` to resolve TXT via DoH to Cloudflare DNS. 
Cloudflare docs: `node:dns` works in Workers via DoH. 

### Option B: DoH JSON via fetch (portable)
Use Cloudflare DoH JSON endpoint:
`https://cloudflare-dns.com/dns-query?name=...&type=TXT`
with `Accept: application/dns-json`.

Cloudflare documents JSON mode and schema compatibility with Google's DoH JSON.

## 7. Normalization Rules (MUST)

Given a raw TXT RR text value:

1. Trim leading/trailing whitespace.
2. If surrounded by a single pair of double quotes, strip the outer quotes.
3. Collapse consecutive whitespace to a single space (optional but recommended).
4. If value begins with `anchorid=` (case-insensitive key):
   - keep key normalized to lowercase `anchorid=`
5. Extract UUID if value is:
   - `anchorid=<...>`
   - `urn:uuid:<...>`
   - `https://anchorid.net/resolve/<...>`
6. Validate UUID strictly (8-4-4-4-12 hex). Reject if invalid.
7. Normalize final comparison token(s) to one of:
   - `anchorid=urn:uuid:<uuid>` (preferred canonical token), OR
   - compare against multiple expected tokens (see §3) consistently.

Implementation choice:
- Either normalize everything to canonical `anchorid=urn:uuid:<uuid>` and compare,
  OR compare raw-normalized tokens against a set of expected forms.
Canonicalization is recommended.

Non-ASCII content should not be required. AnchorID SHOULD accept ASCII only.

## 8. Timeouts, Retries, and Caching

Suggested defaults:

- Per-request DNS/DoH timeout: 2.5s
- Overall verification timeout: 5s
- Retry: 1 retry on transient network errors (timeout / 5xx)
- Cache key: `(qname, TXT)`
  - success cache: 15 minutes
  - failure cache: 2 minutes
  - provide "Recheck now" to bypass cache

If TTL is available from the resolver response, TTL-bounded caching is preferred.

## 9. Stored Proof Object (suggested)

Store a proof entry on the anchor:

- `type`: `"dns_txt"`
- `domain`: `"example.com"`
- `qname`: `"_anchorid.example.com"` (or `"example.com"` for apex)
- `token`: `"anchorid=urn:uuid:<uuid>"` (canonical normalized form)
- `verifiedAt`: ISO timestamp
- `lastCheckedAt`: ISO timestamp
- `status`: `"verified" | "failed"`

Do not store secrets (none needed).

## 10. Security / Abuse

- DNS proof is domain-control only. Do not treat as exclusive identity.
- Rate-limit verifications per IP / per domain / per UUID.
- Avoid leaking internal resolver details as a trust claim.
- Be careful with IDN: normalize to punycode before querying to avoid homograph confusion.

## 11. Reference Notes (for maintainers)

- Cloudflare DoH JSON docs and request formats
- Cloudflare Workers `node:dns` support (via DoH)
- TXT record string-splitting and concatenation guidance for >255-byte values


User Facing Docs are here, probably need a proofs link at top that explains the proofs
docs/proofs/dns.md



