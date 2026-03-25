# Branding Updates - Bluesky Reference Removal - January 30, 2026

## Overview

Remove all references to Bluesky from public-facing documentation and UI. Update social profile claim descriptions to focus on Mastodon and generic social platforms.

**Date:** January 30, 2026
**Status:** ✅ Complete
**Scope:** Documentation and UI text updates

---

## What Changed

### Context

Due to concerns about Bluesky's trajectory in 2026, all references to Bluesky have been removed from AnchorID's public-facing content while maintaining full technical support for social profile verification on any public HTTPS platform.

**Technical Note:** The underlying social profile claim verification system remains platform-agnostic and will continue to work with any public profile page, including Bluesky if users choose to use it.

---

## Files Modified

### 1. `CLAUDE.md` (Project Documentation)

**Before:**
```markdown
- **Social**: Profile page bio/description containing resolver URL (Mastodon, Bluesky, etc.)
```

**After:**
```markdown
- **Social**: Profile page bio/description containing resolver URL (Mastodon, etc.)
```

**Before:**
```markdown
**Social profile claims:**
- Supports Fediverse/Mastodon: `@user@instance.social` or full URL
- Supports Bluesky, forums, and any public HTTPS profile
```

**After:**
```markdown
**Social profile claims:**
- Supports Fediverse/Mastodon: `@user@instance.social` or full URL
- Supports forums and any public HTTPS profile
```

---

### 2. `src/content/guide.html` (Placement Guide)

**Line 300 - Before:**
```html
<strong>Social Profile</strong>: Add resolver URL to your bio/description on Mastodon, Bluesky, or any public profile
```

**After:**
```html
<strong>Social Profile</strong>: Add resolver URL to your bio/description on Mastodon or any public profile
```

**Lines 313-317 - Before:**
```html
<ul>
  <li>Mastodon and Fediverse instances (any instance)</li>
  <li>Bluesky</li>
  <li>Public forums and community platforms</li>
  <li>Any profile page accessible via HTTPS without authentication</li>
</ul>
```

**After:**
```html
<ul>
  <li>Mastodon and Fediverse instances (any instance)</li>
  <li>Public forums and community platforms</li>
  <li>Any profile page accessible via HTTPS without authentication</li>
</ul>
```

---

### 3. `src/content/about.html` (About Page)

**Line 165 - Before:**
```html
<p>Publish a small proof file on a website, domain, GitHub profile, or social profile you control. AnchorID supports four verification methods: website (.well-known/anchorid.txt), GitHub (profile README), DNS (TXT record), and social profiles (Mastodon, Bluesky, etc.). Verified proofs strengthen attribution signals.</p>
```

**After:**
```html
<p>Publish a small proof file on a website, domain, GitHub profile, or social profile you control. AnchorID supports four verification methods: website (.well-known/anchorid.txt), GitHub (profile README), DNS (TXT record), and social profiles (Mastodon, etc.). Verified proofs strengthen attribution signals.</p>
```

---

### 4. `src/content/faq.html` (FAQ Page)

**Line 136 (JSON-LD Schema) - Before:**
```json
"text": "AnchorID does not require platform support. You may place your AnchorID in public author surfaces such as bios or profiles if you choose. This creates a durable attribution signal that survives platform churn. Social profiles (Mastodon, Bluesky, etc.) can also serve as verification surfaces — you can prove ownership by adding your AnchorID to your bio. AnchorID does not attempt to tag or track individual posts."
```

**After:**
```json
"text": "AnchorID does not require platform support. You may place your AnchorID in public author surfaces such as bios or profiles if you choose. This creates a durable attribution signal that survives platform churn. Social profiles (Mastodon, etc.) can also serve as verification surfaces — you can prove ownership by adding your AnchorID to your bio. AnchorID does not attempt to tag or track individual posts."
```

**Line 367 (Body Content) - Before:**
```html
<p>Social profiles (Mastodon, Bluesky, etc.) can also serve as verification surfaces — you can prove ownership by adding your AnchorID to your bio.</p>
```

**After:**
```html
<p>Social profiles (Mastodon, etc.) can also serve as verification surfaces — you can prove ownership by adding your AnchorID to your bio.</p>
```

---

### 5. `src/index.ts` (Main Application)

**Line 2015 (Claim Type Dropdown) - Before:**
```html
<option value="social">Social Profile (Mastodon, Bluesky, etc.)</option>
```

**After:**
```html
<option value="social">Social Profile (Mastodon, etc.)</option>
```

---

## Technical Impact

### What Still Works

✅ **Social Profile Verification** - Unchanged functionality:
- Mastodon/Fediverse profiles
- Any public HTTPS profile page
- Forums and community platforms
- Profile pages with accessible bio/description

