# DNS Proof Implementation - January 20, 2026

## Overview

Added DNS TXT record verification as a new proof type for AnchorID, allowing users to prove domain ownership by publishing DNS records. Includes complete user-facing documentation for all proof types.

**Commit:** `44757c8e79581d641f854553c212af22be3cb490`
**Date:** January 19, 2026
**Status:** Deployed and tested in production

---

## What Was Added

### DNS Proof Verification System

A complete DNS-based identity proof system that allows users to verify domain ownership through DNS TXT records.

**Key Features:**
- DNS-over-HTTPS (DoH) queries via Cloudflare JSON API
- Support for 4 TXT record value formats
- Automatic normalization and UUID validation
- Support for both `_anchorid.domain` (recommended) and apex domain methods
- Reuses existing rate limiting infrastructure

### User Documentation

Complete user-facing documentation covering all three proof types:
- Website proof (`.well-known/anchorid.txt`)
- DNS proof (TXT records)
- GitHub proof (profile README)

---

## Technical Implementation

### Files Modified

#### 1. `src/claims/types.ts`
Added DNS claim type and proof kind:
```typescript
export type Claim = {
  type: "website" | "github" | "dns";  // Added "dns"
  // ...
};

export type ClaimProof =
  | { kind: "well_known"; url: string; mustContain: string }
  | { kind: "github_readme"; url: string; mustContain: string }
  | { kind: "dns_txt"; qname: string; expectedToken: string };  // New
```

#### 2. `src/claims/verify.ts`
Added DNS verification logic (180+ lines):

**New Functions:**
- `claimIdForDns(qname: string)` - Generate claim ID from qname
- `buildDnsProof(qname: string, uuid: string)` - Build DNS proof structure
- `normalizeDnsTxtValue(raw: string)` - Normalize TXT records per spec
- `extractUuidFromDnsValue(normalized: string)` - Extract/validate UUID
- `buildExpectedDnsTokens(uuid: string)` - Generate accepted token formats
- `queryDnsTxt(qname: string)` - Query DNS via Cloudflare DoH API
- `verifyDnsClaim(claim: Claim)` - Complete DNS verification logic

**Updated Functions:**
- `verifyClaim()` - Added DNS claim routing

#### 3. `src/claims/handlers.ts`
Added DNS claim handling:

**Changes:**
- Updated type validation to accept `"dns"` type
- Added DNS claim creation logic
- Parses domain input to determine qname
- Supports both `_anchorid.domain` and explicit subdomain
- Generates claim ID and proof structure

#### 4. `src/index.ts`
Added `/proofs` route and updated navigation:
```typescript
// New route
if (path === "/proofs" || path === "/proofs/") {
  const html = await env.ANCHOR_KV.get("page:proofs");
  // ...
}

// Updated navigation
<nav>
  <a href="/proofs">Proofs</a>  <!-- Added -->
</nav>
```

#### 5. `src/content/README.md`
Added deploy command for proofs page:
```bash
npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs" \
  --path ./src/content/proofs.html
```

### Files Created

#### Documentation Files

**`docs/proofs/README.md`** (50 lines)
- Overview of all proof types
- Signal strength comparison
- Links to detailed guides

**`docs/proofs/website.md`** (196 lines)
- `.well-known/anchorid.txt` setup guide
- Web server configuration (Apache, Nginx, SPA)
- Troubleshooting section
- Security considerations
- API usage examples

**`docs/proofs/dns.md`** (92 lines)
- DNS TXT record setup guide
- Subdomain vs apex methods
- Troubleshooting DNS propagation
- What DNS proof is good for

**`docs/proofs/github.md`** (248 lines)
- GitHub profile README setup
- Repository requirements
- Example README
- Privacy considerations
- Why GitHub matters for identity

#### Specification

**`docs/specs/dns-proof-v1.md`** (168 lines)
Developer-focused technical specification:
- Record name conventions (QNAME)
- Record value formats (canonical and accepted)
- Normalization rules
- Verification procedure
- DoH implementation details
- Timeout and retry logic
- Security considerations

#### User Interface

