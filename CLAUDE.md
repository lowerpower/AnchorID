# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Local dev server at http://localhost:8787
npm run deploy       # Deploy to Cloudflare Workers
npm test             # Run tests (vitest with Cloudflare Workers pool)
npm run cf-typegen   # Generate Cloudflare types
```

**Secrets** (set via `npx wrangler secret put <NAME>`):
- `ANCHOR_ADMIN_TOKEN` — Admin API access
- `RESEND_API_KEY` — Email delivery (Resend fallback)
- `MAIL_SEND_SECRET` — mycal-style mailer secret (required with MYCAL_MAIL_ENDPOINT)
- `MYCAL_MAIL_ENDPOINT` — mycal-style mailer endpoint URL (required with MAIL_SEND_SECRET)
- `BREVO_API_KEY` — Email delivery (Brevo for specified domains)
- `BREVO_FROM` — Sender email address for Brevo
- `BREVO_DOMAINS` — Comma-separated domains for Brevo routing (e.g., "outlook.com,hotmail.com")

**Email Provider Routing**:
AnchorID supports three email providers with intelligent domain-based routing:

1. **Brevo** (for specified domains)
   - Used when: Recipient domain matches any domain in `BREVO_DOMAINS`
   - Supports subdomain matching: `outlook.com` matches both `user@outlook.com` and `user@mail.outlook.com`
   - Configuration: Requires `BREVO_API_KEY`, `BREVO_FROM`, and `BREVO_DOMAINS`

2. **mycal-style mailer** (preferred for other domains)
   - Used when: Brevo doesn't match and mycal-style mailer is configured
   - Configuration: Requires both `MAIL_SEND_SECRET` and `MYCAL_MAIL_ENDPOINT`
   - Compatible with any endpoint that implements the mycal-style mailer API (see `docs/mycal-style-mailer-spec.md`)
   - Simple HTTP POST with JSON body `{to, subject, body}` and `X-Mail-Secret` header

3. **Resend** (fallback)
   - Used when: No Brevo match and no mycal-style mailer configuration
   - Configuration: Requires `RESEND_API_KEY` and `EMAIL_FROM`

**Example Configuration**:
```bash
# Route Microsoft domains through Brevo
npx wrangler secret put BREVO_API_KEY      # Paste: xkeysib-...
npx wrangler secret put BREVO_FROM         # Paste: noreply@anchorid.net
npx wrangler secret put BREVO_DOMAINS      # Paste: outlook.com,hotmail.com,live.com

