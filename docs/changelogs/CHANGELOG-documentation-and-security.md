# Documentation Updates & Security Hardening - January 22, 2026

## Overview

Comprehensive documentation updates to reflect user self-service claims functionality, plus security hardening with rate limiting on claim endpoints. This update ensures all user-facing and developer documentation accurately describes the new self-service claims workflow and protects the system from abuse.

**Date:** January 22, 2026
**Status:** Implemented and ready for deployment
**Scope:** Documentation updates + security hardening

---

## What Was Added

### 1. FAQ Documentation Updates

Comprehensive updates to `docs/faq.md` to document all new features:

**Backup Token Login:**
- Documented the new backup token login tab on `/login` page
- Added step-by-step instructions for using backup token
- Clarified both methods: form-based and direct URL

**Claims Management:**
- Added "How do I add and manage claims?" section
- Documented user self-service claims UI on `/edit` page
- Updated all claim verification instructions to reference the edit page UI
- Added DNS claim verification instructions (third claim type)
- Enhanced troubleshooting with DNS-specific guidance

**Profile Deletion:**
- Updated to reflect 7-day deletion window
- Explained the grace period for test accounts
- Clarified long-term permanence after 7 days

**API Documentation:**
- Added authenticated claim endpoints (`/claim`, `/claim/verify`)
- Documented session token authentication
- Explained admin vs. user access patterns

**Rate Limiting:**
- Added claim-specific rate limits to the FAQ
- Documented both IP and UUID-based limits

### 2. Proofs Page Updates

Updated `src/content/proofs.html` to document the new user workflow:

**Web Interface Section:**
- Replaced "Admin UI" with "Web Interface (Recommended)"
- Added complete user flow from `/login` to verification
- Documented the "Identity Claims" section on edit page
- Added note about real-time feedback

**API Section:**
- Clarified session token authentication
- Updated API examples with proper headers
- Explained token validity period

**Metadata:**
- Updated last modified date to January 22, 2026
- Updated JSON-LD dateModified timestamp

### 3. Rate Limiting on Claim Endpoints

Added comprehensive rate limiting to `/claim` and `/claim/verify` endpoints to prevent abuse.

**Rate Limits:**
- **Per-IP Limits:**
  - Claim creation: 30/hour (configurable via `IP_CLAIM_RL_PER_HOUR`)
  - Claim verification: 20/hour (configurable via `IP_VERIFY_RL_PER_HOUR`)
- **Per-UUID Limits:**
  - Claim creation: 10/hour (configurable via `CLAIM_RL_PER_HOUR`)
  - Claim verification: 20/hour (configurable via `VERIFY_RL_PER_HOUR`)

**Admin Privileges:**
- Admins bypass per-UUID rate limits
- Only IP-based limits apply to admin operations
- Prevents admin rate limiting while still preventing IP-based abuse

**Security Benefits:**
- Prevents spam claim creation
- Limits excessive verification requests
- Prevents abuse of DNS-over-HTTPS queries to Cloudflare
- Protects against DoS attacks on claim endpoints
- Maintains system performance under load

---

## Technical Implementation

### Rate Limiting Logic

**Flow for `/claim` endpoint:**

```typescript
// 1. Check IP rate limit (all users including admins)
const ipLimit = parseInt(env.IP_CLAIM_RL_PER_HOUR || "30", 10);
const ipRateLimited = await checkIpRateLimit(request, env, "ip:claim", ipLimit);
if (ipRateLimited) return ipRateLimited;

// 2. Authenticate (admin or user session)
const adminDenied = requireAdmin(request, env);
if (!adminDenied) {
  // Admin - skip per-UUID rate limit
  return handlePostClaim(...);
}

// 3. Check user session for own profile
const session = await env.ANCHOR_KV.get(`login:${sessionToken}`, { type: "json" });
if (session?.uuid && session.uuid === targetUuid) {
  // User - check per-UUID rate limit
  const maxPerHour = parseInt(env.CLAIM_RL_PER_HOUR || "10", 10);
  const rl = await incrWithTtl(env.ANCHOR_KV, `rl:claim:${targetUuid}`, 3600);
  if (rl > maxPerHour) {
    return json({ error: "rate_limited", message: "Too many claim operations" }, 429);
  }
  return handlePostClaim(...);
}

return new Response("Unauthorized", { status: 401 });
```