**`src/content/proofs.html`** (354 lines)
User-facing documentation page:
- Overview of identity proofs
- How proofs work
- Available proof types with cards
- Proof strength comparison table
- API usage examples
- Security notes

---

## DNS Proof Specification

### Accepted TXT Record Formats

All of these are accepted and normalized:
1. `anchorid=urn:uuid:<uuid>` (canonical/recommended)
2. `anchorid=<uuid>`
3. `urn:uuid:<uuid>`
4. `https://anchorid.net/resolve/<uuid>`

### DNS Record Methods

**Recommended (subdomain):**
```
Name:  _anchorid
Type:  TXT
Value: anchorid=urn:uuid:4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

Creates: `_anchorid.example.com`

**Optional (apex):**
```
Name:  @ (or blank)
Type:  TXT
Value: anchorid=urn:uuid:4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

Creates: `example.com`

### Normalization Process

1. Trim leading/trailing whitespace
2. Strip outer quotes if present
3. Collapse consecutive whitespace
4. Normalize `anchorid=` prefix to lowercase
5. Extract and validate UUID (8-4-4-4-12 hex format)
6. Compare against expected tokens

### Verification Flow

1. User creates DNS claim via API: `POST /claim`
2. User publishes DNS TXT record at `_anchorid.domain`
3. User requests verification: `POST /claim/verify`
4. AnchorID queries DNS via Cloudflare DoH
5. TXT record normalized and UUID extracted
6. UUID compared against expected value
7. Claim marked as `verified` or `failed`

---

## API Usage

### Create DNS Claim

```bash
curl -X POST https://anchorid.net/claim \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "4ff7ed97-b78f-4ae6-9011-5af714ee241c",
    "type": "dns",
    "url": "example.com"
  }'
```

**Response:**
```json
{
  "ok": true,
  "claim": {
    "id": "dns:_anchorid.example.com",
    "type": "dns",
    "url": "example.com",
    "status": "self_asserted",
    "proof": {
      "kind": "dns_txt",
      "qname": "_anchorid.example.com",
      "expectedToken": "anchorid=urn:uuid:4ff7ed97-..."
    },
    "createdAt": "2026-01-20T01:12:27.718Z",
    "updatedAt": "2026-01-20T01:12:27.718Z"
  }
}
```

### Verify DNS Claim

```bash
curl -X POST https://anchorid.net/claim/verify \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "4ff7ed97-b78f-4ae6-9011-5af714ee241c",
    "id": "dns:_anchorid.example.com"
  }'
```

**Response:**
```json
{
  "ok": true,
  "claim": {
    "id": "dns:_anchorid.example.com",
    "type": "dns",
    "url": "example.com",
    "status": "verified",
    "proof": {
      "kind": "dns_txt",
      "qname": "_anchorid.example.com",
      "expectedToken": "anchorid=urn:uuid:4ff7ed97-..."
    },
    "createdAt": "2026-01-20T01:12:27.718Z",
    "updatedAt": "2026-01-20T01:12:46.019Z",
    "lastCheckedAt": "2026-01-20T01:12:46.019Z",
    "verifiedAt": "2026-01-20T01:12:46.019Z"
  }
}
```

---

## Testing

### Test Environment
- **Domain:** mycal.net
- **UUID:** 4ff7ed97-b78f-4ae6-9011-5af714ee241c
- **DNS Record:** `_anchorid.mycal.net`
- **TXT Value:** `anchorid=urn:uuid:4ff7ed97-b78f-4ae6-9011-5af714ee241c`

### Test Results

✅ DNS record published and propagated
✅ DoH query successful
✅ TXT record normalized correctly
✅ UUID extracted and validated
✅ Claim created successfully
✅ Claim verified successfully
✅ Status updated to `verified`
✅ Timestamps recorded (`verifiedAt`, `lastCheckedAt`)

**Live proof:** https://anchorid.net/claims/4ff7ed97-b78f-4ae6-9011-5af714ee241c

---

## Deployment

### Production Deployment

```bash
# Deploy worker code
npm run deploy

# Deploy proofs page to KV
npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs" \
  --path ./src/content/proofs.html

# Set admin token (if needed)
echo "YOUR_TOKEN" | npx wrangler secret put ANCHOR_ADMIN_TOKEN
```

