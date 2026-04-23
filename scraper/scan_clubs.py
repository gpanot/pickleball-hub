#!/usr/bin/env python3
"""
Scan numeric group IDs on Reclub to discover all HCM pickleball clubs.
Discovered clubs (with admin names, member counts) are upserted into Postgres.

Two-phase approach for speed:
  Phase 1: Fast scan with COUNTS scope to find HCM pickleball clubs.
  Phase 2: For discovered clubs, fetch USERS+ADMINS to get admin userIds,
           then batch-fetch admin names via /players/userIds.

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
PLAYER_BATCH_SIZE = 50

for i, arg in enumerate(sys.argv[1:], 1):
    if arg == "--max-id" and i < len(sys.argv) - 1:
        MAX_ID = int(sys.argv[i + 1])
    elif arg == "--workers" and i < len(sys.argv) - 1:
        WORKERS = int(sys.argv[i + 1])


def api_get(path, params=None):
    url = f"{API_BASE}{path}"
    if params:
        query = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        url = f"{url}?{query}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


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
                "num_members": counts.get("members", 0) or 0,
            }
    except Exception:
        pass
    return None


def fetch_club_admins(gid):
    """Fetch admin userIds for a single club."""
    data = api_get(f"/groups/{gid}", {"scopes": "USERS,ADMINS"})
    if not data:
        return []
    users = data.get("users") or []
    return [u["userId"] for u in users if u.get("status") == 1]


def fetch_player_names(user_ids):
    """Batch-fetch player names. Returns {userId: name}."""
    names = {}
    if not user_ids:
        return names
    batches = [user_ids[i:i + PLAYER_BATCH_SIZE]
               for i in range(0, len(user_ids), PLAYER_BATCH_SIZE)]
    for batch in batches:
        ids_str = ",".join(str(uid) for uid in batch)
        data = api_get("/players/userIds", {
            "userIds": ids_str,
            "scopes": "BASIC_PROFILE",
        })
        if data:
            for p in data.get("players", []):
                uid = p.get("userId")
                names[uid] = p.get("name") or p.get("username") or f"User-{uid}"
        time.sleep(0.2)
    return names


def main():
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    print("=" * 65)
    print("  RECLUB GROUP ID SCANNER")
    print(f"  Range: 1 – {MAX_ID:,}   Workers: {WORKERS}")
    print("=" * 65)

    # Phase 1: fast scan
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
    print(f"\nPhase 1 complete: {len(found)} HCM pickleball clubs in {elapsed:.0f}s")

    if not found:
        print("Nothing to insert.")
        return

    # Phase 2: fetch admins for each club
    print(f"\nPhase 2: Fetching admins for {len(found)} clubs...")
    club_admin_ids = {}
    all_admin_ids = set()
    admin_done = 0

    def get_admins(club):
        return club["reclub_id"], fetch_club_admins(club["reclub_id"])

    with concurrent.futures.ThreadPoolExecutor(max_workers=15) as ex:
        futs = {ex.submit(get_admins, c): c for c in found}
        for f in concurrent.futures.as_completed(futs):
            admin_done += 1
            rid, admin_ids = f.result()
            club_admin_ids[rid] = admin_ids
            all_admin_ids.update(admin_ids)
            if admin_done % 100 == 0 or admin_done == len(found):
                print(f"    {admin_done}/{len(found)} clubs | {len(all_admin_ids)} unique admins")

    print(f"\nPhase 2b: Resolving {len(all_admin_ids)} admin names...")
    admin_names = fetch_player_names(list(all_admin_ids))
    print(f"    Resolved {len(admin_names)} names")

    # Phase 3: upsert into DB
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    cur.execute("""
        ALTER TABLE clubs ADD COLUMN IF NOT EXISTS zalo_url TEXT;
        ALTER TABLE clubs ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE clubs ADD COLUMN IF NOT EXISTS admins TEXT[] DEFAULT '{}';
    """)
    conn.commit()

    inserted = 0
    for c in found:
        cur.execute(
            "SELECT id FROM clubs WHERE slug = %s AND reclub_id != %s",
            (c["slug"], c["reclub_id"]),
        )
        if cur.fetchone():
            c["slug"] = f"{c['slug']}-{c['reclub_id']}"

        admin_ids = club_admin_ids.get(c["reclub_id"], [])
        admin_name_list = [admin_names.get(uid, f"User-{uid}") for uid in admin_ids]

        cur.execute("""
            INSERT INTO clubs (reclub_id, name, slug, sport_id, community_id, num_members, admins, updated_at)
            VALUES (%(reclub_id)s, %(name)s, %(slug)s, %(sport_id)s, %(community_id)s, %(num_members)s, %(admins)s, NOW())
            ON CONFLICT (reclub_id) DO UPDATE SET
                name = EXCLUDED.name,
                num_members = EXCLUDED.num_members,
                admins = EXCLUDED.admins,
                updated_at = NOW()
            RETURNING id
        """, {**c, "admins": admin_name_list})
        if cur.fetchone():
            inserted += 1

    conn.commit()
    cur.close()
    conn.close()
    print(f"Upserted {inserted} clubs into database.")


if __name__ == "__main__":
    main()
