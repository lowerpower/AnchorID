# docs/proofs/social.md

# Social Profile Proof

Social profile proof lets you prove you control a social media account, forum profile, or any public profile page by adding your AnchorID resolver URL to your bio/description.

This is an **account-control** proof. It demonstrates you control an account at a moment in time, not legal identity.

---

## Supported Platforms

Social proof works with any public profile accessible via HTTPS without authentication:

- **Mastodon / Fediverse** - ActivityPub instances
- **Forums** - Discourse, phpBB, custom forums
- **Community platforms** - Reddit, Hacker News, Stack Overflow
- **Profile pages** - Personal sites with public bios
- **Any public HTTPS profile** with editable bio/description

---

## Setup Instructions

### 1. Add AnchorID to your profile bio

Edit your profile and add your resolver URL anywhere in your bio or description:

```
https://anchorid.net/resolve/<your-uuid>
```

**Example bio:**
```
Software developer interested in open source.
Canonical identity: https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

The URL just needs to appear somewhere in your profile text. AnchorID will search the entire page for it.

### 2. Create the claim in AnchorID

1. Go to [/login](https://anchorid.net/login) and authenticate
2. Scroll to "Identity Claims" section
3. Click "Add New Claim"
4. Choose **Social Profile** proof type
5. Enter your profile URL or Fediverse handle
6. Click "Add Claim"

### 3. Verify the claim

After adding your AnchorID to your bio, click the "Verify" button next to your claim.

AnchorID will:
1. Fetch your public profile page
2. Search for your resolver URL
3. Mark the claim as **verified** if found ✅

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

---

## What social proof is good for

- **Community identity** - Link your AnchorID to forum accounts
- **Social presence** - Connect Mastodon/Fediverse profiles
- **Distributed identity** - Multiple profiles across platforms
- **Attribution signals** - Help others find your canonical identity

**Proof strength:** Social profile proof is a **moderate signal**. It proves you control an account but not domain ownership.

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

## Example: Mastodon Setup

1. Log in to your Mastodon instance
2. Go to Preferences → Profile → Bio
3. Add: `https://anchorid.net/resolve/<your-uuid>`
4. Save changes
5. In AnchorID, add claim with: `@username@instance.social`
6. Click "Verify"

Your Mastodon profile is now linked to your AnchorID! ✅
