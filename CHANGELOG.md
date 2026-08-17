# Changelog

All notable changes to AnchorID will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added - 2026-08-15

#### Compact `aid:<uuid>` Proof Marker & Documentation Sweep

- New compact marker `aid:<uuid>` (40 chars) accepted for public profile proofs —
  the shortest deliberate form for tight character limits (word-boundary anchored
  so `paid:`/`said:` don't match)
- Documented all accepted public-proof forms consistently across every surface:
  homepage, all content pages (`/about`, `/guide`, `/faq`, `/privacy`, `/proofs`,
  `/proofs/social`, `/proofs/website`, `/proofs/github`, `/proofs/dns`), README,
  and repo docs (`identity-model.md`, `faq.md`, `threat-model.md`,
  `security-testing.md`, `proofs/social.md`)
- Website/GitHub/DNS proof pages now explicitly state their strict requirements
  (full `/resolve` URL or exact DNS token) and point short-form users to the
  public profile claim type instead
- Moved working drafts and planning notes into `notes/` (local-only drafts remain
  gitignored at their new paths)

### Security - 2026-08-14

#### Security Audit Remediation (PR #5)

**Critical fixes**
- Admin cookie no longer carries the admin secret: replaced with an opaque
  KV-backed session (`adminsess:<token>`, 12h TTL, configurable via
  `ADMIN_SESSION_TTL_SECONDS`). Sessions are bound to a fingerprint of the
  issuing secret, so rotating `ANCHOR_ADMIN_SECRET` revokes all sessions
  immediately. **Admins must log in again after deploying.**
- Admin secret no longer rendered into admin page JavaScript; admin claims UI
  authenticates via session cookie + `X-CSRF-Token` header
- Fixed stored XSS in the admin delete-confirm (HTML-entity-decoded apostrophe
  broke out of an inline `onsubmit` string literal)
- `canonicalizeUrl` now enforces an http(s) scheme allow-list — `javascript:`,
  `data:`, `vbscript:`, `file:` etc. no longer survive into published JSON-LD;
  embedded credentials stripped
- GitHub claims must be real `github.com/<username>` profile URLs (previously the
  hostname was ignored, letting a claim on any domain "verify" via an attacker's
  GitHub README); profile READMEs checked on both `main` and `master`
- Public profile proofs require a deliberate marker — full resolver URL, short URL
  `anchorid.net/<uuid>`, labeled `AnchorID: <uuid>`, or `urn:uuid:<uuid>` — a bare
  UUID anywhere on a page no longer verifies. Proof URLs are stripped of
  query/fragment, and URLs that themselves contain the claim's UUID are rejected
  (closes reflected-query and path-echo verification attacks)
- SSRF hardening for proof fetches: per-hop redirect revalidation
  (`redirect: "manual"`), 5s timeout, 256KB response cap, and expanded host
  blocks (IPv6 literals, CGNAT `100.64/10`, `192.0.0/24`, `198.18/15`, metadata
  endpoints, `.internal`/`.local`, bare hostnames, trailing-dot FQDN bypasses)
- `/admin/backup` changed GET → POST with CSRF (dumps all profile data);
  `/admin/debug/kv` disabled unless `ENABLE_ADMIN_DEBUG=true`
- Security headers (CSP, `X-Frame-Options`) now applied to all secret-bearing
  pages (`/edit`, `/setup`, `/create`, `/login`, `/admin/*`); consolidated in
  `src/http.ts`
- `POST /create` returns identical copy whether or not the email is registered
  (closed account-existence oracle); `/setup` requires a setup-specific token
- Rate limiting documented as abuse-dampening, not a security boundary
  (non-atomic KV counters — see threat-model.md)

**Fixed**
- `dateModified` never advanced on real edits (timestamp policy was applied to a
  discarded copy); private `_`-prefixed fields no longer make every save look
  changed
- Claims posted with mixed-case UUIDs wrote to keys `/resolve` never read
- First admin login after clearing cookies always failed CSRF (two different
  tokens were generated for form and cookie)
- Verified DNS claims never reached `sameAs` (bare domain failed URL parsing);
  re-asserted claims kept stale `verifiedAt`; malformed rate-limit env vars
  silently disabled limits (`NaN` comparison); KV TTLs clamped to the 60s floor
- Self-link filter now applied to the published `sameAs` (previously only the
  stored list), preventing equivalence assertions with other AnchorIDs
- Malformed JSON on claim routes returns 400 instead of an unhandled exception;
  top-level error handler added
- Removed dead `wrangler.toml` (Wrangler reads `wrangler.jsonc`; the `.toml` was
  silently ignored)

**Added**
- `test/regressions.spec.ts` — regression locks for every audit finding
- New env vars: `ADMIN_SESSION_TTL_SECONDS` (default 43200), `ENABLE_ADMIN_DEBUG`
- New KV prefix: `adminsess:<token>`

### Added - 2026-03-25

#### Admin Interface Enhancements: Email Retention, Audit Summaries & Enhanced List View

**Temporary Email Storage (7-day TTL)**
- Store plaintext emails for 7 days after profile creation for spam detection
- New KV key pattern: `email:unhashed:{uuid}` with 604800 second TTL
- Auto-expires via KV TTL, no cleanup required
- Added to both self-service signup and admin creation flows

**Enhanced Admin List View**
- Replaced simple UUID list with rich metadata table showing:
  - UUID (8-char prefix, clickable links)
  - Type badges (👤 Person / 🏢 Organization)
  - Name (or "(unnamed)")
  - Email (obfuscated as `m***l@example.com`)
  - Created date (YYYY-MM-DD format)
  - Modified date (YYYY-MM-DD format)
  - Recent activity (e.g., "2h ago: ✏️ update via magic_link")
- Profiles sorted by most recently modified first
- Parallel loading of all metadata (profiles + emails + audit logs)

**Helper Functions**
- `formatEmailForDisplay()` - Obfuscates emails as `m***l@example.com`
- `formatDate()` - Extracts YYYY-MM-DD from ISO timestamps
- `formatTimeAgo()` - Human-readable relative times ("3h ago", "2d ago")
- `formatAuditSummary()` - Formats recent activity with icons (🆕 create, ✏️ update, 🔄 rotate_token)

**Enhanced Admin Edit Page**
- Shows full unhashed email when available (first 7 days after creation)
- Displays "(visible for 7 days)" note when email is shown
- Falls back to showing only hash after expiration

**Documentation Updates**
- Added `email:unhashed:{uuid}` to KV Key Patterns in CLAUDE.md
- Documented 7-day email retention policy in threat-model.md

**Files Modified**
- `src/index.ts` - Added unhashed email storage to signup flow
- `src/admin/handlers.ts` - Enhanced admin interface with new list view, helper functions, and email display
- `CLAUDE.md` - Updated KV key patterns table
- `docs/threat-model.md` - Documented email retention policy
