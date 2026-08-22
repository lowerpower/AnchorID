# Changelog

All notable changes to AnchorID will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added - 2026-08-22

#### X (Twitter) Claim Type (PR #8, by Thel)

- New `x` claim type: proof is the resolver URL, `anchorid.net/<uuid>`,
  `AnchorID: <uuid>`, `aid:<uuid>`, or `urn:uuid:<uuid>` in an X profile's bio
  or website field, read through the X API (`GET /2/users/by/username`) with an
  app-only Bearer token — x.com serves a JS shell to plain fetchers, so the
  existing public-profile proof could never read an X bio
- Matching uses `entities[].expanded_url`, not the t.co-truncated bio text
- Gated on the `X_API_BEARER_TOKEN` secret: without it the type is hidden in
  both claim UIs. Input accepts `@handle`, `handle`, `x.com/handle`,
  `twitter.com/handle`; host-pinned, deep links and reserved routes rejected;
  an x.com URL filed as a `public` claim is rewritten to `x`
- API-side failures (401/403/429/5xx/timeout/no token/budget) are *transient*:
  `/claim/verify` returns 503 + `retry-after` and leaves the stored status
  untouched, so an outage never revokes a verified claim
- Worker-wide hourly budget on metered X reads (`rl:xapi:<hour>`, default 200,
  `X_API_RL_PER_HOUR`) plus a 15-minute `xcache:<username>` KV cache
- New `/proofs/x` page, `docs/proofs/x.md`, threat-model and identity-model
  sections, 38 regression tests. Codex review: one P1 (the budget counter is a
  non-atomic KV read-modify-write) — same known limitation as every other rate
  limiter here; tracked with the Durable Objects follow-up in `todo.md`

#### Legacy x.com Public Claims Upgrade on Verify (`326bb35`)

- A `public`/`social` claim on x.com stored before the X type existed carried a
  `profile_page` proof that could never verify. `/claim/verify` now rebuilds it
  as an `x_profile` claim first (id `x:<handle>`, `createdAt` kept, status reset
  to `self_asserted`); if an `x:<handle>` claim already exists the dead legacy
  entry is dropped in its favour. No delete-and-re-add needed

#### `scripts/backup-kv.sh` (`9c0a851`)

- `npm run backup` had pointed at a script that did not exist. It now dumps the
  whole prod namespace to `backup/kv-<utc-timestamp>.json` in the same flat
  `{key: value}` shape `scripts/restore-from-backup.py` consumes. First run
  2026-08-22 (106 keys), taken before merging PR #8

### Changed - 2026-08-18

#### `compatibility_date` 2025-09-27 → 2026-03-10

- Every flag default-on in between reviewed against this Worker's API surface —
  all are node:* stubs, WebSocket/Queue/Workflow/DO/RPC behavior (none used),
  or additive spec-compliance; semantics verified empirically by running the
  full behavioral suite on workerd 1.20260310 before deploying
- Dev toolchain: wrangler CLI updated (4.59 → 4.86); tests stay on the fast
  vitest-pool-workers 0.8.x line, whose bundled workerd caps at 2025-09-06 —
  the miniflare "latest supported compatibility date" warning during tests is
  expected and documented in wrangler.jsonc
- `nodejs_compat` (carried by the long-deleted wrangler.toml) confirmed
  unnecessary: the Worker imports no Node builtins

### Security - 2026-08-18

#### CSP: `script-src 'unsafe-inline'` Removed

- Worker-generated pages (create/login/setup/edit, all admin pages) now send a
  per-response `script-src 'nonce-…'`; every inline `<script>` is stamped with
  the nonce at response time, and all inline event handlers (`onclick=` etc.)
  were converted to `addEventListener` wiring inside the nonce'd scripts
- Static KV content pages send `script-src 'sha256-…'` covering their single
  shared footer script — no HTML changes or KV redeploys needed; a regression
  test recomputes the hash so editing that script fails the suite instead of
  silently breaking the pages
- Homepage and all JSON/text responses drop to `script-src 'none'` (JSON-LD is
  a data block and needs no allowance)
- Injected scripts — from a stored-XSS slip or a hostile browser extension's
  content — no longer execute on any page
- Known accepted limitation: `style-src 'unsafe-inline'` remains (pages use
  `style=""` attributes, which nonces cannot cover)

### Security - 2026-08-17

#### Peppered Email Index (`EMAIL_PEPPER`)

- The email→UUID index (`email:<hash>`) can now use HMAC-SHA256 with a secret
  pepper instead of bare `sha256(email)`, which is dictionary-reversible for
  anyone holding a KV dump or backup
- Opt-in: set the `EMAIL_PEPPER` Wrangler secret. Deploying without it changes
  nothing; with it, new signups are peppered immediately and existing users'
  legacy keys migrate lazily at next login/signup (dual-read fallback keeps
  dormant users working indefinitely)
- ⚠️ The pepper is **permanent once set** — rotating or removing it strands
  migrated keys (users would need their backup token)
- New module `src/email-index.ts` (`emailIndexHash`, `lookupEmailUuid`);
  regression tests cover HMAC mode, no-pepper fallback, lazy migration, and
  dup-check across both key forms

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