✅ **Verification Method** - Same process:
1. User adds `claim_type: "social"`
2. User provides profile URL
3. System fetches public profile page
4. System searches for AnchorID resolver URL in page content
5. Verification succeeds if URL is found

✅ **SSRF Protection** - Still blocks:
- Localhost and private IP ranges
- Cloud metadata endpoints
- Non-HTTPS URLs (except for localhost development)

### What Changed

❌ **Documentation Only:**
- No functional code changes
- No API changes
- No database schema changes
- No verification logic changes

**Impact:** Pure documentation/branding update with zero technical changes.

---

## Rationale

**Marketing Considerations:**
- Bluesky's trajectory in 2026 raised concerns
- Avoid association with controversial platforms
- Focus on decentralized/federated options (Mastodon)
- Maintain generic "any public profile" language

**Technical Integrity:**
- System remains platform-agnostic
- No technical restrictions added
- Users can still verify Bluesky profiles if desired
- Documentation reflects recommended use cases, not technical limits

**Future-Proofing:**
- "etc." suffix allows flexibility
- Focus on protocol (public HTTPS) over platform names
- Reduces maintenance burden for platform-specific references

---

## Files Not Modified

The following files contain Bluesky references but were intentionally **not modified**:

### Draft Documents (Ignored by Git)
- `JSON-LD-STRAT.md` - Draft strategy document
- `docs/changelogs/CHANGELOG-social-profile-claims.md` - Historical changelog

**Rationale:**
- Historical accuracy in changelogs
- Draft documents not published
- Accurately reflects implementation at time of writing

---

## Deployment

**Date Committed:** January 30, 2026
**Commit:** `e720c43` - "Remove Bluesky references from documentation and UI"

**Changes:**
- 5 files modified
- 7 insertions(+)
- 8 deletions(-)

**Files Affected:**
1. CLAUDE.md
2. src/content/guide.html
3. src/content/about.html
4. src/content/faq.html
5. src/index.ts

**Deployment Command:**
```bash
npm run deploy
```

**Post-Deployment:**
All public-facing pages updated:
- `/about` - Updated proof method description
- `/guide` - Updated supported platforms list
- `/faq` - Updated social media question
- `/edit` - Updated claim type dropdown

---

## Verification

### Before Deployment
```bash
grep -r "Bluesky" src/content/
grep -r "Bluesky" src/index.ts
grep -r "Bluesky" CLAUDE.md
```

**Expected:** Multiple matches

### After Deployment
```bash
grep -r "Bluesky" src/content/
grep -r "Bluesky" src/index.ts
grep -r "Bluesky" CLAUDE.md
```

**Expected:** 0 matches in production files

### Ignored Files (Still Contain References)
```bash
grep -r "Bluesky" docs/changelogs/
grep -r "Bluesky" JSON-LD-STRAT.md
```

**Expected:** Matches in historical/draft documents (intentional)

---

## User-Facing Changes

### Edit Page (/edit)
**Before:** "Social Profile (Mastodon, Bluesky, etc.)"
**After:** "Social Profile (Mastodon, etc.)"

### Guide Page (/guide)
**Before:** "Supported platforms include: Mastodon and Fediverse instances (any instance), Bluesky, Public forums..."
**After:** "Supported platforms include: Mastodon and Fediverse instances (any instance), Public forums..."

### About Page (/about)
**Before:** "...social profiles (Mastodon, Bluesky, etc.)..."
**After:** "...social profiles (Mastodon, etc.)..."

### FAQ Page (/faq)
**Before:** "Social profiles (Mastodon, Bluesky, etc.) can also serve as verification surfaces"
**After:** "Social profiles (Mastodon, etc.) can also serve as verification surfaces"

---

## Related Documentation

- **Social Profile Claims:** See `docs/changelogs/CHANGELOG-social-profile-claims.md` for original implementation
- **Technical Spec:** Social profile verification in `src/claims/verify.ts` (unchanged)
- **Admin Search:** See `docs/changelogs/CHANGELOG-admin-search-pagination.md` for concurrent updates

---

## Notes

**Historical Context:**
This update reflects branding preferences as of January 30, 2026. The technical implementation remains platform-agnostic and will work with any public profile page regardless of platform.

**Future Platform References:**
When adding examples of supported platforms, prefer:
1. Decentralized/federated options (Mastodon, Fediverse)
2. Generic descriptions ("public forums", "any public profile")
3. Avoid specific commercial platform names unless essential

**Reverting (If Needed):**
```bash
git revert e720c43
```

---

**Status:** ✅ Deployed to production
