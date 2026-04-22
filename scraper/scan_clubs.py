#!/usr/bin/env python3
"""
One-time (or periodic) scan of numeric group IDs on Reclub to discover
all HCM pickleball clubs. Discovered clubs are inserted into the local
Postgres `clubs` table so that ingest.py picks them up on future runs.

Usage:
    DATABASE_URL=... python3 scraper/scan_clubs.py [--max-id 400000] [--workers 40]
"""

import os
import sys
import json
import urllib.request
import concurrent.futures
import time

try:
    import psycopg2
except ImportError:
    print("ERROR: psycopg2 not installed.  pip install psycopg2-binary")
    sys.exit(1)

API_BASE = "https://api.reclub.co"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "x-output-casing": "camelCase",
}
COMMUNITY_ID = 1
PICKLEBALL_SPORT_ID = 36
DATABASE_URL = os.environ.get("DATABASE_URL", "")

MAX_ID = 400_000
WORKERS = 40

for i, arg in enumerate(sys.argv[1:], 1):
    if arg == "--max-id" and i < len(sys.argv) - 1:
        MAX_ID = int(sys.argv[i + 1])
    elif arg == "--workers" and i < len(sys.argv) - 1:
        WORKERS = int(sys.argv[i + 1])


def check_group(gid):
    url = f"{API_BASE}/groups/{gid}?scopes=COUNTS"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read().decode("utf-8"))
        cid = data.get("communityId")
        sid = data.get("sportId")
        counts = data.get("counts") or {}
        total = counts.get("totalActivities", 0) if isinstance(counts, dict) else 0
        if cid == COMMUNITY_ID and sid == PICKLEBALL_SPORT_ID and total > 0:
            return {
                "reclub_id": gid,
                "name": (data.get("name") or "")[:255],
                "slug": (data.get("slug") or "")[:255],
                "sport_id": sid,
                "community_id": cid,
                "num_members": data.get("numMembers", 0) or 0,
            }
    except Exception:
        pass
    return None


def main():
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    print("=" * 65)
    print("  RECLUB GROUP ID SCANNER")
    print(f"  Range: 1 – {MAX_ID:,}   Workers: {WORKERS}")
    print("=" * 65)

    found = []
    start = time.time()
    done = 0
    batch_size = 5000

    for batch_start in range(1, MAX_ID + 1, batch_size):
        batch_end = min(batch_start + batch_size, MAX_ID + 1)
        with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(check_group, gid): gid for gid in range(batch_start, batch_end)}
            for f in concurrent.futures.as_completed(futs):
                done += 1
                result = f.result()
                if result:
                    found.append(result)

        elapsed = time.time() - start
        rate = done / elapsed if elapsed > 0 else 0
        eta = (MAX_ID - done) / rate if rate > 0 else 0
        print(f"  [{done:>7,}/{MAX_ID:,}]  found {len(found)} clubs  "
              f"({rate:.0f} req/s  ETA {eta / 60:.1f}min)")

    elapsed = time.time() - start
    print(f"\nScan complete: {len(found)} HCM pickleball clubs in {elapsed:.0f}s")

    if not found:
        print("Nothing to insert.")
        return

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    inserted = 0
    for c in found:
        cur.execute(
            "SELECT id FROM clubs WHERE slug = %s AND reclub_id != %s",
            (c["slug"], c["reclub_id"]),
        )
        if cur.fetchone():
            c["slug"] = f"{c['slug']}-{c['reclub_id']}"

        cur.execute("""
            INSERT INTO clubs (reclub_id, name, slug, sport_id, community_id, num_members, updated_at)
            VALUES (%(reclub_id)s, %(name)s, %(slug)s, %(sport_id)s, %(community_id)s, %(num_members)s, NOW())
            ON CONFLICT (reclub_id) DO UPDATE SET
                name = EXCLUDED.name,
                num_members = EXCLUDED.num_members,
                updated_at = NOW()
            RETURNING id
        """, c)
        if cur.fetchone():
            inserted += 1

    conn.commit()
    cur.close()
    conn.close()
    print(f"Upserted {inserted} clubs into database.")


if __name__ == "__main__":
    main()
