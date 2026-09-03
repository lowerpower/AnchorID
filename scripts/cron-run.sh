#!/usr/bin/env bash
# Cron wrapper for AnchorID recurring ops.
#
#   scripts/cron-run.sh pages:check    # daily: prod KV page:* vs src/content/
#   scripts/cron-run.sh backup         # weekly: full prod KV dump to backup/
#   scripts/cron-run.sh test-alert     # send a test failure email and exit
#
# Exists because a bare `npm run …` line in a crontab fails here three ways:
#   - cron's PATH has no node/npm (nvm install) → PATH is fixed up below
#   - /var/log isn't writable by this user     → logs go to <repo>/logs/
#   - the box has no MTA, so `mail -s` is a no-op → failure alerts go through
#     the mycal-style mailer (same API the Worker uses; docs/mycal-style-mailer-spec.md)
#
# Credentials, both gitignored, both sourced if present:
#   .key       exports CLOUDFLARE_API_TOKEN (wrangler → prod KV)
#   .env.cron  exports MAIL_SEND_SECRET and MYCAL_MAIL_ENDPOINT (failure alerts)
set -uo pipefail

TASK="${1:?usage: cron-run.sh <pages:check|backup|test-alert>}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOGDIR="$REPO/logs"
LOG="$LOGDIR/${TASK//:/-}.log"
MAILTO="mike@mycal.net"

mkdir -p "$LOGDIR"
cd "$REPO"

# cron's PATH is /usr/bin:/bin — node lives under ~/.nvm; pick the newest install
NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"

[ -f .key ] && . ./.key
[ -f .env.cron ] && . ./.env.cron

alert() {
  local subject="$1"
  if [ -z "${MAIL_SEND_SECRET:-}" ] || [ -z "${MYCAL_MAIL_ENDPOINT:-}" ]; then
    echo "ALERT NOT SENT (no MAIL_SEND_SECRET/MYCAL_MAIL_ENDPOINT in .env.cron): $subject" >> "$LOG"
    return 1
  fi
  # node instead of curl: JSON-encodes the log tail safely, and node is
  # guaranteed on PATH by this point while curl/jq may not be
  node -e '
    const fs = require("fs");
    const [endpoint, secret, to, subject, logfile] = process.argv.slice(1);
    let body = "";
    try { body = fs.readFileSync(logfile, "utf8").split("\n").slice(-30).join("\n"); } catch {}
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Mail-Secret": secret },
      body: JSON.stringify({ to, subject, body: subject + "\n\nLast log lines:\n" + body }),
    }).then(async r => {
      if (!r.ok) { console.error("mailer HTTP " + r.status + ": " + (await r.text()).slice(0, 200)); process.exit(1); }
      console.log("alert sent: " + subject);
    }).catch(e => { console.error("mailer unreachable: " + e.message); process.exit(1); });
  ' "$MYCAL_MAIL_ENDPOINT" "$MAIL_SEND_SECRET" "$MAILTO" "$subject" "$LOG" >> "$LOG" 2>&1 \
    || { echo "ALERT DELIVERY FAILED: $subject" >> "$LOG"; return 1; }
}

if [ "$TASK" = "test-alert" ]; then
  echo "=== $(date -u +%FT%TZ) test-alert ===" >> "$LOG"
  alert "anchorid cron: test alert — if you can read this, failure emails work"
  exit $?
fi

{
  echo "=== $(date -u +%FT%TZ) $TASK start ==="
  npm run --silent "$TASK"
} >> "$LOG" 2>&1
rc=$?
echo "=== $(date -u +%FT%TZ) $TASK exit=$rc ===" >> "$LOG"

[ "$rc" -ne 0 ] && alert "anchorid $TASK FAILED (exit $rc)"

# keep each log under ~1 MB (trim to the newest 256 KB)
if [ "$(wc -c < "$LOG")" -gt 1048576 ]; then
  tail -c 262144 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

exit "$rc"