# Configure mycal-style mailer for other domains
npx wrangler secret put MAIL_SEND_SECRET       # Paste: your-secret-key
npx wrangler secret put MYCAL_MAIL_ENDPOINT    # Paste: https://example.com/api/send
```

**KV Operations**:
```bash
npm run kv:list:prod                              # List profile keys
npm run kv:get:prod -- "profile:UUID"             # Get specific profile
npx wrangler kv key put --remote --binding ANCHOR_KV "key" --path ./file  # Upload content
```

**Security Testing**:
```bash
npm test                          # Run all tests (includes security & load tests)
npm test test/security.spec.ts    # Run security tests only
npm test test/load.spec.ts        # Run load tests only
npm test -- --grep "Rate Limiting"  # Run specific test suite
```

See `docs/security-testing.md` for detailed testing guide and manual verification procedures.

---

## Project Structure

```
AnchorID/
├── src/
│   ├── index.ts                 # Main router, all HTTP handlers
│   ├── env.ts                   # Environment type definitions
│   ├── domain/
│   │   └── profile/
│   │       └── anchorid_profile.ts  # Core profile logic (buildProfile, canonicalizeUrl, mergeSameAs)
│   ├── claims/
│   │   ├── types.ts             # Claim type definitions
│   │   ├── store.ts             # Claims KV operations
│   │   ├── verify.ts            # Claim verification logic
│   │   └── handlers.ts          # Claim API handlers
│   ├── admin/
│   │   └── handlers.ts          # Admin UI handlers (create, edit, list profiles)
│   └── content/
│       ├── README.md            # Instructions for deploying static pages
│       ├── guide.html           # Placement guide (served at /guide)
│       └── privacy.html         # Privacy policy (served at /privacy)
├── docs/
│   ├── identity-model.md        # How identity works
│   ├── threat-model.md          # Security model
│   ├── faq.md                   # Frequently asked questions
│   ├── why-anchorid-is-deliberately-boring.md  # Design philosophy
│   └── wrangler-kv-gotchas.md   # KV notes
├── test/
│   └── index.spec.ts            # Tests
├── CLAUDE.md                    # This file
├── README.md                    # Public readme
├── todo.md                      # MVP checklist
├── wrangler.json                # Cloudflare Workers config
└── package.json
```

---

## Route Handlers (src/index.ts)

### Public Pages
| Route | Handler | Description |
|-------|---------|-------------|
| `GET /` | inline HTML | Homepage with signup/login links |
| `GET /about` | KV `page:about` | About page |
| `GET /guide` | KV `page:guide` | Placement guide |
| `GET /proofs` | KV `page:proofs` | Proofs overview |
| `GET /faq` | KV `page:faq` | FAQ page |
| `GET /privacy` | KV `page:privacy` | Privacy policy |
| `GET /sitemap.xml` | KV `page:sitemap` | XML sitemap |
| `GET /resolve/<uuid>` | `handleResolve()` | Canonical Person JSON-LD |
| `GET /claims/<uuid>` | `handleClaimsGet()` | Claims ledger (JSON or HTML) |

### Public Auth Flow
| Route | Handler | Description |
|-------|---------|-------------|
| `GET /signup` | inline HTML | Signup form |
| `POST /signup` | `handleSignup()` | Create profile, send magic link |
| `GET /setup` | `handleSetupPage()` | Post-signup page, shows backup token |
| `GET /login` | inline HTML | Login form (email magic link + backup token) |
| `POST /login` | `handleLogin()` | Send magic link email |
| `GET /edit` | `handleEditPage()` | Edit form with claims UI (token or backup_token auth) |
| `POST /update` | `handleUpdate()` | Save profile changes |

### Admin Routes (cookie auth)
| Route | Handler | Description |
|-------|---------|-------------|
| `GET /admin/login` | inline HTML | Admin login form |
| `POST /admin/login` | `handleAdminLogin()` | Set admin cookie |
| `GET /admin` | `handleAdminList()` | List all profiles |
| `GET /admin/new` | inline HTML | New profile form |
| `POST /admin/new` | `handleAdminCreate()` | Create profile |
| `GET /admin/created/<uuid>` | `handleAdminCreatedGet()` | Show backup token |
| `GET /admin/edit/<uuid>` | `handleAdminEdit()` | Edit profile, add email, delete profile |
| `POST /admin/edit/<uuid>` | `handleAdminEditPost()` | Save profile, supports email addition |
| `POST /admin/delete/<uuid>` | `handleAdminDelete()` | Delete profile (only if < 7 days old) |

### API Routes (Bearer auth)
| Route | Handler | Description | Auth |
|-------|---------|-------------|------|
| `POST /claim` | `handleClaimUpsert()` | Add/update claim | Admin token OR user session token |
| `POST /claim/verify` | `handleClaimVerify()` | Trigger verification | Admin token OR user session token |

**Authentication for claim endpoints:**
- **Admin access**: Use `Authorization: Bearer <ANCHOR_ADMIN_TOKEN>` - can manage claims for any profile
- **User access**: Use `Authorization: Bearer <session_token>` - can only manage claims for own profile (UUID must match session)

---

## Static Content Pages

HTML pages served from KV storage. Source files in `src/content/`.

**Deploy commands:**
```bash
# About page
npx wrangler kv key put --remote --binding ANCHOR_KV "page:about" --path ./src/content/about.html

# Guide page
npx wrangler kv key put --remote --binding ANCHOR_KV "page:guide" --path ./src/content/guide.html

# FAQ page
npx wrangler kv key put --remote --binding ANCHOR_KV "page:faq" --path ./src/content/faq.html

# Privacy policy
npx wrangler kv key put --remote --binding ANCHOR_KV "page:privacy" --path ./src/content/privacy.html

