#!/bin/sh
set -e

# Day of week: 1=Monday, 2=Tuesday, ... 7=Sunday (Vietnam time, UTC+7)
DOW=$(TZ="Asia/Ho_Chi_Minh" date +%u)

echo "=== Pickleball Hub Cron — Day of week: $DOW ==="

# Club refresh: Monday (1) and Wednesday (3) only
if [ "$DOW" = "1" ] || [ "$DOW" = "3" ]; then
    echo ""
    echo "=== STEP 1/2: Refreshing club info (Mon/Wed) ==="
    python scan_clubs.py --workers 15 || echo "  scan_clubs encountered an error, continuing with ingest..."
    echo ""
else
    echo "=== STEP 1/2: Skipping club refresh (only runs Mon & Wed) ==="
fi

echo ""
echo "=== STEP 2/2: Ingest today + tomorrow events ==="
python ingest.py
