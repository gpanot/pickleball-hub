#!/bin/sh
# Conquest + chest cron — runs every minute via Railway cron service
# Env vars required: MOBILE_API_URL, CRON_SECRET

BASE="${MOBILE_API_URL}"
SECRET="${CRON_SECRET}"

echo "[cron] $(date -u +%H:%M:%S) — firing endpoints"

# 1. Close expired conquest sessions + award INF
curl -sf -X GET "${BASE}/api/cron/conquest-session-close?secret=${SECRET}" \
  -H "x-cron-secret: ${SECRET}" \
  -o /tmp/session_close.json && echo "[cron] session-close: $(cat /tmp/session_close.json)" || echo "[cron] session-close FAILED"

# 2. Unlock ready chests + send PNS
curl -sf -X GET "${BASE}/api/cron/chest-unlock-notifications?secret=${SECRET}" \
  -H "x-cron-secret: ${SECRET}" \
  -o /tmp/chest_unlock.json && echo "[cron] chest-unlock: $(cat /tmp/chest_unlock.json)" || echo "[cron] chest-unlock FAILED"

# 3. Expire stale chest openings
curl -sf -X GET "${BASE}/api/cron/chest-expire?secret=${SECRET}" \
  -H "x-cron-secret: ${SECRET}" \
  -o /tmp/chest_expire.json && echo "[cron] chest-expire: $(cat /tmp/chest_expire.json)" || echo "[cron] chest-expire FAILED"

# 4. Send battle result PNS when revealAt has passed
curl -sf -X GET "${BASE}/api/cron/battle-reveal-notifications?secret=${SECRET}" \
  -H "x-cron-secret: ${SECRET}" \
  -o /tmp/battle_reveal.json && echo "[cron] battle-reveal: $(cat /tmp/battle_reveal.json)" || echo "[cron] battle-reveal FAILED"
