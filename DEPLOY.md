# Production Deployment Instructions

## Prerequisites

Ensure you have Wrangler installed and authenticated:
```bash
npx wrangler login
```

---

## Step 1: Run Tests

```bash
npm test
```

Ensure all tests pass before deploying.

---

## Step 2: Deploy the Worker

```bash
npm run deploy
```

This deploys the Cloudflare Worker code to production.

---

## Step 3: Configure Secrets (if not already set)

### Required Secrets

**Admin secret** (generate a secure random string, 32+ chars — this is the only
brute-force protection on the admin interface, so it must carry the entropy):
```bash
npx wrangler secret put ANCHOR_ADMIN_SECRET
```

`ANCHOR_ADMIN_TOKEN` is still accepted as a legacy fallback for the API bearer
token, but `ANCHOR_ADMIN_SECRET` is preferred. Rotating the secret immediately
revokes all admin login sessions.

**Email index pepper** (recommended — makes the email→UUID index resistant to
offline dictionary reversal if KV data or a backup ever leaks):
```bash
npx wrangler secret put EMAIL_PEPPER    # long random string, 32+ chars
```

⚠️ **Set it once and never rotate or remove it.** Index keys migrated to the
peppered form are unrecoverable under a different pepper — affected users
would need their backup token to log in. Deploying the code without the
secret is safe (legacy behavior); setting the secret activates HMAC hashing
for new signups and lazily migrates existing users at their next login.

**X (Twitter) claim verification** (optional):
```bash
npx wrangler secret put X_API_BEARER_TOKEN   # OAuth 2.0 App-Only Bearer token
```

Without this secret the X claim type is hidden in the claim UI and X verification
returns a transient failure rather than revoking existing claims. X API reads are
metered, so a worker-wide hourly ceiling is applied — see `X_API_RL_PER_HOUR`
below and `docs/proofs/x.md`.

**Optional admin tuning** (plain vars, set in `wrangler.jsonc`, not secrets):
- `ADMIN_SESSION_TTL_SECONDS` — admin session lifetime (default 43200 = 12h)
- `ENABLE_ADMIN_DEBUG` — set to `"true"` to expose `/admin/debug/kv` (off by default)
- `X_API_RL_PER_HOUR` — worker-wide cap on metered X API reads (default 200)

**Email provider** - choose at least one:

#### Option 1: Brevo (for Microsoft domains)
```bash
npx wrangler secret put BREVO_API_KEY        # Get from brevo.com
npx wrangler secret put BREVO_FROM           # e.g., noreply@anchorid.net
npx wrangler secret put BREVO_DOMAINS        # e.g., outlook.com,hotmail.com,live.com
```

#### Option 2: mycal-style mailer (preferred for other domains)
```bash
npx wrangler secret put MAIL_SEND_SECRET      # Your secret key
npx wrangler secret put MYCAL_MAIL_ENDPOINT   # Your endpoint URL
```

#### Option 3: Resend (fallback)
```bash
npx wrangler secret put RESEND_API_KEY        # Get from resend.com
npx wrangler secret put EMAIL_FROM            # e.g., noreply@anchorid.net
```

### View Existing Secrets

```bash
npx wrangler secret list
```

---

## Step 4: Deploy Static Content Pages to KV

### Individual Commands

Run each command to update specific pages:

```bash
# Core pages
npx wrangler kv key put --remote --binding ANCHOR_KV "page:about" --path ./src/content/about.html
npx wrangler kv key put --remote --binding ANCHOR_KV "page:faq" --path ./src/content/faq.html
npx wrangler kv key put --remote --binding ANCHOR_KV "page:guide" --path ./src/content/guide.html
npx wrangler kv key put --remote --binding ANCHOR_KV "page:privacy" --path ./src/content/privacy.html

# Proof documentation pages
npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs" --path ./src/content/proofs.html
npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs-website" --path ./src/content/proofs-website.html
npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs-dns" --path ./src/content/proofs-dns.html
npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs-github" --path ./src/content/proofs-github.html
npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs-social" --path ./src/content/proofs-social.html

# Meta files
npx wrangler kv key put --remote --binding ANCHOR_KV "page:sitemap" --path ./src/content/sitemap.xml
npx wrangler kv key put --remote --binding ANCHOR_KV "page:robots" --path ./src/content/robots.txt
npx wrangler kv key put --remote --binding ANCHOR_KV "page:humans" --path ./src/content/humans.txt
```

