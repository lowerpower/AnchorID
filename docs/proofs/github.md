# GitHub Proof (Profile Verification)

GitHub proof lets you prove you control a GitHub account by adding your AnchorID to your profile README.

This is a **GitHub account control** proof. It does not prove legal identity.

---

## Setup

### 1) Create your profile README (if you don't have one)

GitHub allows you to create a special repository that displays on your profile page.

**Repository name:** Your GitHub username (exactly)

**Example:** If your username is `johndoe`, create a repository named `johndoe`

**File:** `README.md` in the root of that repository

**Visibility:** Must be public

### 2) Add your AnchorID to the README

Add the following line anywhere in your README.md:

```
Canonical identity: https://anchorid.net/resolve/<your-uuid>
```

**Example:**
```
Canonical identity: https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

**Placement suggestions:**
- At the bottom of your README (recommended)
- In an "About" section
- In your bio/introduction

### 3) Commit and push

Make sure your changes are committed and pushed to the main branch on GitHub.

### 4) Verify in AnchorID

In AnchorID, choose **GitHub Proof**, enter your GitHub profile URL (https://github.com/username), and click Verify.

---

## What the verification checks

When you verify a GitHub claim, AnchorID will:

1. Extract your username from the URL you provide
2. Fetch the raw README from: `https://raw.githubusercontent.com/<username>/<username>/main/README.md`
3. Check that the file contains your resolver URL: `https://anchorid.net/resolve/<uuid>`
4. Mark the claim as verified if the URL is found

The URL match is case-sensitive and must be exact.

---

## Accepted formats

**Full profile URL:**
```
https://github.com/username
```

**Profile URL with trailing slash:**
```
https://github.com/username/
```

Both will work. AnchorID normalizes URLs before processing.

---

## Repository requirements

- Repository name must match your username exactly
- Repository must be public
- README.md must be in the main branch
- Branch name: `main` (default)

If your default branch is `master` instead of `main`, the verification may fail. Update your default branch to `main` or contact support.

---

## Troubleshooting

### "Profile README not found"

- Confirm you have a repository named exactly your username
- Check that the repository is public
- Verify the README.md file exists in the root
- Ensure the default branch is `main`

### "Proof not found"

- Verify the README contains exactly: `https://anchorid.net/resolve/<your-uuid>`
- Check for typos in the UUID
- Ensure there are no extra characters or URL encoding
- Try viewing the raw file at: `https://raw.githubusercontent.com/username/username/main/README.md`

### Username case sensitivity

GitHub usernames are case-insensitive, but AnchorID normalizes them to lowercase. Use lowercase in your claim URL to avoid confusion.

---

## Example README

Here's a minimal example of a profile README with AnchorID:

```markdown
# Hi, I'm John Doe 👋

I'm a software engineer interested in distributed systems and identity.

## Projects

- [My Blog](https://example.com)
- [Cool Project](https://github.com/johndoe/cool-project)

---

Canonical identity: https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c
```

---

## What GitHub proof is good for

- Developers and open source contributors (good signal)
- Code attribution (good signal)
- Technical identity verification (good signal)
- Linking commits to canonical identity (good signal)

GitHub proof is valuable for:
- Establishing authorship of code
- Connecting technical work to your identity
- Building reputation in open source communities

---

## Combining with other proofs

For strongest verification, combine GitHub proof with:

**Website proof:**
- GitHub profile shows your personal website
- Website has `.well-known/anchorid.txt` proof
- Creates bidirectional verification

**DNS proof:**
- If you have a personal domain
- DNS TXT record + GitHub README
- Strong signal for professional identity

---

## Security considerations

- Anyone with write access to your repository can modify the README
- Use GitHub's security features (2FA, SSH keys) to protect your account
- Regularly verify your proofs to ensure they haven't been tampered with
- Consider branch protection rules for added security

---

## Privacy note

Your profile README is public. If you prefer privacy:
- Use a professional GitHub account separate from personal projects
- Consider whether linking your GitHub to your canonical identity is appropriate
- Remember that all verified claims are publicly visible

---

## API usage

Create a GitHub claim:
```bash
curl -X POST https://anchorid.net/claim \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "YOUR-UUID",
    "type": "github",
    "url": "https://github.com/username"
  }'
```

Verify the claim:
```bash
curl -X POST https://anchorid.net/claim/verify \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "YOUR-UUID",
    "id": "github:username"
  }'
```

---

## GitHub profile README documentation

For more information on GitHub profile READMEs:
- [GitHub Docs: Managing your profile README](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/customizing-your-profile/managing-your-profile-readme)

---

## Comparison with other proofs

| Proof Type | Access Required | Signal Strength | Best For |
|------------|----------------|-----------------|----------|
| GitHub | Repository write access | Good | Developers, OSS contributors |
| Website | Web server access | Strong | Personal/company sites |
| DNS | DNS control | Strong | Domain owners |
| Website + DNS | Both | Strongest | Organizations |

---

## Advanced: Multiple GitHub accounts

If you have multiple GitHub accounts (personal, work, organization):
- Each account can have its own AnchorID
- Or link multiple GitHub accounts to one AnchorID by verifying each separately
- This helps consolidate identity across different work contexts

---

## Why GitHub matters for identity

GitHub is heavily indexed by:
- Search engines (Google, Bing)
- AI training systems
- Developer tools and platforms
- Recruitment and professional networks

Verified GitHub identity helps:
- Strengthen attribution of your code
- Reduce ambiguity in search results
- Connect your technical work to your canonical identity
- Build a coherent professional presence
