# AnchorID Threat Model

This document describes the security model, known threats, and mitigations in AnchorID.

---

## Security Goals

AnchorID aims to provide:

1. **Integrity**: Profile data cannot be modified without proper authorization
2. **Authenticity**: Claims represent genuine ownership proofs
3. **Availability**: The system remains usable under normal adversarial conditions
4. **Transparency**: All claims and proofs are publicly auditable

AnchorID explicitly does **not** provide:

- Privacy (all profile data is public)
- Anonymity (email is required, claims link to real identities)
- Strong authentication (email-based, not cryptographic)

---

## Trust Boundaries

### What AnchorID Controls

- Profile storage and retrieval
- Claims ledger management
- Token generation and validation
- Rate limiting and abuse prevention

### What AnchorID Does Not Control

- Email delivery (delegated to external provider)
- External proof endpoints (websites, GitHub)
- Client-side security
- DNS resolution

---

## Threat Categories

### 1. Unauthorized Profile Modification

**Threat**: Attacker modifies someone else's profile without authorization.

**Mitigations**:
- Edit access requires one of:
  - Magic link token sent to registered email
  - Backup token (shown once at creation)
- Tokens are one-time use and expire after 15 minutes
- CSRF protection on all POST endpoints
- Tokens are deleted from storage after use

**Residual Risk**: If attacker controls the registered email, they can request edit links. Email security is outside AnchorID's control.

---

### 2. Token Theft or Replay

**Threat**: Attacker intercepts or guesses authentication tokens.

**Mitigations**:
- Tokens are 32 bytes of cryptographically random data (URL-safe base64)
- Tokens stored as hashes in KV (for backup tokens)
- Magic link tokens expire after 15 minutes (configurable)
- All tokens are single-use (deleted after consumption)
- HTTPS enforced for all endpoints

**Residual Risk**: Tokens in transit are visible to email providers and any network intermediaries. Users should use secure email.

---

### 3. Rate Limiting Bypass

**Threat**: Attacker floods endpoints to enumerate tokens, exhaust resources, or deny service.

**Mitigations**:

| Endpoint | Limit | Scope | Rationale |
|----------|-------|-------|-----------|
| `/resolve/<uuid>` | 300/hour | Per IP | Public endpoint, generous limit for search engines/aggregators |
| `/claims/<uuid>` | 300/hour | Per IP | Public endpoint, allows verification services |
| `/admin/login` | 5/hour | Per IP | Strict limit to prevent brute force attacks |
| `/signup` | 10/hour | Per IP | Prevent spam account creation |
| `/login` | 10/hour | Per IP | Prevent login enumeration attacks |
| `/login` | 3/hour | Per email | Prevent targeted account enumeration |
| `/edit` | 30/hour | Per IP | Allow legitimate browsing, prevent scraping |
| `/update` | 60/hour | Per IP | Allow active editing sessions |
| `/update` | 20/hour | Per UUID | Prevent rapid-fire profile changes |
| `/claim` | 30/hour | Per IP | Prevent claim spam from single IP |
| `/claim` | 10/hour | Per UUID | Prevent excessive claims per profile |
| `/claim/verify` | 20/hour | Per IP | Prevent verification spam |
| `/claim/verify` | 20/hour | Per UUID | Prevent verification hammering |

Rate limits are enforced in KV with automatic TTL expiration (1 hour).

**Residual Risk**: Distributed attacks from many IPs can still cause elevated load. Cloudflare's infrastructure provides additional DDoS protection. Public endpoints (`/resolve`, `/claims`) have generous limits to accommodate legitimate use cases like search engines.

---

### 4. Claim Spoofing

**Threat**: Attacker creates claims for domains or accounts they don't control.

**Mitigations**:
- Website claims require placing a file at `/.well-known/anchorid.txt` on the domain,
  and are stored as the bare host — the proof says nothing about arbitrary paths
