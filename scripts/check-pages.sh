#!/usr/bin/env bash
# Compare every static content page in production KV against src/content/.
# Exit 1 if any page:* key is missing or differs from its source file.
#
# Usage: npm run pages:check        (or: bash scripts/check-pages.sh)
#
# Written 2026-08-23 after /about had been serving a 148-byte test stub since
# the 2026-08-18 incident (the suite ran against prod KV and a CSP-hash test
# overwrote page:about); the 08-19 restore skipped page: keys by design, so
# nothing noticed for five days.
set -uo pipefail

NAMESPACE_ID="813539ddad014d25b787ecb551dbe51b"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# key -> source file (mirror of src/content/README.md)
PAGES="
page:about=about.html
page:guide=guide.html
page:faq=faq.html
page:privacy=privacy.html
page:proofs=proofs.html
page:proofs-website=proofs-website.html
page:proofs-github=proofs-github.html
page:proofs-dns=proofs-dns.html
page:proofs-social=proofs-social.html
page:proofs-x=proofs-x.html
page:sitemap=sitemap.xml
page:robots=robots.txt
page:humans=humans.txt
"

status=0
for entry in $PAGES; do
  key="${entry%%=*}"
  file="src/content/${entry#*=}"
  if [ ! -f "$file" ]; then
    printf "%-20s  SKIP   (no %s in repo)\n" "$key" "$file"
    continue
  fi
  if ! npx wrangler kv key get --remote --namespace-id "$NAMESPACE_ID" "$key" > "$TMP/kv" 2>/dev/null; then
    printf "%-20s  MISSING  -> npx wrangler kv key put --remote --binding ANCHOR_KV \"%s\" --path ./%s\n" "$key" "$key" "$file"
    status=1
    continue
  fi
  if cmp -s "$TMP/kv" "$file"; then
    printf "%-20s  ok     (%s bytes)\n" "$key" "$(wc -c < "$file")"
  else
    printf "%-20s  DRIFT  kv=%s src=%s bytes -> npx wrangler kv key put --remote --binding ANCHOR_KV \"%s\" --path ./%s\n" \
      "$key" "$(wc -c < "$TMP/kv")" "$(wc -c < "$file")" "$key" "$file"
    status=1
  fi
done

[ "$status" -eq 0 ] && echo "All pages match source." || echo "Drift detected — re-upload the keys listed above."
exit $status