**Flow for `/claim/verify` endpoint:**
- Same pattern as `/claim` but with separate rate limit counters
- Uses `IP_VERIFY_RL_PER_HOUR` (default: 20) for IP limits
- Uses `VERIFY_RL_PER_HOUR` (default: 20) for UUID limits

### New Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `IP_CLAIM_RL_PER_HOUR` | 30 | Max claim operations per IP per hour |
| `IP_VERIFY_RL_PER_HOUR` | 20 | Max verification attempts per IP per hour |
| `CLAIM_RL_PER_HOUR` | 10 | Max claim operations per UUID per hour |
| `VERIFY_RL_PER_HOUR` | 20 | Max verification attempts per UUID per hour |

### New KV Key Patterns

| Pattern | Description | TTL |
|---------|-------------|-----|
| `rl:claim:<uuid>` | Per-UUID claim creation counter | 1 hour |
| `rl:verify:<uuid>` | Per-UUID verification counter | 1 hour |
| `rl:ip:claim:<iphash>` | Per-IP claim creation counter | 1 hour |
| `rl:ip:verify:<iphash>` | Per-IP verification counter | 1 hour |

### Files Modified

**Security/Rate Limiting:**
- `src/index.ts` (+40 lines): Added rate limiting to `/claim` and `/claim/verify`

**Documentation:**
- `docs/faq.md` (+52 lines, -17 lines): Updated with new features
- `src/content/proofs.html` (+22 lines, -11 lines): Updated workflow instructions
- `CLAUDE.md` (+42 lines, -17 lines): Updated technical documentation

---

## Documentation Deployment

### Static Pages (Require KV Deployment)

The following HTML pages need to be deployed to KV storage:

```bash
# Deploy updated proofs page
npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs" --path ./src/content/proofs.html

# Deploy updated privacy policy (from previous session)
npx wrangler kv key put --remote --binding ANCHOR_KV "page:privacy" --path ./src/content/privacy.html
```

### Markdown Documentation

These files are served from the repository and don't require separate deployment:
- `docs/faq.md` - Updated automatically when deployed
- `CLAUDE.md` - Internal documentation

---

## Testing

### Rate Limiting Tests

**Manual Testing:**

1. **Test claim creation rate limit:**
   ```bash
   # Create 11 claims in quick succession (should fail on 11th)
   for i in {1..11}; do
     curl -X POST https://anchorid.net/claim \
       -H "Authorization: Bearer <session_token>" \
       -H "Content-Type: application/json" \
       -d '{"uuid":"<uuid>","type":"website","url":"https://example'$i'.com"}'
   done
   ```

2. **Test verification rate limit:**
   ```bash
   # Trigger 21 verifications in quick succession (should fail on 21st)
   for i in {1..21}; do
     curl -X POST https://anchorid.net/claim/verify \
       -H "Authorization: Bearer <session_token>" \
       -H "Content-Type: application/json" \
       -d '{"uuid":"<uuid>","claimId":"website:example.com"}'
   done
   ```

3. **Test IP rate limit:**
   - Make 31 claim requests from same IP (should fail on 31st)
   - Verify 429 response with `retry-after: 3600` header

4. **Test admin bypass:**
   - Admin should be able to create >10 claims per UUID
   - Admin should still respect IP-based limits (30/hour)

**Expected Responses:**

Rate limit hit:
```json
{
  "error": "rate_limited",
  "message": "Too many claim operations"
}
```

HTTP headers:
```
Status: 429 Too Many Requests
Cache-Control: no-store
Retry-After: 3600
```

### Documentation Tests

