# Wrangler KV Gotcha (v4): Use --remote for Production Data

When using **Wrangler v4**, KV commands **default to local / preview context**, even if your Worker is deployed and actively using production KV.

This can make it look like KV is empty when it is not.

## Symptoms

- Worker runtime successfully reads/writes KV in production
- Admin UI works, profiles exist
- But CLI shows:
  - `wrangler kv key list` → `[]`
  - `wrangler kv key get` → `Value not found`

## Root Cause

Wrangler v4 separates **preview/dev KV** and **deployed (remote) KV**.

CLI commands without `--remote` often target preview KV.

## The Fix

Always add `--remote` when inspecting **production KV**.

### List production keys

```sh
npx wrangler kv key list \
  --namespace-id 813539ddad014d25b787ecb551dbe51b \
  --prefix "profile:" \
  --remote

