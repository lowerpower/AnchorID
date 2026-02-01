# docs/proofs/social.md

# Public Profile Proof

Public profile proof lets you verify control of **ANY publicly accessible page** by adding your AnchorID resolver URL. Works with social media profiles, forum accounts, GitHub repositories, project documentation, personal sites, and any public page with editable content.

This is an **edit-access** proof. It demonstrates you can edit a specific public page at a moment in time, not legal identity.

**About the name:** Despite being called "social proof," this method works with **any public HTTPS page** — not just social media. It applies to GitHub repositories, project documentation, forums, community sites, personal websites, or any public page where you can add text. The name is historical; think of it as "public page verification."

---

## Supported Platforms

**This works with ANY publicly accessible HTTPS page, not just social media.**

Examples include:

- **GitHub repositories** - Any public repo README, docs, or CONTRIBUTORS.md
- **Project documentation** - Public docs sites, wikis, project pages
- **Mastodon / Fediverse** - ActivityPub instances
- **Forums** - Discourse, phpBB, custom forums
- **Community platforms** - Reddit, Hacker News, Stack Overflow
- **Profile pages** - Personal sites with public bios
- **Any public HTTPS page** with editable content

---

## Repository Attribution

Unlike the [GitHub profile proof](./github.md) (which verifies your GitHub identity), public profile proof can verify you have **edit access to ANY public repository**.

This is useful for:

- **Proving contribution to specific projects** - Show you have write access to a repository
- **Attributing work on repositories you don't own** - Link your identity to projects you contribute to
- **Linking project documentation to your identity** - Claim ownership of specific docs or wikis
- **Multi-repository attribution** - Verify access to multiple projects without needing separate GitHub profile proof

**Just add your AnchorID to any public README, docs file, or CONTRIBUTORS.md**

Example URLs:
```
https://github.com/username/projectname
https://github.com/org/repo/blob/main/README.md
https://github.com/org/repo/blob/main/docs/contributors.md
https://raw.githubusercontent.com/user/repo/main/README.md
```

AnchorID will fetch the public page and verify your resolver URL appears in the content.

---

## Setup Instructions

### 1. Add AnchorID to any public page

Edit any public page you have access to and add your resolver URL anywhere in the content:

```
https://anchorid.net/resolve/<your-uuid>
```

**Example for profile bio:**
```
Software developer interested in open source.
Canonical identity: https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

**Example for repository README:**
```markdown
# My Project

This project is maintained by [Your Name].

Canonical identity: https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

The URL just needs to appear somewhere in the page content. AnchorID will search the entire page for it.

### 2. Create the claim in AnchorID