1. **Verify FAQ Updates:**
   - Check backup token login instructions are accurate
   - Verify DNS claim documentation matches implementation
   - Test all links in FAQ

2. **Verify Proofs Page:**
   - Load `/proofs` and verify updated workflow section
   - Check API examples match actual endpoints
   - Verify last modified date displays correctly

3. **Verify User Flow:**
   - Follow documented workflow from FAQ to edit page
   - Add a claim via web interface
   - Verify real-time feedback works as documented

---

## Deployment Checklist

- [x] Code changes committed to git
- [x] Documentation updated (CLAUDE.md, FAQ)
- [x] Environment variables documented
- [x] Rate limit defaults chosen and documented
- [ ] Deploy to Cloudflare Workers (`npm run deploy`)
- [ ] Deploy updated static pages to KV (proofs.html, privacy.html)
- [ ] Test rate limiting in production
- [ ] Verify documentation accuracy on live site
- [ ] Monitor for rate limit false positives

---

## Security Considerations

### Rate Limit Selection Rationale

**Per-UUID Limits:**
- **Claim creation (10/hour):** Reasonable for legitimate users building their identity web. Most users won't need more than a few claims.
- **Verification (20/hour):** Higher than creation to allow for troubleshooting failed verifications.

**Per-IP Limits:**
- **Claim creation (30/hour):** Allows multiple users behind same NAT/corporate IP.
- **Verification (20/hour):** Same as per-UUID to prevent IP-based DoS.

**Admin Bypass:**
- Admins may need to bulk-create claims for testing or migration
- IP limits still apply to prevent compromised admin token abuse

### Attack Scenarios Mitigated

1. **Spam Claim Creation:**
   - Attacker creates thousands of invalid claims
   - Mitigation: 10/hour per UUID, 30/hour per IP

2. **Verification DoS:**
   - Attacker repeatedly triggers expensive DNS queries
   - Mitigation: 20/hour per UUID/IP limits DNS-over-HTTPS requests

3. **IP-based Distributed Attack:**
   - Attacker uses multiple IPs to bypass UUID limits
   - Mitigation: Each IP limited to 30 claims/20 verifications per hour

4. **Session Token Theft:**
   - Attacker steals session token and spams claims
   - Mitigation: Per-UUID limits prevent excessive damage

---

## Future Enhancements

### Potential Improvements

1. **Adaptive Rate Limiting:**
   - Increase limits for verified, well-behaved users
   - Decrease limits for suspicious activity patterns

2. **Claim Operation Audit Log:**
   - Log all claim creation/verification attempts
   - Include rate limit violations for monitoring

3. **Better Error Messages:**
   - Show remaining attempts in rate limit responses
   - Provide time until reset

4. **Web UI Rate Limit Feedback:**
   - Display remaining attempts to users
   - Show countdown timer when rate limited

5. **Monitoring Dashboard:**
   - Track rate limit hits over time
   - Alert on unusual patterns

---

## Statistics

**Files Modified:** 4
**Lines Added:** 156
**Lines Removed:** 45
**Net Change:** +111 lines

**Commits:**
- `5a23386` - Add rate limiting to claim endpoints for abuse prevention
- `ced6e7c` - Update proofs page with user self-service instructions
- `f8d4187` - Update FAQ with new features and user self-service claims
- `4a3bcab` - Update documentation for user self-service claims and admin features

---

## Related Changelogs

- [Admin Panel Enhancements & Critical Bug Fix - January 21, 2026](./CHANGELOG-admin-enhancements.md)
- [Production Hardening - January 20, 2026](./CHANGELOG-production-hardening.md)
- [DNS Proof Implementation - January 19-20, 2026](./CHANGELOG-dns-proof.md)

---

## Links

**Repository:** https://github.com/lowerpower/AnchorID
**Live Site:** https://anchorid.net
**API Docs:** https://anchorid.net/faq#technical
**Proofs Guide:** https://anchorid.net/proofs
