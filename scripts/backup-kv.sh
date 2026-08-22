#!/usr/bin/env bash
# Dump every key in the production ANCHOR_KV namespace to backup/kv-<timestamp>.json
# as a flat {"key": "value", ...} object — the same shape as
# backup/kv-2026-03-25-163808.json, which scripts/restore-from-backup.py consumes.
#
# Usage: npm run backup            (or: bash scripts/backup-kv.sh)
#
# Tries `wrangler kv bulk get` (one round-trip) and falls back to one
# `wrangler kv key get` per key if the bulk output does not parse.
set -euo pipefail

NAMESPACE_ID="813539ddad014d25b787ecb551dbe51b"
STAMP="$(date -u +%Y-%m-%d-%H%M%S)"
OUT="backup/kv-${STAMP}.json"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p backup

echo "Listing keys..."
npx wrangler kv key list --namespace-id "$NAMESPACE_ID" --remote > "$TMP/list.json"
node -e '
  const l = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  require("fs").writeFileSync(process.argv[2], JSON.stringify(l.map(e => e.name)));
  console.log(l.length + " keys");
' "$TMP/list.json" "$TMP/keys.json"
EXPECTED="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).length)' "$TMP/keys.json")"

echo "Fetching values (bulk)..."
if npx wrangler kv bulk get --namespace-id "$NAMESPACE_ID" --remote "$TMP/keys.json" > "$TMP/bulk.out" 2> "$TMP/bulk.err" \
   && node -e '
     const fs = require("fs");
     const raw = fs.readFileSync(process.argv[1], "utf8");
     const expected = Number(process.argv[2]);
     // wrangler may print a banner before the JSON; take from the first "{" or "[".
     const start = Math.min(...["{", "["].map(c => { const i = raw.indexOf(c); return i < 0 ? Infinity : i; }));
     if (!isFinite(start)) process.exit(1);
     let parsed = JSON.parse(raw.slice(start));
     // Accept either {key: value} or [{key, value}] shapes.
     if (Array.isArray(parsed)) {
       const obj = {};
       for (const e of parsed) { if (e && typeof e.key === "string") obj[e.key] = e.value; }
       parsed = obj;
     }
     const n = Object.keys(parsed).length;
     if (n !== expected) { console.error("bulk returned " + n + " keys, expected " + expected); process.exit(1); }
     for (const [k, v] of Object.entries(parsed)) {
       if (typeof v !== "string") { console.error("non-string value for " + k); process.exit(1); }
     }
     fs.writeFileSync(process.argv[3], JSON.stringify(parsed, null, 2));
   ' "$TMP/bulk.out" "$EXPECTED" "$OUT"
then
  echo "bulk get ok"
else
  echo "bulk get unavailable/unparseable — falling back to per-key get ($EXPECTED keys)"
  : > "$TMP/pairs.ndjson"
  while IFS= read -r key; do
    npx wrangler kv key get --namespace-id "$NAMESPACE_ID" --remote "$key" > "$TMP/val" 2>/dev/null
    node -e '
      const fs = require("fs");
      const rec = { key: process.argv[1], value: fs.readFileSync(process.argv[2], "utf8") };
      fs.appendFileSync(process.argv[3], JSON.stringify(rec) + "\n");
    ' "$key" "$TMP/val" "$TMP/pairs.ndjson"
  done < <(node -e 'for (const k of JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))) console.log(k)' "$TMP/keys.json")
  node -e '
    const fs = require("fs");
    const obj = {};
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      if (!line) continue;
      const r = JSON.parse(line); obj[r.key] = r.value;
    }
    fs.writeFileSync(process.argv[2], JSON.stringify(obj, null, 2));
  ' "$TMP/pairs.ndjson" "$OUT"
fi

node -e '
  const obj = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const kinds = {};
  for (const k of Object.keys(obj)) { const p = k.split(":")[0]; kinds[p] = (kinds[p] || 0) + 1; }
  console.log("wrote " + process.argv[1] + ": " + Object.keys(obj).length + " keys " + JSON.stringify(kinds));
' "$OUT"