1. Go to [/login](https://anchorid.net/login) and authenticate
2. Scroll to "Identity Claims" section
3. Click "Add New Claim"
4. Choose **Public Profile** proof type
5. Enter the page URL (profile URL, repo URL, Fediverse handle, etc.)
6. Click "Add Claim"

### 3. Verify the claim

After adding your AnchorID to the public page, click the "Verify" button next to your claim.

AnchorID will:
1. Fetch the public page
2. Search for your resolver URL **OR** just your UUID
3. Mark the claim as **verified** if found ✅

---

## Space-Constrained Environments

For platforms with strict character limits (like social media bios or short profile fields), you can use **just the UUID** instead of the full resolver URL:

**Full URL (recommended):**
```
https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

**UUID only (space-constrained):**
```
4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

**Examples:**

**Twitter bio (limited space):**
```
Software developer | Open source contributor
Identity: 4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

**Forum signature (limited space):**
```
AnchorID: 4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

**GitHub bio (160 chars):**
```
Developer working on distributed systems. 4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

AnchorID verification will find **either** the full resolver URL or just the UUID. The UUID must match the exact format (8-4-4-4-12 hex digits).

**Note:** While the UUID-only format saves space, the full URL is more human-readable and immediately identifies the verification service. Use UUID-only only when character limits require it.

---

## Input Formats

### Mastodon / Fediverse Handles

You can use WebFinger-style handles or full URLs:

```
@mycal@noauthority.social          → https://noauthority.social/@mycal
mycal@noauthority.social           → https://noauthority.social/@mycal
https://noauthority.social/@mycal  → (used as-is)
```

AnchorID automatically converts handles to profile URLs.

### Full URLs

For other platforms, use the full profile URL:

```
https://forum.example.com/users/username
https://reddit.com/u/username
https://news.ycombinator.com/user?id=username
```

**Requirements:**
- Must be HTTPS (not HTTP)
- Must be publicly accessible without login
- Must contain your bio/description with your AnchorID URL

---

## Security

AnchorID blocks access to:
- Localhost and private IP ranges (127.0.0.0/8, 192.168.0.0/16, 10.0.0.0/8)
- Cloud metadata endpoints (169.254.169.254)
- Non-HTTPS URLs

This prevents SSRF (Server-Side Request Forgery) attacks.

---

## Troubleshooting

### "Failed to fetch profile page"
- Confirm the URL is publicly accessible without authentication
- Check that the URL uses HTTPS (not HTTP)
- Verify the page loads in an incognito/private browser window
- Some platforms may block automated requests - try again later

### "Profile fetched but resolver URL not found"
- Confirm you added the complete resolver URL to your bio
- Check for typos in the UUID
- Make sure the bio/description section is publicly visible
- Try refreshing your profile to ensure changes are saved

### "URL blocked for security reasons"
This means the URL points to:
- Localhost or private network (127.0.0.1, 192.168.x.x, 10.x.x.x)
- Cloud metadata endpoint (169.254.169.254)
- Non-HTTPS URL

AnchorID only allows public HTTPS URLs for security.

### Fediverse handle not recognized
Make sure the handle format is correct:
- ✅ Correct: `@user@instance.social` or `user@instance.social`
- ❌ Incorrect: `@user` (missing instance)
- ❌ Incorrect: `instance.social/@user` (use full URL or @user@instance format)

### Can I use just the UUID instead of the full URL?

**Yes!** For space-constrained environments (Twitter bios, forum signatures, etc.), you can use just your UUID:

```
4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

AnchorID verification will find **either** the full resolver URL or just the UUID in your profile content.

**Note:** The full URL (`https://anchorid.net/resolve/your-uuid`) is recommended when space permits, as it's more human-readable and immediately identifies the verification service. Use UUID-only only when character limits require it.

---

## What public profile proof is good for

Use this proof type to verify control of:

- **Repository attribution** - Prove you can edit specific GitHub repos or projects
- **Project contributions** - Link your work on open source projects to your identity
- **Social media accounts** - Mastodon, Fediverse, Bluesky
- **Community platforms** - Forums, Stack Overflow, Hacker News
- **Professional networks** - LinkedIn, AngelList, or industry-specific platforms
- **Personal sites with bios** - Portfolio sites, About pages, author profiles
- **Distributed identity** - Multiple profiles across different platforms
- **Attribution signals** - Help others find your canonical identity

**Proof strength:** Public profile proof is a **moderate signal**. It proves you control an account but not domain ownership.

For stronger signals, combine with:
- [Website proof](website.md) (domain control)
- [DNS proof](dns.md) (domain control)

---

## Privacy

**What AnchorID sees:**
- The public HTML of your profile page (only during verification)
- Your profile URL (stored in claims record)

**What AnchorID does NOT see:**
- Private messages or posts
- Account credentials
- OAuth tokens or session data
- Follower lists or private information

AnchorID only fetches the public profile page to verify your resolver URL appears in the bio. No authentication is used.

---

## Examples

### Example 1: Mastodon Setup

1. Log in to your Mastodon instance
2. Go to Preferences → Profile → Bio
3. Add: `https://anchorid.net/resolve/<your-uuid>`
4. Save changes
5. In AnchorID, add claim with: `@username@instance.social`
6. Click "Verify"

Your Mastodon profile is now linked to your AnchorID! ✅

### Example 2: GitHub Repository

1. Open a public repository you have write access to
2. Edit the README.md (or create CONTRIBUTORS.md, docs/about.md, etc.)
3. Add anywhere in the file:
   ```
   Canonical identity: https://anchorid.net/resolve/<your-uuid>
   ```
4. Commit and push changes
5. In AnchorID, add claim with the repo URL:
   ```
   https://github.com/username/projectname
   ```
   or direct file URL:
   ```
   https://github.com/org/repo/blob/main/README.md
   ```
6. Click "Verify"

Your contribution to this repository is now verifiable via your AnchorID! ✅

**Tip:** You can verify multiple repositories by adding separate claims for each one. This is useful for proving you contribute to multiple open source projects or maintaining attribution across different codebases.
