# AnchorID MVP TODO

> This checklist is the punch-down to reach a clean, defensible MVP.
> Boxes are intentionally small and concrete — check them aggressively.

---

## ✅ DONE (Core is Working)

- [x] Canonical UUID-based identity model
- [x] `/resolve/{uuid}` returns valid Person JSON-LD
- [x] Immutable `dateCreated`, controlled `dateModified`
- [x] Claims system with verification state
- [x] `sameAs` manual ∪ verified merge at resolve-time
- [x] Admin UI: create, edit, view profiles
- [x] KV persistence verified (remote namespace)
- [x] Build + deploy pipeline working

---

## ✅ Access & Trust (MVP Gate)

### 1. Email-based Edit Access (Magic Link)

- [x] Add email field on profile creation
- [x] Normalize + store email hash (not plaintext)
- [x] Generate one-time edit token
- [x] Email magic edit link (`/edit?token=...`)
- [x] Token expires after first use or TTL
- [x] Rate-limit token generation per email

### 2. Backup Edit Token (Recovery)

- [x] Generate backup edit token at creation
- [x] Hash + store token (never plaintext)
- [x] Display token **once** to creator
- [x] Allow token-based edit if email unavailable
- [x] Ability to rotate backup token

---

## ✅ Security Hardening

- [x] Remove admin cookie requirement for normal users
- [x] Restrict admin routes to explicit admin secret
- [x] Add CSRF protection to POST routes
- [x] Add per-IP rate limits on edit + token endpoints
- [x] Add audit log (KV) for edits

---

## ✅ UX & Polish

- [x] Inline validation errors in admin UI
- [x] Clear distinction between:
  - Manual sameAs
  - Verified sameAs
  - Published sameAs
- [x] Copy explaining identity guarantees
- [x] Success + failure states on save

---

## ✅ Docs & Provenance

- [x] `README.md` (what AnchorID is, not how to hack it)
- [x] `/docs/identity-model.md`
- [x] `/docs/threat-model.md`
- [x] `/docs/faq.md`
- [x] Explicit non-goals section (in README and About page)

## ✅ Public Pages

- [x] `/about` — What is AnchorID, how it works, philosophy
- [x] `/guide` — Canonical identity placement guide
- [x] `/privacy` — Privacy policy
- [x] `/faq` — Skeptic FAQ
- [x] Consistent navigation across all pages

---

## ✅ Organization Support

- [x] Add `Organization` to allowed `@type` set
- [x] Update `buildProfile()` to handle Person and Organization
- [x] Add `founder[]` for Organizations (references to Person UUIDs)
- [x] Add `affiliation[]` for Persons (references to Organization UUIDs)
- [x] Add `foundingDate` for Organizations
- [x] Signup: Person/Organization selector (type immutable after creation)
- [x] Edit page: conditional fields based on entity type
- [x] Setup page: shows entity type badge
- [x] `/resolve/{uuid}` works for both types

---

## 🚫 Explicit Non-Goals (For MVP)

- [x] ❌ No accounts or passwords — using magic links + backup tokens
- [x] ❌ No OAuth providers — email-based access only
- [x] ❌ No profile search or discovery — resolve by UUID only
- [x] ❌ No unauthenticated write APIs — writes require a magic-link session token or the admin token

---

## 🏁 MVP Definition of Done

- [x] A human can claim an identity via email
- [x] They can edit it securely later
- [x] They can recover access without admin help
- [x] `/resolve` output is stable, canonical, and explainable
- [x] Edit page has clear UX with field explanations
- [x] Setup flow allows immediate editing before first save
- [x] System survives hostile-but-boring internet traffic

---

_When every box above is checked, AnchorID is MVP-complete._

## ✅ **AnchorID is now MVP-complete!** 🎉

Security hardening complete as of 2026-01-24:
- ✅ Rate limiting on all endpoints (public, admin, user)
- ✅ Comprehensive security test suite (test/security.spec.ts)
- ✅ Load testing suite (test/load.spec.ts)
- ✅ Complete threat model documentation
- ✅ Security testing guide (docs/security-testing.md)

---

## ✅ Post-MVP: Security Audit Remediation (shipped 2026-08-14, PR #5)

- [x] Admin cookie replaced with opaque KV-backed session (`adminsess:`, 12h TTL,
      bound to secret fingerprint — rotating the secret revokes all sessions)
- [x] Admin secret no longer rendered into admin page JS; stored XSS in delete-confirm fixed
- [x] `canonicalizeUrl` scheme allow-list (rejects `javascript:`/`data:`/`file:` etc.),
      strips embedded credentials
- [x] GitHub claims validated as real `github.com/<username>` profiles; README checked
      on `main` and `master`
- [x] SSRF hardening: per-hop redirect revalidation, timeout, 256KB cap, IPv6/CGNAT/
      metadata/internal-TLD/trailing-dot blocks
- [x] Public profile proofs require deliberate markers (full URL, `anchorid.net/<uuid>`,
      `AnchorID: <uuid>`, `aid:<uuid>`, `urn:uuid:`) — bare UUID and reflected-URL
      proofs rejected
- [x] `/admin/backup` GET→POST+CSRF; `/admin/debug/kv` gated behind `ENABLE_ADMIN_DEBUG`
- [x] Correctness: `dateModified` advances properly, claims keys lowercased, cold-visit
      CSRF fixed, KV TTLs clamped, signup existence-oracle closed, `wrangler.toml` removed
- [x] Regression-lock suite (`test/regressions.spec.ts`)
- [x] Docs sweep: all content pages + repo docs consistent on proof marker forms

---

## 🔜 Open Follow-ups

- [x] Email index: unsalted `sha256(email)` → peppered HMAC with lazy dual-read
      migration (`src/email-index.ts`; activate by setting `EMAIL_PEPPER` secret —
      permanent once set)
- [ ] CSP: replace `script-src 'unsafe-inline'` with nonces/hashes on inline-script pages
- [ ] Deliberately review/apply newer `compatibility_date` in `wrangler.jsonc`
      (the removed `.toml` carried 2026-01-17; `.jsonc` has 2025-09-27)
- [ ] If abuse warrants: move rate limiting to Durable Objects or the Workers
      rate-limiting binding (KV counters are non-atomic — see threat-model.md)
- [ ] Pass over existing `github`/`public` claims for URLs the tightened rules
      would no longer accept
- [ ] Admin UI copy still claims email is "never in plaintext" — inaccurate while
      `email:unhashed:<uuid>` (7d) and `profile._email` exist