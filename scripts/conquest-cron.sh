#!/bin/sh
# Conquest session auto-close cron script.
# Called every minute by Railway cron service.
# Requires: MOBILE_API_URL, CRON_SECRET env vars.
set -e

if [ -z "$MOBILE_API_URL" ]; then
  echo "[conquest-cron] ERROR: MOBILE_API_URL not set" >&2
  exit 1
fi

if [ -z "$CRON_SECRET" ]; then
  echo "[conquest-cron] ERROR: CRON_SECRET not set" >&2
  exit 1
fi

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X GET "${MOBILE_API_URL}/api/cron/conquest-session-close" \
  -H "x-cron-secret: ${CRON_SECRET}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "[conquest-cron] status=$HTTP_CODE body=$BODY"

if [ "$HTTP_CODE" != "200" ]; then
  echo "[conquest-cron] FAILED with HTTP $HTTP_CODE" >&2
  exit 1
fi
