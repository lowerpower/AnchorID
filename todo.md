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

## ⏭️ NEXT: Access & Trust (MVP Gate)

### 1. Email-based Edit Access (Magic Link)

- [ ] Add email field on profile creation
- [ ] Normalize + store email hash (not plaintext)
- [ ] Generate one-time edit token
- [ ] Email magic edit link (`/edit?token=...`)
- [ ] Token expires after first use or TTL
- [ ] Rate-limit token generation per email

### 2. Backup Edit Token (Recovery)

- [ ] Generate backup edit token at creation
- [ ] Hash + store token (never plaintext)
- [ ] Display token **once** to creator
- [ ] Allow token-based edit if email unavailable
- [ ] Ability to rotate backup token

---

## 🔐 Security Hardening

- [ ] Remove admin cookie requirement for normal users
- [ ] Restrict admin routes to explicit admin secret
- [ ] Add CSRF protection to POST routes
- [ ] Add per-IP rate limits on edit + token endpoints
- [ ] Add audit log (KV or log-only) for edits

---

## 🧭 UX & Polish

- [ ] Inline validation errors in admin UI
- [ ] Clear distinction between:
  - Manual sameAs
  - Verified sameAs
  - Published sameAs
- [ ] Copy explaining identity guarantees
- [ ] Success + failure states on save

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

- [ ] A human can claim an identity via email
- [ ] They can edit it securely later
- [ ] They can recover access without admin help
- [ ] `/resolve` output is stable, canonical, and explainable
- [ ] System survives hostile-but-boring internet traffic

---

_When every box above is checked, AnchorID is MVP-complete._