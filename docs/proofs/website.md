# Website Proof (Domain Control)

Website proof lets you prove you control a website by publishing a text file at a well-known location that contains your AnchorID UUID.

This is a **website-control** proof. It does not prove legal identity.

---

## Setup

### 1) Create the proof file

Create a file named `anchorid.txt` in the `.well-known` directory of your website.

**File path:**
```
/.well-known/anchorid.txt
```

**File contents:**
```
https://anchorid.net/resolve/<your-uuid>
```

**Example:**
```
https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

### 2) Make it publicly accessible

The file must be accessible at:
```
https://example.com/.well-known/anchorid.txt
```

**Important:**
- Must be served over HTTPS
- Must be publicly accessible (no authentication required)
- Must return `200 OK` status
- Content-Type can be `text/plain` or any text type

### 3) Verify in AnchorID

In AnchorID, choose **Website Proof**, enter your domain (example.com), and click Verify.

---

## What the verification checks

When you verify a website claim, AnchorID will:

1. Fetch `https://example.com/.well-known/anchorid.txt`
2. Check that the file contains your resolver URL: `https://anchorid.net/resolve/<uuid>`
3. Mark the claim as verified if the URL is found

The URL match is case-sensitive and must be exact.

---

## Accepted domains

You can claim:
- Root domains: `example.com`
- Subdomains: `blog.example.com`
- Any domain you control

Each domain requires its own proof file.

---

## Multiple proofs on one domain

You can verify multiple AnchorID profiles from the same domain by including multiple resolver URLs in the file, one per line:

```
https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c
https://anchorid.net/resolve/a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d
```

Each user can then verify their respective claim.

---

## Troubleshooting

### "File not found" or 404

- Confirm the file exists at `https://example.com/.well-known/anchorid.txt`
- Check that your web server serves the `.well-known` directory
- Some frameworks require special configuration to serve dotfiles

### "Proof not found"

- Verify the file contains exactly: `https://anchorid.net/resolve/<your-uuid>`
- Check for typos in the UUID
- Ensure there are no extra characters or formatting
- Try viewing the file in your browser to confirm it's accessible

### HTTPS issues

- The file must be served over HTTPS, not HTTP
- Mixed content or certificate issues will cause verification to fail
- Ensure your SSL certificate is valid

### Web server configuration

**Apache (.htaccess):**
```apache
# Enable .well-known directory
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{REQUEST_URI} ^/.well-known/
  RewriteRule ^ - [L]
</IfModule>
```

**Nginx:**
```nginx
location /.well-known/ {
    allow all;
}
```

**Next.js / React / SPA:**
Place the file in your `public/.well-known/anchorid.txt` directory.

---

## What website proof is good for

- Personal websites and blogs (strong signal)
- Company websites (strong signal)
- Project homepages (strong signal)
- Portfolio sites (good signal)

Website proof is most valuable when paired with a DNS proof:
- DNS TXT record at `_anchorid.example.com`
- Website proof at `https://example.com/.well-known/anchorid.txt`

This combination provides the strongest ownership signal.

---

## Security considerations

- Anyone with access to your web server can add or modify the proof file
- Keep your web server secure
- Regularly verify your proofs to ensure they haven't been tampered with
- Consider using file permissions to restrict write access

---

## Comparison with other proofs

| Proof Type | Requirement | Signal Strength |
|------------|-------------|-----------------|
| Website | File upload access | Strong |
| DNS | DNS control | Strong |
| Website + DNS | Both | Strongest |
| GitHub | Profile README edit | Good |

---

## API usage

Create a website claim:
```bash
curl -X POST https://anchorid.net/claim \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "YOUR-UUID",
    "type": "website",
    "url": "https://example.com"
  }'
```

Verify the claim:
```bash
curl -X POST https://anchorid.net/claim/verify \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "YOUR-UUID",
    "id": "website:example.com"
  }'
```

---

## Standards and conventions

The `.well-known` directory is defined in [RFC 8615](https://www.rfc-editor.org/rfc/rfc8615.html) as a standard location for site-wide metadata.

AnchorID follows this convention for discoverability and compatibility with existing web infrastructure.
