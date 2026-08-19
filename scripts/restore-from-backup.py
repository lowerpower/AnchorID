#!/usr/bin/env python3
"""
Build a `wrangler kv bulk put` file from a raw KV backup dump.

Usage:
    python3 scripts/restore-from-backup.py <dump.json> <out.json> [uuid ...]

- With uuids: restores profile/claims/email/audit keys for just those
  identities, and sets _emailVerified on each restored profile so the nightly
  purge cron (which deletes unverified profiles older than 5 days) does not
  immediately delete them again. Only do this for identities you know are
  real — it is the same flag a magic-link login would have set.
- Without uuids: restores every profile/claims/email/audit key AS-IS (no
  _emailVerified injection). Unverified profiles older than 5 days will be
  re-purged by the next cron run, by design.
- `page:` keys are never restored (content pages in prod are usually newer
  than any backup); rl:/adminsess:/login:/signup: are transient and skipped.

Then apply with:
    npx wrangler kv bulk put --remote --binding ANCHOR_KV <out.json>

Written after the 2026-08-18 incident (test suite wiped prod KV via a
remote:true binding); backup source was backup/kv-2026-03-25-163808.json.
"""

import json
import sys

RESTORE_PREFIXES = ("profile:", "claims:", "email:", "audit:")


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)

    dump_path, out_path, uuids = sys.argv[1], sys.argv[2], sys.argv[3:]
    dump = json.load(open(dump_path))

    def wanted(key: str) -> bool:
        if not key.startswith(RESTORE_PREFIXES):
            return False
        if key.startswith("email:unhashed:"):
            return False  # transient (7d TTL) and stale by now
        if not uuids:
            return True
        if key.startswith("email:"):
            return False  # selective email keys are handled per-profile below
        return any(u in key for u in uuids)

    bulk = []
    for key, value in dump.items():
        if not wanted(key):
            continue
        if uuids and key.startswith("profile:"):
            profile = json.loads(value)
            profile["_emailVerified"] = True
            value = json.dumps(profile)
            # Restore this profile's email index mapping too.
            email_hash = profile.get("_emailHash")
            if email_hash:
                mapping = dump.get(f"email:{email_hash}", key[len("profile:"):])
                bulk.append({"key": f"email:{email_hash}", "value": mapping})
        bulk.append({"key": key, "value": value})

    json.dump(bulk, open(out_path, "w"), indent=1)
    kinds = {}
    for item in bulk:
        kinds[item["key"].split(":")[0]] = kinds.get(item["key"].split(":")[0], 0) + 1
    print(f"{len(bulk)} keys -> {out_path}  {kinds}")
    print(f"apply with: npx wrangler kv bulk put --remote --binding ANCHOR_KV {out_path}")


if __name__ == "__main__":
    main()
