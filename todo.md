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

## 📄 Docs & Provenance

- [ ] `README.md` (what AnchorID is, not how to hack it)
- [ ] `/docs/identity-model.md`
- [ ] `/docs/threat-model.md`
- [ ] `/docs/faq.md`
- [ ] Explicit non-goals section

---

## 🚫 Explicit Non-Goals (For MVP)

- [ ] ❌ No accounts or passwords
- [ ] ❌ No OAuth providers
- [ ] ❌ No profile search or discovery
- [ ] ❌ No public write APIs

---

## 🏁 MVP Definition of Done

- [x] A human can claim an identity via email
- [x] They can edit it securely later
- [x] They can recover access without admin help
- [x] `/resolve` output is stable, canonical, and explainable
- [ ] System survives hostile-but-boring internet traffic

---

_When every box above is checked, AnchorID is MVP-complete._