# Sitemap
npx wrangler kv key put --remote --binding ANCHOR_KV "page:sitemap" --path ./src/content/sitemap.xml
```

**To add a new static page:**
1. Create HTML file in `src/content/`
2. Add route handler in `src/index.ts` (copy pattern from `/guide` or `/privacy`)
3. Deploy to KV with wrangler command
4. Update `src/content/README.md` with deploy command

---

## KV Key Patterns

| Pattern | Contents | TTL |
|---------|----------|-----|
| `profile:<uuid>` | Person JSON-LD | Permanent |
| `claims:<uuid>` | Claims array | Permanent |
| `email:<sha256>` | UUID lookup by email hash | Permanent |
| `login:<token>` | Magic link session `{uuid, emailHash?, isSetup?, backupAccess?}` | 15 min |
| `signup:<uuid>` | Backup token (plaintext, one-time display) | 5 min |
| `created:<uuid>` | Backup token for admin flow | 60 sec |
| `audit:<uuid>` | Audit log entries (max 100) | Permanent |
| `page:<name>` | Static HTML pages (guide, privacy, proofs) | Permanent |
| `rl:login:<hash>` | Rate limit counter (login by email) | 1 hour |
| `rl:update:<uuid>` | Rate limit counter (profile updates) | 1 hour |
| `rl:claim:<uuid>` | Rate limit counter (claim creation) | 1 hour |
| `rl:verify:<uuid>` | Rate limit counter (claim verification) | 1 hour |
| `rl:ip:signup:<iphash>` | IP rate limit (signup) | 1 hour |
| `rl:ip:login:<iphash>` | IP rate limit (login) | 1 hour |
| `rl:ip:edit:<iphash>` | IP rate limit (edit page) | 1 hour |
| `rl:ip:update:<iphash>` | IP rate limit (updates) | 1 hour |
| `rl:ip:claim:<iphash>` | IP rate limit (claim creation) | 1 hour |
| `rl:ip:verify:<iphash>` | IP rate limit (verification) | 1 hour |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANCHOR_ADMIN_TOKEN` | — | Admin API token (secret) |
| `RESEND_API_KEY` | — | Resend email API key (secret) |
| `EMAIL_FROM` | — | Sender address for Resend (required if using Resend) |
| `MAIL_SEND_SECRET` | — | mycal-style mailer secret (required with MYCAL_MAIL_ENDPOINT) |
| `MYCAL_MAIL_ENDPOINT` | — | mycal-style mailer endpoint URL (required with MAIL_SEND_SECRET) |
| `BREVO_API_KEY` | — | Brevo email API key (secret) |
| `BREVO_FROM` | — | Sender address for Brevo (required if using Brevo) |
| `BREVO_DOMAINS` | — | Comma-separated domains for Brevo routing (e.g., "outlook.com,hotmail.com") |
| `LOGIN_TTL_SECONDS` | 900 | Magic link token lifetime |
| `LOGIN_RL_PER_HOUR` | 3 | Max login emails per email/hour |
| `UPDATE_RL_PER_HOUR` | 20 | Max updates per UUID/hour |
| `IP_LOGIN_RL_PER_HOUR` | 10 | Max login attempts per IP/hour |
| `IP_EDIT_RL_PER_HOUR` | 30 | Max edit page loads per IP/hour |
| `IP_UPDATE_RL_PER_HOUR` | 60 | Max update submissions per IP/hour |
| `IP_CLAIM_RL_PER_HOUR` | 30 | Max claim operations per IP/hour |
| `IP_VERIFY_RL_PER_HOUR` | 20 | Max verification attempts per IP/hour |
| `CLAIM_RL_PER_HOUR` | 10 | Max claim operations per UUID/hour |
| `VERIFY_RL_PER_HOUR` | 20 | Max verification attempts per UUID/hour |

---

## Core Domain Logic

### Profile Building (`src/domain/profile/anchorid_profile.ts`)

- `buildProfile(uuid, stored, input, verifiedUrls, options)` — Canonicalizes and merges profile data
- `canonicalizeUrl(input)` — URL normalization (HTTPS, lowercase hostname, remove fragments)
- `mergeSameAs(manual, verified)` — Union of manual + verified URLs, deduplicated & sorted

**Timestamp semantics:**
- `dateCreated` — Immutable, set once at creation
- `dateModified` — Bumped only on actual structural changes

**sameAs merge policy:**
- Manual sameAs: stored/editable field
- Verified sameAs: derived from claims at resolve-time
- Effective sameAs (public): manual ∪ verified

### Claims System (`src/claims/`)

Four claim types:
- **Website**: Proof at `https://domain/.well-known/anchorid.txt` containing resolver URL
- **GitHub**: Profile README containing resolver URL
- **DNS**: TXT record at `_anchorid.domain.com` containing resolver URL
- **Social**: Profile page bio/description containing resolver URL (Mastodon, etc.)

