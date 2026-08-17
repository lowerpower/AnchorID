# Security Audit Remediation - August 14-15, 2026

## Overview

A full audit of `src/` (~5,900 lines) surfaced critical vulnerabilities in the
admin surface and the claim verification system — the two places where a flaw
lets someone publish a forged "verified" link or steal the admin credential.
All findings were fixed in PR #5 (`security/audit-remediation`, merged as
`200c065`), reviewed three times by Codex before merge, and locked down by a
new regression suite (`test/regressions.spec.ts`).

A follow-on change added the compact `aid:<uuid>` proof marker and swept every
documentation surface for consistency with the new proof rules.

---

## Critical Findings Fixed

### 1. Admin cookie *was* the admin secret

The `anchor_admin` cookie carried `ANCHOR_ADMIN_SECRET` verbatim, compared with
`!==` on every request, with no expiry and no server-side revocation.

**Fix:** Opaque KV-backed sessions (`adminsess:<token>`, 12h TTL, configurable
via `ADMIN_SESSION_TTL_SECONDS`). Sessions store a fingerprint of the issuing
secret, so rotating `ANCHOR_ADMIN_SECRET` revokes every outstanding session
immediately — preserving the instant-revocation property the old scheme had
for free. Logout deletes the session server-side. Secret comparisons now use
a shared `timingSafeEqual`.

### 2. Admin secret rendered into page JavaScript + stored XSS

The admin edit page embedded `const adminToken = "<secret>"` in inline JS, and
the delete-confirm used an inline `onsubmit` attribute interpolating the
profile name. `escapeHtml` encodes `'` as `&#39;`, but HTML attribute values
are entity-decoded *before* the JS is parsed — so an attacker-controlled
profile name could break out of the string literal and execute in the admin's
session, on exactly the profiles an admin is likely to click Delete on.
Combined with finding #1, that XSS yielded the permanent admin credential.

**Fix:** Secret removed from all page output; the admin claims UI authenticates
with the session cookie plus an `X-CSRF-Token` header; the confirm dialog is
wired via a `data-` attribute and `addEventListener`.

### 3. `canonicalizeUrl` scheme bypass

Per the WHATWG URL spec, assigning `u.protocol = "https:"` is a no-op for
non-special schemes — so `javascript:`, `data:`, `vbscript:`, and `file:` URLs
survived canonicalization untouched and were published in public JSON-LD.
`ftp://` URLs were silently rewritten to `https://` (a different identity),
and embedded credentials were preserved.

**Fix:** Explicit http(s) allow-list before any rewriting; credentials
stripped; host required.

### 4. GitHub claims ignored the submitted hostname

Only `pathname[0]` was used, so `https://bank.example.com/attacker` fetched
its proof from `github.com/attacker`'s README — attacker-controlled — while
publishing `bank.example.com` as a verified `sameAs`.

**Fix:** `parseGitHubProfile()` requires `github.com`/`www.github.com`,
validates the username against GitHub's login rules, rejects deep links, and
stores the canonical URL. Profile READMEs are checked on both `main` and
`master` branches.

### 5. Public-profile proofs matched any substring

The verifier accepted the resolver URL anywhere in the page — with the
submitted query string retained — so any site reflecting a query parameter
"verified" (`https://victim.example/search?q=<resolver-url>`). A bare-UUID
fallback widened it to any page merely mentioning the UUID.

**Fix (proof marker rules):** The UUID must appear in a deliberate form:

| Form | Example | Chars |
|------|---------|-------|
| Full resolver URL | `https://anchorid.net/resolve/<uuid>` | 65 |
| Short URL | `anchorid.net/<uuid>` (scheme optional) | 57 |
| Labeled | `AnchorID: <uuid>` (whitespace tolerated) | 46 |
| Compact | `aid:<uuid>` (word-boundary anchored) | 40 |
| URN | `urn:uuid:<uuid>` | 45 |

A bare unlabeled UUID no longer verifies. Query and fragment are stripped from
proof URLs at claim creation, and any proof URL that itself contains the
claim's UUID (raw or percent-encoded, checked before and after redirects) is
rejected with `proof_url_contains_marker` — closing the path-echo reflection
found in Codex review.

---

## High-Severity Fixes

- **SSRF hardening** (`safeFetchText`): per-hop revalidation with
  `redirect: "manual"`, 5s `AbortController` timeout, 256KB response cap.
  Host checks extended: IPv6 literals rejected wholesale, CGNAT `100.64/10`,
  `192.0.0/24`, `198.18/15`, `metadata.google.internal`, `.internal`/`.local`
  suffixes, bare hostnames, and trailing-dot FQDN bypasses
  (`localhost.`, `metadata.google.internal.`)
- **Published `sameAs` self-link filter**: previously applied only to the
  stored list, so a profile could publish `anchorid.net/resolve/<other-uuid>`
  and assert equivalence with someone else's AnchorID
