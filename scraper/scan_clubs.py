#!/usr/bin/env python3
"""
Refresh known pickleball clubs from the database against the Reclub API.

Reads all existing club reclub_ids from Postgres, re-fetches each one from
the API to get the latest name, member count, and admin list, then upserts
the updated info back into the database.

This is meant to run infrequently (e.g. Mon/Wed) since clubs don't change
much. New club *discovery* happens via the daily ingest when clubs appear
in community/sport features or event data.

Usage:
    DATABASE_URL=... python3 scraper/scan_clubs.py [--workers 15]
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

WORKERS = 15
PLAYER_BATCH_SIZE = 50

for i, arg in enumerate(sys.argv[1:], 1):
    if arg == "--workers" and i < len(sys.argv) - 1:
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


def fetch_club_info(gid):
    """Fetch latest club info + member count from the API."""
    data = api_get(f"/groups/{gid}", {"scopes": "COUNTS"})
    if not data:
        return None
    counts = data.get("counts") or {}
    return {
        "reclub_id": gid,
        "name": (data.get("name") or "")[:255],
        "slug": (data.get("slug") or "")[:255],
        "sport_id": data.get("sportId"),
        "community_id": data.get("communityId"),
        "num_members": (counts.get("members", 0) or 0) if isinstance(counts, dict) else 0,
    }


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
    print("  RECLUB CLUB REFRESHER")
    print(f"  Workers: {WORKERS}")
    print("=" * 65)

    # Phase 1: load known club IDs from database
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT reclub_id FROM clubs")
    known_ids = [row[0] for row in cur.fetchall()]
    cur.close()
    conn.close()

    print(f"\n  {len(known_ids)} clubs in database — refreshing from API...")

    if not known_ids:
        print("  No clubs in DB. Run ingest first to discover clubs.")
        return

    # Phase 2: re-fetch each club's info from the API
    refreshed = []
    errors = 0
    done = 0
    start = time.time()

    def fetch_one(gid):
        return fetch_club_info(gid)

    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch_one, gid): gid for gid in known_ids}
        for f in concurrent.futures.as_completed(futs):
            done += 1
            result = f.result()
            if result:
                refreshed.append(result)
            else:
                errors += 1
            if done % 100 == 0 or done == len(known_ids):
                print(f"    {done}/{len(known_ids)} fetched | {len(refreshed)} ok | {errors} errors")

    elapsed = time.time() - start
    print(f"\n  Fetched {len(refreshed)} clubs in {elapsed:.0f}s ({errors} unreachable)")

    if not refreshed:
        print("  Nothing to update.")
        return

    # Phase 3: fetch admins for each club
    print(f"\n  Fetching admins for {len(refreshed)} clubs...")
    club_admin_ids = {}
    all_admin_ids = set()
    admin_done = 0

    def get_admins(club):
        return club["reclub_id"], fetch_club_admins(club["reclub_id"])

    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(get_admins, c): c for c in refreshed}
        for f in concurrent.futures.as_completed(futs):
            admin_done += 1
            rid, admin_ids = f.result()
            club_admin_ids[rid] = admin_ids
            all_admin_ids.update(admin_ids)
            if admin_done % 100 == 0 or admin_done == len(refreshed):
                print(f"    {admin_done}/{len(refreshed)} clubs | {len(all_admin_ids)} unique admins")

    print(f"\n  Resolving {len(all_admin_ids)} admin names...")
    admin_names = fetch_player_names(list(all_admin_ids))
    print(f"    Resolved {len(admin_names)} names")

    # Phase 4: upsert into DB
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    cur.execute("""
        ALTER TABLE clubs ADD COLUMN IF NOT EXISTS zalo_url TEXT;
        ALTER TABLE clubs ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE clubs ADD COLUMN IF NOT EXISTS admins TEXT[] DEFAULT '{}';
    """)
    conn.commit()

    updated = 0
    for c in refreshed:
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
                slug = EXCLUDED.slug,
                num_members = EXCLUDED.num_members,
                admins = EXCLUDED.admins,
                updated_at = NOW()
            RETURNING id
        """, {**c, "admins": admin_name_list})
        if cur.fetchone():
            updated += 1

    conn.commit()
    cur.close()
    conn.close()
    print(f"\n  Updated {updated} clubs in database.")


if __name__ == "__main__":
    main()
