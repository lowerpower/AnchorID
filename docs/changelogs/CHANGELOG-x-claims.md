# X (Twitter) Claims - August 22, 2026

## Overview

Add an "X" claim type so an X (Twitter) account can be verified from its public bio or website field. Implemented by Thel on the `tg-x-verification` branch and merged as PR #8; a same-day follow-up upgrades legacy x.com public claims on verify.

**Date:** August 22, 2026
**Status:** ✅ Complete, deployed
**Scope:** New claim type, X API integration, legacy-claim migration, docs

---

## Why a Separate Type

The existing public-profile proof fetches a page over plain HTTPS and searches the HTML. `x.com` serves a JavaScript shell to non-browser clients, so the bio text is never in the fetched bytes — a public claim on an X profile could only ever sit at `failed`. The X type reads the same public bio through the X API instead (`GET /2/users/by/username/:username`, app-only OAuth 2.0 Bearer token). Nothing private is read and the user never logs in.

---

## What Was Added

### 1. New Claim Type: `x`

- **Input:** `@handle`, `handle`, `https://x.com/handle`, `https://twitter.com/handle` (with or without `www.`); `twitter` accepted as a type alias, never stored
- **Canonical form:** `https://x.com/<handle>` (lowercased); claim id `x:<handle>`
- **Validation:** handle regex `^[A-Za-z0-9_]{1,15}$`, host pinned to x.com/twitter.com, deep links (`/status/…`) and reserved routes (`/home`, `/i`, `/search`, …) rejected
- **Proof kind:** `x_profile` — `{ username, url, mustContain }`, shaped like the other kinds so the ledger and edit page render it without special-casing
- An x.com URL submitted as a `public` claim is rewritten to `x` at creation

### 2. Verification

- Reads `description`, `entities.description.urls[].expanded_url`, and `entities.url.urls[].expanded_url`. **Expanded URLs are essential** — X wraps every bio link in t.co, so the bio text holds only a truncated display form
- Accepted markers: full resolver URL, `anchorid.net/<uuid>`, `AnchorID: <uuid>`, `aid:<uuid>`, `urn:uuid:<uuid>`. A bare UUID does not verify (same rule as every other proof type since PR #5)
- **Transient failures:** 401/403 (bad credentials), 429, 5xx, timeout, missing token, and budget exhaustion return 503 + `retry-after: 300` from `/claim/verify` and leave the stored status untouched — an outage can never revoke a verified claim
- **Cost controls:** 15-minute KV cache per handle (`xcache:<username>`, 2 minutes on failure) and a worker-wide hourly budget on metered reads (`rl:xapi:<yyyymmddhh>`, default 200 via `X_API_RL_PER_HOUR`). Per-IP and per-UUID verify limits still apply first

### 3. Configuration

- `X_API_BEARER_TOKEN` (secret) — gates the feature; without it the X option is absent from both claim UIs and verification fails transiently
- `X_API_RL_PER_HOUR` (plain var, default 200)
- Test env sets a dummy token and `X_API_RL_PER_HOUR=0`, so tests exercise the X path without any request reaching `api.x.com`

### 4. Legacy Claim Upgrade (`326bb35`)

`/claim/verify` on a `public`/`social` claim whose URL is on x.com/twitter.com now rebuilds it as an `x_profile` claim before verifying: id becomes `x:<handle>`, `createdAt` is preserved, status resets to `self_asserted`. If an `x:<handle>` claim was already filed separately, the dead legacy entry is dropped and the real one is verified. Unparseable URLs are left alone.

### 5. Documentation and Pages

- `/proofs/x` (KV `page:proofs-x`), X card on `/proofs`, exception note on `/proofs/social`
- `docs/proofs/x.md`, `docs/threat-model.md` (X API trust, budget), `docs/identity-model.md`
- `CLAUDE.md`, `DEPLOY.md`, `README.md`, `src/content/README.md`

---

## Testing

- 38 regression tests in PR #8 (parsing, gating, transient handling, marker matching against captured API payloads, UI gating) + 3 for the legacy upgrade
- Suite after merge: 155 passed, 1 skipped

---

## Review Notes

Codex flagged one P1: the `rl:xapi:` budget counter is a KV read-modify-write, so concurrent requests can overshoot the ceiling. This is the same known, documented limitation as every other rate limiter in the Worker (`docs/threat-model.md`); the X budget is a backstop behind the per-IP/per-UUID verify limits, and it moves with the rest when rate limiting migrates to Durable Objects (`todo.md`).

---

## Operations

Prod KV was snapshotted before the merge with the new `scripts/backup-kv.sh` (`npm run backup`): `backup/kv-2026-08-22-170824.json`, 106 keys.
