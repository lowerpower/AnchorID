# docs/proofs/x.md

# X (Twitter) Proof

X proof verifies control of an X account by reading your profile bio or the website
field on your profile and looking for your AnchorID resolver URL.

Like every other AnchorID claim, this is an **edit-access** proof: it demonstrates you
could edit that profile at a moment in time, not legal identity.

---

## How it differs from every other proof type

Every other AnchorID proof is fetched with an ordinary anonymous HTTPS request, which
means anyone can re-run the check themselves with `curl`. X proof cannot work that way —
`x.com` serves a JavaScript shell to non-browser clients, so a plain fetch never sees the
bio text. AnchorID therefore reads the profile through the X API using a server-side
application token.

**What this changes, stated plainly:**

- The proof is still **public and human-checkable**. Anyone can open
  `https://x.com/<handle>` in a browser and see the resolver URL in the bio for
  themselves.
- The proof is **not machine-re-checkable by a third party**. Someone without their own X
  API credentials cannot programmatically reproduce the check the way they can for a
  website, DNS or GitHub proof.
- Verification can fail for reasons **inside AnchorID's control** — an expired API token,
  a quota ceiling, an outage. This is a first for the system. Such failures are treated as
  *transient*: they record that a check was attempted and leave the claim's status
  untouched, rather than revoking a good claim.

If you want a proof that any stranger can independently verify end to end, use a
[website](./website.md), [DNS](./dns.md) or [GitHub](./github.md) proof. X proof is a
convenience for an account you already have, not the strongest link in your record.

---

## Setup

### 1. Add the claim

On your `/edit` page, choose **X (profile bio)** and enter either form:

```
@yourhandle
https://x.com/yourhandle
```

`twitter.com` URLs and `www.` prefixes are accepted and normalized. The claim is always
stored canonically as `https://x.com/<handle>`, lowercased.

### 2. Put your AnchorID on your X profile

Add the resolver URL to **either** your bio **or** the website field on your profile:

```
https://anchorid.net/resolve/<your-uuid>
```

X bios are 160 characters. If that is tight, these shorter forms also verify:

| Form | Example |
|---|---|
| Short URL | `anchorid.net/<uuid>` |
| Labeled | `AnchorID: <uuid>` |
| Compact | `aid:<uuid>` |
| URN | `urn:uuid:<uuid>` |

A bare UUID with no label or URL around it does **not** verify.

### 3. Verify

Click **Verify** on the claim. On success the claim moves to `verified` and
`https://x.com/<handle>` is published in your profile's `sameAs`.

---

## What AnchorID reads

Only two fields, both public:

- `description` — your bio text
- the `url` field — the website link on your profile

Specifically, AnchorID reads the **expanded** form of any link in those fields. X rewrites
every URL in a bio through its `t.co` shortener and shows a truncated display form, so the
real destination is only visible in the expanded link data the API returns.

AnchorID does **not** read your posts, your followers, your direct messages, your email
address, or anything requiring you to log in. There is no "Sign in with X" step and
AnchorID never asks for access to your account.

A link that merely *redirects* to your resolver URL does not verify. The marker has to be
on X.

---

## Handle changes

The claim is keyed on the handle. If you change your X handle, the old claim stops
verifying — add the claim again under the new handle and delete the old one.

Because handles on X can be released and re-registered by someone else, a `verified` X
claim is a statement about the account that held the handle when it was checked. This is
the same caveat that applies to any platform-issued name, and is one of the reasons
AnchorID identifiers are UUIDs rather than names.

---

## Troubleshooting

| Message | Meaning |
|---|---|
| "Proof not found" | The resolver URL or a short marker isn't in your bio or website field. Check for typos and that the change is saved. |
| "X account not found" | The handle doesn't exist. Check spelling, or re-add the claim if you changed handles. |
| "X account unavailable" | The account is suspended or restricted, so its bio can't be read. |
| "X verification temporarily unavailable" | The API request limit was reached. Your claim status is unchanged — try again shortly. |
| "X verification is not enabled" | This server has no X API credentials configured. Contact the administrator. |
| "Could not reach the X API" | Temporary network problem. Your claim status is unchanged. |

Verification results are cached for about 15 minutes. Use the re-check option to bypass
the cache after editing your bio.

---

## For operators

X proof is off unless `X_API_BEARER_TOKEN` is set as a Wrangler secret. When it is unset,
the X option does not appear in the claim UI at all.

```bash
npx wrangler secret put X_API_BEARER_TOKEN   # OAuth 2.0 App-Only Bearer token
```

X API reads are metered. Three limits bound the spend: the existing per-UUID and per-IP
verification rate limits, a 15-minute KV response cache keyed by handle (shared across
profiles claiming the same handle), and a worker-wide hourly ceiling set by
`X_API_RL_PER_HOUR` (default 200). Hitting the ceiling produces a transient failure, never
a revoked claim.