Claim states: `self_asserted` → `verified` or `failed`

**User self-service claims:**
- Users can add and verify claims through the `/edit` page UI
- Claims are displayed with status badges (self_asserted/verified/failed)
- Users can trigger verification for any of their claims
- Session token authentication ensures users can only manage their own claims

**Social profile claims:**
- Supports Fediverse/Mastodon: `@user@instance.social` or full URL
- Supports forums and any public HTTPS profile
- SSRF protection blocks localhost, private IPs, cloud metadata endpoints
- Verification: fetches profile page and searches for resolver URL in bio/description
- Input formats: `@mycal@noauthority.social` or `https://noauthority.social/@mycal`

---

## Documentation

| File | Description |
|------|-------------|
| `README.md` | Public-facing project overview |
| `docs/identity-model.md` | How identity, profiles, claims work |
| `docs/threat-model.md` | Security model and mitigations |
| `docs/faq.md` | Frequently asked questions |
| `docs/why-anchorid-is-deliberately-boring.md` | Design philosophy |
| `docs/mycal-style-mailer-spec.md` | Email API specification for compatible endpoints |
| `todo.md` | MVP implementation checklist |

---

## Auth Mechanisms

1. **Admin cookie** — Set via `/admin/login`, guards `/admin/*` routes
2. **Admin bearer token** — `Authorization: Bearer <ANCHOR_ADMIN_TOKEN>` for API endpoints (full access)
3. **User session token** — `Authorization: Bearer <session_token>` for claim API endpoints (own profile only)
4. **Magic link tokens** — One-time tokens in KV, consumed on save, also used as session tokens
5. **Backup tokens** — SHA-256 hash stored in profile, plaintext shown once at creation

---

## Admin Features

### Email Addition to Existing Profiles
Admins can add email addresses to profiles that don't have one configured (legacy accounts created before email auth). From `/admin/edit/<uuid>`:
- Inline form appears when `_emailHash` is not set
- Validates email format and checks for duplicates
- Creates `email:<sha256>` → UUID mapping in KV
- Enables magic link login for the profile
- Includes audit logging

### Profile Deletion (< 7 Days)
Admins can delete profiles that are less than 7 days old. From `/admin/edit/<uuid>`:
- "Danger Zone" UI appears for profiles < 7 days old
- "Profile Protection" notice appears for profiles >= 7 days old
- Validates profile age using `dateCreated` field
- Deletes all associated KV keys:
  - `profile:<uuid>`
  - `claims:<uuid>`
  - `audit:<uuid>`
  - `signup:<uuid>`
  - `created:<uuid>`
  - `email:<hash>` (if email configured)
- CSRF protection and admin-only access
- Redirects to `/admin` with success message

---

## Common Tasks

### Add a new profile field
1. Update `PersonProfile` type in `src/domain/profile/anchorid_profile.ts`
2. Update `buildProfile()` to handle the field
3. Update edit form HTML in `handleEditPage()` (src/index.ts)
4. Update `handleUpdate()` to accept the field in patch

### Add a new claim type
1. Add type to `Claim['type']` union in `src/claims/types.ts`
2. Add proof builder in `src/claims/verify.ts`
3. Update `handleClaimUpsert()` in `src/claims/handlers.ts`

### Add a new static page
1. Create `src/content/<page>.html`
2. Add route in `src/index.ts`:
   ```typescript
   if (path === "/<page>" || path === "/<page>/") {
     const html = await env.ANCHOR_KV.get("page:<page>");
     if (!html) return new Response("Not found", { status: 404 });
     return new Response(html, {
       headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" }
     });
   }
   ```
3. Deploy: `npx wrangler kv key put --remote --binding ANCHOR_KV "page:<page>" --path ./src/content/<page>.html`
4. Update `src/content/README.md`

---

## Current Status

See `todo.md` for the MVP checklist. Core functionality complete:
- ✅ Identity resolution
- ✅ Claims verification (website, GitHub, DNS, social profiles)
- ✅ Email magic link flow with domain-based routing (Brevo, mycal.net, Resend)
- ✅ Backup token recovery
- ✅ Admin UI (with email addition and profile deletion)
- ✅ User self-service claims UI
- ✅ Rate limiting
- ✅ Documentation