- **Security headers everywhere**: CSP and `X-Frame-Options` were absent from
  every secret-bearing page (`/edit`, `/setup`, `/create`, `/login`, all of
  `/admin`); `securityHeaders()` consolidated into `src/http.ts` and applied
  globally; token-bearing pages get `referrer-policy: no-referrer`
- **`/admin/backup`** changed GET → POST + CSRF (dumps every profile including
  `_emailHash`, `_backupTokenHash`); **`/admin/debug/kv`** gated behind
  `ENABLE_ADMIN_DEBUG`
- **Unguarded `JSON.parse` before auth** on the claim routes fixed; top-level
  error handler added (malformed JSON → 400, never an unhandled exception)
- **Account-existence oracle** closed: `POST /create` returns identical copy
  for registered and unregistered addresses

## Correctness Fixes

- `dateModified` never advanced (timestamp policy applied to a discarded
  copy); private `_`-prefixed fields no longer make every save look changed
- Claims posted with mixed-case UUIDs wrote to `claims:<MixedCase>`, which
  `/resolve` never reads — keys now lowercased
- First admin login after clearing cookies always failed CSRF (form and cookie
  received two different tokens)
- Verified DNS claims never reached `sameAs` (bare domain failed `new URL()`)
- Re-asserted claims kept a stale `verifiedAt`; now cleared on reset to
  `self_asserted`
- Malformed rate-limit env vars produced `NaN`, silently disabling the limit
  (`intFromEnv`); KV TTLs clamped to the 60s API floor (`clampKvTtl`)
- Removed dead `wrangler.toml` — Wrangler reads `wrangler.jsonc` and silently
  ignored the `.toml`
- `Env` type consolidated into `src/env.ts` (was duplicated in `index.ts`)

---

## Documented, Not Fixed

KV rate limiting is a non-atomic read-then-write over an eventually consistent
store — every limit is bypassable by concurrency. Documented in
threat-model.md ("Rate Limiting Is Not a Security Boundary") rather than
re-architected. Consequence: **the admin-login limiter is not brute-force
protection**; `ANCHOR_ADMIN_SECRET` must carry the entropy.

## Known Follow-ups (see todo.md)

- Unsalted `sha256(email)` index → peppered HMAC (needs key migration)
- CSP still requires `script-src 'unsafe-inline'`; nonce/hash migration pending
- `compatibility_date` bump to be applied deliberately
- Pass over existing `github`/`public` claims the tightened rules would reject

---

## Review Process

1. PR #5 opened by external audit (`codemodify`), 3 commits, all findings
   verified against `main` before merge
2. Maintainer review caught one product regression: the tightened rules broke
   the *documented* short-URL proof form — fixed on the branch (`7d8ad2c`,
   `691d23e`) before merge
3. Codex review round 1: found the path-echo reflection (P1) and stale
   UUID-only docs (P2) — both fixed (`e4f5d57`)
4. Codex round 2: one residual JSON-LD wording issue — fixed (`7786d6a`)
5. Codex round 3 on the final head: "Didn't find any major issues"
6. Merged, deployed, and verified live (old cookies rejected, malformed JSON
   → 400, CSP on `/login`, resolver serving)

## Follow-on: `aid:` Marker & Documentation Sweep (August 15)

- Added compact `aid:<uuid>` marker (`d6b7571`) — word-boundary anchored so
  `paid:`/`said:` don't match
- Every surface documenting proof forms updated for consistency: homepage,
  all nine KV content pages, README, `docs/proofs/social.md`,
  `identity-model.md`, `faq.md`, `threat-model.md`, `security-testing.md`
- Strict proof pages (`website`/`github`/`dns`) explicitly state their
  full-URL/token requirements and point short-form users to the public
  profile claim type — in both visible text and JSON-LD structured data

---

## Deployment Notes

- **Admins must log in again** after the first deploy — old secret-as-cookie
  values no longer authenticate
- New optional vars: `ADMIN_SESSION_TTL_SECONDS` (default 43200),
  `ENABLE_ADMIN_DEBUG`
- New KV prefix: `adminsess:<token>`
- Existing claims keep their stored URLs; tightened rules apply on next
  create/re-assert

## Statistics

- 17 files changed, ~1,700 insertions, ~460 deletions (PR #5)
- 50+ new regression tests; suite grew from 104 to 114 passing (1 skipped)
- 3 Codex review rounds; 2 confirmed P1s and 2 P2s fixed pre-merge
- Typecheck clean throughout

## Verification

```bash
npm test                            # 114 passed, 1 skipped
npm test test/regressions.spec.ts   # regression locks only

# Live spot-checks after deploy
curl -o /dev/null -w "%{http_code}" -H "Cookie: anchor_admin=old-secret" https://anchorid.net/admin   # 303 → /admin/login
curl -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d 'bad{' https://anchorid.net/claim  # 400
curl -sI https://anchorid.net/login | grep -i content-security-policy       # present
```
