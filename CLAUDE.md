# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Local dev server at http://localhost:8787
npm run deploy       # Deploy to Cloudflare Workers
npm test             # Run tests (vitest with Cloudflare Workers pool)
npm run cf-typegen   # Generate Cloudflare types
```

**Secrets**: Set `ANCHOR_ADMIN_TOKEN` via `npx wrangler secret put ANCHOR_ADMIN_TOKEN` before deploying.

**KV**: Uses Cloudflare KV with binding `ANCHOR_KV`. For production KV operations:
```bash
npm run kv:list:prod               # List profile keys
npm run kv:get:prod -- "profile:UUID"  # Get specific profile
```

## Architecture Overview

AnchorID is a minimal identity resolver built on Cloudflare Workers. It provides UUID-based identity anchors that can be verified through external proofs (websites, GitHub profiles).

### Key Design Principles
- **Deliberately boring**: Uses UUIDs, HTTPS URLs, plain JSON, schema.org vocabularies
- **Proof over trust**: Identity claims are publicly verifiable, not asserted by authority
- **Longevity-first**: Optimized to remain interpretable decades from now
- No accounts, no passwords, no OAuth, no database

### Route Structure (`src/index.ts`)

**Public (read-only)**:
- `GET /resolve/<uuid>` — Returns canonical schema.org Person JSON-LD
- `GET /claims/<uuid>` — Claims ledger (JSON or HTML based on Accept header)

**Token-gated (Bearer auth via `ANCHOR_ADMIN_TOKEN`)**:
- `POST /claim` — Add/upsert a claim
- `POST /claim/verify` — Trigger claim verification

**Admin UI (cookie auth)**:
- `/admin/*` routes — Create, edit, list profiles

**Email magic link flow** (requires `RESEND_API_KEY`):
- `POST /login` — Send magic link
- `GET /edit?token=...` — Token-gated edit form
- `POST /update` — Save profile changes

### Core Domain Logic

**`src/domain/profile/anchorid_profile.ts`** — The heart of the system:
- `buildProfile()` — Canonicalizes and merges profile data
- `mergeSameAs()` — Merges manual sameAs URLs with verified claim URLs
- `canonicalizeUrl()` — URL normalization (HTTPS upgrade, lowercase hostname, remove fragments)

Timestamp semantics:
- `dateCreated` — Immutable, set once at creation
- `dateModified` — Bumped only on actual structural changes

sameAs merge policy:
- Manual sameAs: stored/editable field
- Verified sameAs: derived from claims at resolve-time
- Effective sameAs (public): manual ∪ verified, deduplicated & sorted

### Claims System (`src/claims/`)

Two claim types supported:
- **Website**: Proof at `https://domain/.well-known/anchorid.txt` must contain resolver URL
- **GitHub**: Profile README must contain resolver URL

Claims are stored separately from profiles at `claims:<uuid>` in KV.

### Auth Mechanisms

1. **Admin cookie**: Set via `/admin/login`, guards `/admin/*` routes
2. **Bearer token**: `Authorization: Bearer <token>` for API endpoints
3. **Magic link tokens**: One-time tokens stored in KV with TTL, consumed on first use

### Data Storage (KV Keys)

- `profile:<uuid>` — Person JSON-LD
- `claims:<uuid>` — Claims array
- `email:<hash>` — Maps email hash to UUID
- `login:<token>` — Magic link session
- `rl:login:<hash>` — Rate limit counter
- `rl:update:<uuid>` — Rate limit counter

## Current MVP Status

See `todo.md` for the implementation checklist. Core identity resolution and claims verification are complete. Next priority is the email-based edit access flow and backup recovery tokens.