### Verification

```bash
# Test /proofs page
curl -s https://anchorid.net/proofs | grep "<title>"

# Test DNS verification endpoint
curl -s "https://cloudflare-dns.com/dns-query?name=_anchorid.mycal.net&type=TXT" \
  -H "accept: application/dns-json" | jq .
```

---

## User-Facing Changes

### New Page: `/proofs`

**URL:** https://anchorid.net/proofs

**Content:**
- Overview of identity proofs system
- Three proof type cards (Website, DNS, GitHub)
- Proof strength comparison table
- Step-by-step verification instructions
- API usage examples
- Security considerations
- Links to detailed GitHub documentation

### Navigation Updates

Added "Proofs" link to all pages:
```
Home | About | Guide | Proofs | FAQ | Privacy
```

### GitHub Documentation

All proof guides are now available on GitHub:
- https://github.com/lowerpower/anchorid/blob/main/docs/proofs/website.md
- https://github.com/lowerpower/anchorid/blob/main/docs/proofs/dns.md
- https://github.com/lowerpower/anchorid/blob/main/docs/proofs/github.md

---

## Technical Notes

### DNS-over-HTTPS Implementation

Used Cloudflare DoH JSON API instead of `node:dns`:
- More portable (no nodejs_compat required)
- Direct HTTP fetch
- Clean JSON response format
- Type 16 = TXT records

**Endpoint:**
```
https://cloudflare-dns.com/dns-query?name=<qname>&type=TXT
```

**Headers:**
```
Accept: application/dns-json
```

### Rate Limiting

Reuses existing claim verification rate limits:
- No new rate limit buckets needed
- Consistent with website and GitHub proofs
- Prevents abuse of verification endpoint

### Caching

No caching implemented initially:
- Simpler implementation
- Can be added later if needed
- DNS queries are fast enough (~100-500ms)

---

## Statistics

### Code Changes

- **11 files changed**
- **1,350+ insertions**
- **8 deletions**
- **6 new files created**
- **5 files modified**

### Documentation

- **754 lines** of user documentation (website.md, dns.md, github.md)
- **168 lines** of technical specification (dns-proof-v1.md)
- **354 lines** of HTML for /proofs page
- **50 lines** of index documentation

### Implementation

- **180+ lines** of DNS verification logic
- **45+ lines** of handler updates
- **5 new exported functions**
- **1 new claim type**
- **1 new proof kind**

---

## Future Enhancements

Potential improvements identified during implementation:

1. **Caching** - Add TTL-based caching for DNS queries
2. **Admin UI** - Add DNS claims to admin interface
3. **Retries** - Add retry logic for transient DNS failures
4. **Monitoring** - Track DNS verification success/failure rates
5. **Additional TXT formats** - Support more flexible formatting
6. **Batch verification** - Verify multiple claims at once
7. **Webhook notifications** - Alert on verification status changes

---

## Links

### Live URLs
- **Proofs page:** https://anchorid.net/proofs
- **Test claim:** https://anchorid.net/claims/4ff7ed97-b78f-4ae6-9011-5af714ee241c
- **Resolver:** https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c

### GitHub
- **Commit:** https://github.com/lowerpower/AnchorID/commit/44757c8e79581d641f854553c212af22be3cb490
- **Website proof docs:** https://github.com/lowerpower/anchorid/blob/main/docs/proofs/website.md
- **DNS proof docs:** https://github.com/lowerpower/anchorid/blob/main/docs/proofs/dns.md
- **GitHub proof docs:** https://github.com/lowerpower/anchorid/blob/main/docs/proofs/github.md
- **DNS spec:** https://github.com/lowerpower/anchorid/blob/main/docs/specs/dns-proof-v1.md

---

## Checklist

- [x] DNS proof implementation
- [x] DNS verification via DoH
- [x] Normalization logic
- [x] UUID validation
- [x] API endpoints
- [x] Rate limiting
- [x] User documentation (website, DNS, GitHub)
- [x] Technical specification
- [x] /proofs page
- [x] Navigation updates
- [x] Testing with real domain
- [x] Production deployment
- [x] Commit and push
- [x] Documentation

---

**Status:** Complete and deployed ✅
