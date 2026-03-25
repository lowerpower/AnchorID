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

**Admin access token** (generate a secure random string):
```bash
npx wrangler secret put ANCHOR_ADMIN_TOKEN
```

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
2. Login with your `ANCHOR_ADMIN_TOKEN`
3. Verify the enhanced list view shows email/metadata table

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
- [ ] Static pages uploaded to KV (12 pages total)
- [ ] Admin login working
- [ ] Email sending working (test with `/create`)
- [ ] Enhanced admin list view showing metadata

---

## Important Notes

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

# Clear cache and redeploy
npx wrangler deploy --compatibility-date=$(date +%Y-%m-%d)
```

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

- [ ] `ANCHOR_ADMIN_TOKEN` is a strong, random string (32+ characters)
- [ ] Email provider secrets are correctly configured
- [ ] Rate limiting is enabled (default in code)
- [ ] Admin interface only accessible with token
- [ ] HTTPS enforced for all endpoints
- [ ] Audit logs enabled for profile changes

---

## Performance Optimization

### KV Caching
Static pages are cached in KV and served with 5-minute cache headers. No additional configuration needed.

### Rate Limits
Default rate limits are configured in code:
- Login: 3/hour per email, 10/hour per IP
- Signup: 10/hour per IP
- Updates: 20/hour per UUID, 60/hour per IP

Adjust in `src/index.ts` if needed.

---

## Support

For issues or questions:
- Check logs: `npx wrangler tail`
- Review docs: `docs/` directory
- Security testing: `docs/security-testing.md`
- Threat model: `docs/threat-model.md`