- GitHub claims require the resolve URL in the profile README, and the submitted URL
  must actually be a `github.com/<username>` profile (the proof is fetched from that
  user's README, so any other host would be unproven)
- Public profile claims require a **deliberate marker** in the page content: the full
  resolve URL, the short URL `anchorid.net/<uuid>`, the labeled `AnchorID: <uuid>`,
  the compact `aid:<uuid>`, or `urn:uuid:<uuid>`. A bare UUID anywhere on a page
  (a comment, a paste, a log line) is not accepted — incidental mention is not a
  claim of ownership
- Public profile proof URLs are stripped of query and fragment before fetching, and
  any proof URL that itself contains the claim's UUID (raw or percent-encoded) is
  rejected — otherwise an echo endpoint that reflects its query or path into the
  response would "verify" without the claimant controlling the page
- Verification fetches proof from the authoritative source
- Claims are marked `pending` until verification succeeds
- Failed verifications are recorded in the claims ledger

**Residual Risk**:
- Temporary domain control (expired domain takeover) could create false claims
- Compromised GitHub accounts could verify false claims
- A page with attacker-injectable public content (comment sections, wikis) can carry
  a deliberate marker planted by a third party; the marker rules raise the bar from
  "mentions the UUID" to "displays an explicit AnchorID reference", not to zero
- These are time-bounded: subsequent verification would fail after access is lost

---

### 5. Proof Endpoint Manipulation

**Threat**: Attacker manipulates what AnchorID sees when verifying claims.

**Attack Vectors**:
- DNS hijacking
- BGP hijacking
- Compromised CDN
- Man-in-the-middle on verification requests

**Mitigations**:
- All verification uses HTTPS
- Claims ledger records verification timestamps
- Multiple verifications over time increase confidence
- Public auditability allows third parties to verify independently

**Residual Risk**: Sophisticated network-level attackers could potentially manipulate verification. This is a fundamental limitation of URL-based proofs.

---

### 6. Email Enumeration

**Threat**: Attacker determines which emails have AnchorID accounts.

**Mitigations**:
- Email addresses are stored as SHA-256 hashes, not plaintext in profiles
- Login endpoint returns the same response for existing and non-existing emails
- Rate limiting prevents bulk enumeration

**Temporary Email Storage**:
- For spam detection purposes, plaintext emails are stored for 7 days after profile creation
- This is KV TTL-based (auto-expires, no cleanup required)
- Email is only visible in admin interface (cookie-authenticated)
- Email display is obfuscated in admin list view (`m***l@example.com`)
- Full email visible only in admin edit page
- After 7 days, only the SHA-256 hash remains

**Residual Risk**: Timing attacks might reveal information. The response should be constant-time, but this is not formally verified.

---

### 7. Backup Token Compromise

**Threat**: Attacker obtains someone's backup token.

**Mitigations**:
- Token shown only once at creation
- Stored as SHA-256 hash (not recoverable)
- Token rotation available (invalidates old token)
- Requires UUID to use (two-factor: token + UUID)

**Residual Risk**: Users who don't store the token securely may expose it. Social engineering could trick users into revealing tokens.

---

### 8. Cross-Site Request Forgery (CSRF)

**Threat**: Attacker tricks authenticated user into submitting malicious requests.

**Mitigations**:
- CSRF tokens required on all state-changing POST requests
- Token stored in HTTP-only cookie
- Token validated via constant-time comparison
- Referrer-Policy set to `no-referrer`

**Residual Risk**: None identified within the current model.

---

### 9. Admin Token Compromise

**Threat**: Attacker obtains the admin token (`ANCHOR_ADMIN_TOKEN`).

**Impact**: Full access to admin routes (create/edit any profile).

**Mitigations**:
- Token stored as Cloudflare secret (not in code)
- Admin routes are separate from user routes
- Audit logging records admin actions

**Residual Risk**: Compromise of Cloudflare account or secret store would expose the token.

---

## Non-Threats (By Design)

### Profile Content Disclosure

All profile data is intentionally public. There is no expectation of privacy for:
- Names
- URLs
- sameAs links
- Claims

### Profile Deletion

Profiles cannot be deleted. This is intentional—the identifier is meant to be permanent. Users can clear optional fields but cannot remove the profile entirely.

### Historical Data Access

The claims ledger is append-only. Historical claims and verification attempts are visible. This is a feature for auditability, not a vulnerability.

---

## Audit Logging

AnchorID maintains audit logs for security-relevant operations:

| Event | Logged Data |
|-------|-------------|
| Profile creation | Timestamp, IP hash, method |
| Profile update | Timestamp, IP hash, method, changed fields |
| Token rotation | Timestamp, IP hash |
| Claim verification | Timestamp, result, proof URL |

Logs are stored in KV and pruned to the most recent 100 entries per UUID.

---

## Incident Response

### Token Compromise

If a user suspects their magic link or backup token is compromised:
1. Request a new magic link immediately (invalidates pending links)
2. Rotate the backup token via the edit interface
3. Review audit log for unauthorized changes

### Profile Vandalism

If a profile is modified without authorization:
1. The audit log shows when and how the change occurred
2. User can restore content via edit interface
3. Consider rotating backup token if method is unknown

### Claim Integrity

If claims appear incorrect:
1. Claims ledger shows full history
2. Re-verification can be triggered
3. Third parties can independently verify proofs

---

## Security Recommendations for Users

1. **Use a secure email provider** — Email security is the primary access control
2. **Store backup token securely** — Password manager or secure offline storage
3. **Verify your claims periodically** — Ensure proofs remain in place
4. **Review audit logs** — Check for unexpected access patterns
5. **Rotate backup token if exposed** — Don't reuse compromised tokens

---

## Known Limitation: Rate Limiting Is Not a Security Boundary

All rate limiting is implemented as a counter in Workers KV (`incrWithTtl` in
`src/index.ts`). Two properties of KV make these limits **abuse-dampening
measures, not enforceable controls**:

1. **The increment is not atomic.** It is a read, then a write. N concurrent
   requests all read the same value and all write `value + 1`, so a burst of
   parallel requests advances the counter by one rather than by N. Every limit
   in the system — per-IP, per-UUID, per-email — can be exceeded this way.
2. **Reads are eventually consistent.** KV reads are edge-cached and writes
   propagate globally over seconds. An attacker spreading requests across
   colos sees stale counters.

Consequences to plan around:

- **The admin-login limiter (`IP_ADMIN_LOGIN_RL_PER_HOUR`, default 5/hour) must
  not be treated as brute-force protection.** The security of the admin
  interface rests entirely on `ANCHOR_ADMIN_SECRET` having enough entropy.
  Use a long random secret.
- Per-email magic-link limits reduce accidental mail volume; they do not
  prevent a determined attacker from generating more.
- The automated tests run against miniflare, whose KV *is* strongly consistent.
  They verify the limiting logic, not its behaviour under production KV.

Fixing this properly requires atomic state — a Durable Object per limit key, or
the Cloudflare Workers rate-limiting binding. That is deferred until abuse
justifies the added moving parts.

## Future Considerations

Potential improvements not currently implemented:

- **WebAuthn support**: Hardware key authentication as alternative to email
- **Multi-party approval**: Require multiple tokens for high-risk changes
- **Signed claims**: Cryptographic signatures on verification results
- **Proof archiving**: Store snapshots of verification proofs

These are explicitly deferred to maintain system simplicity and avoid premature complexity.