### All-in-One Command

Deploy all static content pages at once:

```bash
npx wrangler kv key put --remote --binding ANCHOR_KV "page:about" --path ./src/content/about.html && \
npx wrangler kv key put --remote --binding ANCHOR_KV "page:faq" --path ./src/content/faq.html && \
npx wrangler kv key put --remote --binding ANCHOR_KV "page:guide" --path ./src/content/guide.html && \
npx wrangler kv key put --remote --binding ANCHOR_KV "page:privacy" --path ./src/content/privacy.html && \
npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs" --path ./src/content/proofs.html && \
npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs-website" --path ./src/content/proofs-website.html && \
npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs-dns" --path ./src/content/proofs-dns.html && \
npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs-github" --path ./src/content/proofs-github.html && \
npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs-social" --path ./src/content/proofs-social.html && \
npx wrangler kv key put --remote --binding ANCHOR_KV "page:sitemap" --path ./src/content/sitemap.xml && \
npx wrangler kv key put --remote --binding ANCHOR_KV "page:robots" --path ./src/content/robots.txt && \
npx wrangler kv key put --remote --binding ANCHOR_KV "page:humans" --path ./src/content/humans.txt
```

---

## Step 5: Verify Deployment

### Check Worker Status

```bash
npx wrangler deployments list
```

### Test Key Endpoints

```bash
# Homepage
curl https://anchorid.workers.dev/

# Admin login (should return login page)
curl https://anchorid.workers.dev/admin/login

# Static pages
curl https://anchorid.workers.dev/about
curl https://anchorid.workers.dev/guide
curl https://anchorid.workers.dev/faq
```

### Check Admin Interface

1. Visit `https://anchorid.workers.dev/admin/login`
2. Login with your `ANCHOR_ADMIN_SECRET`
3. Verify the enhanced list view shows email/metadata table

Login mints an opaque session cookie (`adminsess:` in KV, 12h TTL) — the cookie
never contains the secret itself. Logout revokes the session server-side.

---

## Step 6: Monitor

### View Real-time Logs

```bash
npx wrangler tail
```

### View Deployments

```bash
npx wrangler deployments list
```

---

## Quick Deploy Checklist

- [ ] Tests pass (`npm test`)
- [ ] Worker deployed (`npm run deploy`)
- [ ] Secrets configured (check with `npx wrangler secret list`)
- [ ] Static pages uploaded to KV (13 pages total — see `src/content/README.md`)
- [ ] Admin login working
- [ ] Email sending working (test with `/create`)
- [ ] Enhanced admin list view showing metadata
- [ ] If enabling X claims: `X_API_BEARER_TOKEN` set and `page:proofs-x` uploaded

---

## Important Notes

### Admin Sessions (since 2026-08-14 security remediation)
- The admin cookie is an opaque KV-backed session id, **not** the admin secret
- **After deploying the remediation for the first time, admins must log in again**
  — old secret-as-cookie values no longer authenticate
- Rotating `ANCHOR_ADMIN_SECRET` revokes every outstanding admin session immediately
- Wrangler config is `wrangler.jsonc` only (`wrangler.toml` was removed — it was
  silently ignored by Wrangler)

### Email Retention Feature
- Newly created profiles will now store plaintext emails for 7 days in `email:unhashed:{uuid}` keys
- Emails auto-expire via KV TTL (no cleanup required)
- Only visible in admin interface

### Admin View Enhancements
- The `/admin` page now shows a rich metadata table instead of plain UUID list
- Displays: UUID, type, name, email (obfuscated), dates, recent activity
- Integrated with search and pagination

### Data Migration
- **No migration needed**: Existing profiles continue working
- Old emails won't be retroactively stored (only new profiles)
- Existing profiles can add email via admin edit page

