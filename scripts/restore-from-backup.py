#!/usr/bin/env python3
"""
Build a `wrangler kv bulk put` file from a raw KV backup dump.

Usage:
    python3 scripts/restore-from-backup.py <dump.json> <out.json> [uuid ...]

- With uuids: restores profile/claims/audit keys for just those identities,
  every `email:` index key that POINTS AT one of them, their `emailkey:`
  pointers, and sets _emailVerified on each restored profile so the nightly
  purge cron (which deletes unverified profiles older than 5 days) does not
  immediately delete them again. Only do this for identities you know are
  real — it is the same flag a magic-link login would have set.
- Without uuids: restores every profile/claims/email/emailkey/audit key AS-IS
  (no _emailVerified injection). Unverified profiles older than 5 days will
  be re-purged by the next cron run, by design.
- `page:` keys are never restored (content pages in prod are usually newer
  than any backup); rl:/adminsess:/login:/signup:/xcache: are transient and
  skipped; `deleted:` tombstones are skipped (restoring a profile and its
  tombstone together would make the profile look dead).

Then apply with:
    npx wrangler kv bulk put --remote --binding ANCHOR_KV <out.json>

Written after the 2026-08-18 incident (test suite wiped prod KV via a
remote:true binding); backup source was backup/kv-2026-03-25-163808.json.

2026-08-22: email index keys are now selected by their VALUE (the uuid they
map to), not re-derived from the profile's `_emailHash`. The first restore
only re-derived, and four early-2026 profiles whose documents had lost
`_emailHash` — while their `email:` keys were still live in the dump — came
back with no login mapping at all. The `_emailHash`-derived key is still
added as a fallback for a profile whose index key is missing from the dump.
"""

import json
import sys

# Per-identity keys: "<prefix><uuid>".
IDENTITY_PREFIXES = ("profile:", "claims:", "audit:", "emailkey:")
# Index keys: "email:<hash>" -> uuid. Selected by value.
EMAIL_PREFIX = "email:"
TRANSIENT_EMAIL_PREFIX = "email:unhashed:"  # 7d TTL and stale by now


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)

    dump_path, out_path, uuids = sys.argv[1], sys.argv[2], sys.argv[3:]
    dump = json.load(open(dump_path))

    def is_email_index(key: str) -> bool:
        return key.startswith(EMAIL_PREFIX) and not key.startswith(TRANSIENT_EMAIL_PREFIX)

    def identity_of(key: str):
        for p in IDENTITY_PREFIXES:
            if key.startswith(p):
                return key[len(p):]
        return None

    selected = set(uuids)
    bulk = []
    index_keys_by_uuid = {}

    # Pass 1: identity-scoped keys.
    for key, value in dump.items():
        uuid = identity_of(key)
        if uuid is None:
            continue
        if selected and uuid not in selected:
            continue
        if selected and key.startswith("profile:"):
            profile = json.loads(value)
            profile["_emailVerified"] = True
            value = json.dumps(profile)
        bulk.append({"key": key, "value": value})

    # Pass 2: email index keys, chosen by the uuid they point at.
    for key, value in dump.items():
        if not is_email_index(key):
            continue
        if selected and value not in selected:
            continue
        bulk.append({"key": key, "value": value})
        index_keys_by_uuid.setdefault(value, set()).add(key)

    # Pass 3 (selective only): a profile with _emailHash but no index key in
    # the dump gets one re-derived, so it can still log in.
    if selected:
        for item in list(bulk):
            if not item["key"].startswith("profile:"):
                continue
            uuid = item["key"][len("profile:"):]
            email_hash = json.loads(item["value"]).get("_emailHash")
            if not email_hash:
                continue
            derived = f"email:{email_hash}"
            if derived in index_keys_by_uuid.get(uuid, set()):
                continue
            if any(b["key"] == derived for b in bulk):
                continue
            bulk.append({"key": derived, "value": uuid})
            index_keys_by_uuid.setdefault(uuid, set()).add(derived)

    json.dump(bulk, open(out_path, "w"), indent=1)
    kinds = {}
    for item in bulk:
        kind = item["key"].split(":")[0]
        kinds[kind] = kinds.get(kind, 0) + 1
    print(f"{len(bulk)} keys -> {out_path}  {kinds}")
    if selected:
        missing = [u for u in selected if not any(b["key"] == f"profile:{u}" for b in bulk)]
        if missing:
            print(f"WARNING: no profile in dump for: {missing}")
        no_login = [u for u in selected if u not in index_keys_by_uuid and u not in missing]
        if no_login:
            print(f"NOTE: no email index key for (backup-token login only): {no_login}")
    print(f"apply with: npx wrangler kv bulk put --remote --binding ANCHOR_KV {out_path}")


if __name__ == "__main__":
    main()
