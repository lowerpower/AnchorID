# AnchorID FAQ

Frequently asked questions about AnchorID.

---

## General

### What is AnchorID?

AnchorID is a minimal identity resolver. It provides UUID-based identity anchors that can be linked to external profiles (websites, GitHub, etc.) through verifiable proofs.

Think of it as a stable reference point—a permanent identifier you control that other systems can point to without fear that its meaning will change.

### Why would I use AnchorID?

If you want:
- A permanent identifier that survives platform changes
- Verifiable links between your various online identities
- A simple, public record of who you are across the web
- Something that will remain interpretable in 20 years

### How is this different from other identity systems?

Most identity systems optimize for features: strong cryptography, elegant protocols, fast onboarding. AnchorID optimizes for **longevity**.

It uses deliberately boring technologies (UUIDs, HTTPS, JSON, schema.org) because they're widely implemented, deeply archived, and likely to remain interpretable long after today's cutting-edge identity stacks are forgotten.

### Is AnchorID decentralized?

Yes and no. The resolver runs on Cloudflare Workers, which is centralized infrastructure. But:

- All data is public and can be mirrored
- Proofs are verifiable by anyone with a URL fetcher
- The schema.org format requires no AnchorID-specific software to read
- If AnchorID disappeared, your profile remains a valid JSON document

Decentralization here means **survivability**, not formal topology.

---

## Accounts and Access

### Do I need an account?

No. There are no usernames or passwords. Access is controlled through:
- **Email magic links**: One-time edit links sent to your email
- **Backup token**: A recovery token shown once at creation

### How do I edit my profile?

1. Go to `/login` and enter your email
2. Click the link in the email you receive
3. Make your changes and save

The link expires after 15 minutes and can only be used once.

### What if I lose access to my email?

Use your backup token. When you created your AnchorID, you were shown a recovery token. Enter it at `/edit` along with your UUID to regain access.

If you've lost both your email access and backup token, there is no recovery path. This is intentional—AnchorID cannot verify you are who you claim to be without these.

### Can I change my email?

Currently, the email associated with an AnchorID cannot be changed through the public interface. This prevents account takeover through social engineering.

### Can I delete my AnchorID?

No. The identifier is permanent by design. You can clear all optional fields (name, description, URLs), but the UUID itself persists forever.

This is a feature, not a limitation. Stable identifiers are useless if they can disappear.

---

## Profile and Data

### What information is stored?

Your profile contains:
- UUID (permanent identifier)
- Name and alternate names
- Description
- Canonical URL (your "about me" page)
- sameAs links (other profiles representing you)
- Timestamps (creation and last modification)

All of this is public.

### What information is private?

Your email address is stored as a hash, not in plaintext. It cannot be recovered from the stored data. No other information is private.

### How are URLs normalized?

All URLs are automatically:
- Upgraded to HTTPS
- Lowercased (hostname only)
- Stripped of fragments (#section)
- Stripped of trailing slashes

This means `http://Example.com/` and `https://example.com` become the same canonical URL.

### What happens when I save without changing anything?

Nothing. The `dateModified` timestamp only updates when something actually changes. This makes the timestamp meaningful—it represents real modifications, not just saves.

---

## Claims and Verification

### What is a claim?

A claim is an assertion that you control an external identity (a website or GitHub profile). Claims must be verified before they appear in your public profile.

### How do I verify a website?

1. Create a claim for your website URL
2. Place a file at `https://yourdomain.com/.well-known/anchorid.txt`
3. The file must contain your full resolve URL: `https://anchorid.net/resolve/<your-uuid>`
4. Trigger verification

### How do I verify a GitHub profile?

1. Create a claim for your GitHub profile URL
2. Create a repo named `<your-username>/<your-username>` if it doesn't exist
3. Add your resolve URL to the README.md
4. Trigger verification

### What if verification fails?

The claim is marked as `failed` in your claims ledger. You can try again after fixing the issue. Common problems:
- Proof file not accessible (check permissions, redirects)
- Wrong URL in the proof file (must be exact match)
- GitHub README not in the right repo

### Do I need to keep the proof files forever?

For best results, yes. Verification is a point-in-time check. If someone later tries to verify your claim independently and the proof is gone, they'll see it's no longer present.

### What's the difference between manual and verified sameAs?

- **Manual sameAs**: Links you add directly, stored in your profile
- **Verified sameAs**: Links proven through claims, derived from the claims ledger

Your public profile shows the union of both. This means you can add links without verification, but verified links carry more weight.

---

## Technical

### What format is the profile in?

JSON-LD using schema.org vocabulary. Specifically, a `Person` object with standard properties. Any system that understands schema.org can parse it without AnchorID-specific code.

### Can I access the API directly?

Yes. The public endpoints are:
- `GET /resolve/<uuid>` — Returns the canonical profile (JSON-LD)
- `GET /claims/<uuid>` — Returns the claims ledger (JSON or HTML)

Both support content negotiation via the `Accept` header.

### Is there rate limiting?

Yes. To prevent abuse:
- Login requests: 10/hour per IP, 3/hour per email
- Edit page: 30/hour per IP
- Updates: 60/hour per IP, 20/hour per UUID

If you hit a limit, wait an hour.

### Where is the data stored?

Cloudflare KV (key-value storage). Data is replicated globally and served from edge locations.

### Is there an SLA?

No. AnchorID is provided as-is. That said, it's built on Cloudflare Workers, which has excellent uptime. The system is designed to degrade gracefully and leave behind interpretable artifacts even if the service stops.

---

## Philosophy

### Why "boring" technologies?

Boring technologies age better. UUIDs, HTTPS, JSON, and schema.org have been around for decades and will likely remain interpretable for decades more. Novel protocols and cryptographic schemes come with upgrade and migration burdens.

AnchorID bets that survivability matters more than sophistication.

### Why no passwords?

Passwords create problems:
- Users reuse them and they get breached
- Recovery mechanisms become attack vectors
- Password storage adds security surface area

Email magic links shift authentication to your email provider, which already handles account security. The backup token provides a fallback that doesn't require ongoing management.

### Why can't I delete my profile?

Deletion undermines the core promise: a stable identifier that other systems can rely on. If identifiers can disappear, they're not stable.

You can clear all optional content. The empty identifier still exists, which is the point.

### What happens if AnchorID shuts down?

Your profile is a valid JSON-LD document that can be:
- Archived by web crawlers
- Mirrored by anyone who fetches it
- Interpreted by any schema.org-aware system

The proofs (files on your website, GitHub README) remain under your control. A future system could re-verify them.

This is why AnchorID uses boring, standards-based formats: they remain meaningful without AnchorID-specific infrastructure.

---

## Troubleshooting

### I didn't receive the magic link email

Check:
1. Spam/junk folder
2. Correct email address
3. Rate limits (max 3 requests per hour per email)

If using a corporate email, check if external senders are blocked.

### My verification keeps failing

Check:
1. Proof file is accessible via HTTPS (try fetching it yourself)
2. URL in proof file matches exactly (including trailing slash)
3. No redirects that change the URL
4. For GitHub: repo is `username/username` and README is in the main branch

### The edit link says "expired"

Magic links expire after 15 minutes. Request a new one from `/login`.

### I forgot my backup token

There's no way to recover it. The backup token is shown exactly once at creation. If you didn't save it and lose email access, you cannot edit your profile.

This is intentional—it's the tradeoff for not having password recovery.