### Static Content
- Must be manually deployed to KV when HTML files change
- Not automatically deployed with `npm run deploy`
- Source of truth: files in `src/content/`

---

## Troubleshooting

### Worker not updating after deploy
```bash
# Force a new deployment
npm run deploy
```

Do **not** pass an ad-hoc `--compatibility-date` to force a redeploy — the
compatibility date changes Workers runtime behavior and is pinned deliberately
in `wrangler.jsonc`. Bump it only as an intentional, tested change.

### Admin login stopped working after deploying
- Expected once after the 2026-08-14 remediation: old cookies held the secret
  and no longer authenticate — just log in again at `/admin/login`
- If a rotated `ANCHOR_ADMIN_SECRET` was deployed, all sessions were revoked
  by design; log in with the new secret

### Static pages showing old content
```bash
# Re-upload specific page
npx wrangler kv key put --remote --binding ANCHOR_KV "page:about" --path ./src/content/about.html

# Check what's in KV
npx wrangler kv key get --remote --binding ANCHOR_KV "page:about"
```

### Email not sending
```bash
# Verify secrets are set
npx wrangler secret list

# Check logs for errors
npx wrangler tail
```

### Admin interface issues
```bash
# Verify admin token is set
npx wrangler secret list | grep ANCHOR_ADMIN_TOKEN

# Test admin login endpoint
curl -v https://anchorid.workers.dev/admin/login
```

---

## Production URLs

Replace `anchorid.workers.dev` with your custom domain if configured:

- Homepage: `https://anchorid.workers.dev/`
- Admin: `https://anchorid.workers.dev/admin/login`
- Create Profile: `https://anchorid.workers.dev/create`
- Resolver: `https://anchorid.workers.dev/resolve/{uuid}`

---

## Environment-Specific Deployments

### Preview Environment

If you have a preview KV namespace configured:

```bash
# Deploy to preview
npx wrangler deploy --env preview

# Upload static content to preview KV
npx wrangler kv key put --env preview --binding ANCHOR_KV "page:about" --path ./src/content/about.html
```

### Custom Domain Setup

1. Add custom domain in Cloudflare Dashboard → Workers & Pages → anchorid → Settings → Domains
2. Update DNS records as instructed
3. Wait for SSL certificate provisioning
4. Test with your custom domain

---

## Rollback

If issues arise after deployment:

```bash
# List recent deployments
npx wrangler deployments list

# Rollback to specific deployment
npx wrangler rollback <deployment-id>
```

---

## Security Checklist

- [ ] `ANCHOR_ADMIN_SECRET` is a strong, random string (32+ characters) — the
      admin-login rate limiter is not brute-force protection; the secret's
      entropy is the security boundary (see threat-model.md)
- [ ] Email provider secrets are correctly configured
- [ ] Rate limiting is enabled (default in code; abuse-dampening only)
- [ ] Admin interface only accessible via login session or bearer token
- [ ] HTTPS enforced for all endpoints
- [ ] Audit logs enabled for profile changes
- [ ] After first deploy of the session change: confirm an old admin cookie is
      rejected and fresh login works

---

## Performance Optimization

### KV Caching
Static pages are cached in KV and served with 5-minute cache headers. No additional configuration needed.

### Rate Limits
Default rate limits are configured in code:
- Login: 3/hour per email, 10/hour per IP
- Signup: 10/hour per IP
- Updates: 20/hour per UUID, 60/hour per IP

Adjust via env vars in `wrangler.jsonc` (e.g. `LOGIN_RL_PER_HOUR`,
`UPDATE_RL_PER_HOUR`, `IP_LOGIN_RL_PER_HOUR` — full list in CLAUDE.md) rather
than editing code. Note these limits are abuse-dampening, not a security
boundary: KV counters are non-atomic (see threat-model.md).

---

## Support

For issues or questions:
- Check logs: `npx wrangler tail`
- Review docs: `docs/` directory
- Security testing: `docs/security-testing.md`
- Threat model: `docs/threat-model.md`
