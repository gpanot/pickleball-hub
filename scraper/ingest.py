#!/usr/bin/env python3
"""
Ingest: scrape Reclub HCM pickleball sessions and upsert into PostgreSQL.

Reuses API logic from scrape_events.py, adds:
  - Skill level parsing from session names
  - Perks parsing from session names
  - Fee string → integer parsing
  - Venue deduplication by geocoordinate proximity
  - PostgreSQL upserts via psycopg2
  - Club daily stats aggregation
"""

import os
import re
import sys
import json
import urllib.request
import time
import math
import concurrent.futures
from datetime import datetime, timezone, timedelta

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

# ─── Configuration ────────────────────────────────────────────────────

API_BASE = "https://api.reclub.co"
COMMUNITY_ID = 1
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "x-output-casing": "camelCase",
}

VN_TZ = timezone(timedelta(hours=7))
NOW = datetime.now(VN_TZ)

# Accept optional --date YYYY-MM-DD argument to scrape a specific day
_target_date = None
for i, arg in enumerate(sys.argv[1:], 1):
    if arg == "--date" and i < len(sys.argv) - 1:
        _target_date = sys.argv[i + 1]
    elif arg.startswith("--date="):
        _target_date = arg.split("=", 1)[1]

if _target_date:
    _target_day = datetime.strptime(_target_date, "%Y-%m-%d").replace(tzinfo=VN_TZ)
else:
    _target_day = NOW

TODAY_STR = _target_day.strftime("%Y-%m-%d")
START_OF_DAY = _target_day.replace(hour=0, minute=0, second=0, microsecond=0)
END_OF_DAY = _target_day.replace(hour=23, minute=59, second=59, microsecond=0)
START_TS = int(START_OF_DAY.timestamp())
END_TS = int(END_OF_DAY.timestamp())

PICKLEBALL_SPORT_ID = 36
SPORT_IDS_TO_SCAN = [1, 4, 5, 10, 11, 20, 24, 30, 33, 36, 37, 40, 42, 55, 62]

DATABASE_URL = os.environ.get("DATABASE_URL", "")

# ─── Parsers ──────────────────────────────────────────────────────────

def parse_fee(fee_amount, fee_currency="VND"):
    if not fee_amount:
        return 0
    if isinstance(fee_amount, str):
        cleaned = re.sub(r"[^\d]", "", fee_amount)
        return int(cleaned) if cleaned else 0
    return int(fee_amount)


def parse_skill_level(name):
    range_match = re.search(r"(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\+?", name)
    if range_match:
        return float(range_match.group(1)), float(range_match.group(2))

    single_match = re.search(r"(\d+\.?\d*)\+", name)
    if single_match:
        val = float(single_match.group(1))
        if 1.0 <= val <= 6.0:
            return val, None

    if re.search(r"newbie", name, re.IGNORECASE):
        return 1.0, 2.5
    if re.search(r"all\s*level", name, re.IGNORECASE):
        return 1.0, None

    return None, None


def parse_perks(name):
    perks = set()
    if re.search(r"free\s*(chuối|banana)|tặng.*chuối", name, re.IGNORECASE):
        perks.add("banana")
    if re.search(r"free\s*(trứng|egg)|tặng.*trứng", name, re.IGNORECASE):
        perks.add("egg")
    if re.search(r"free\s*(nước|drink|water)|tặng.*nước", name, re.IGNORECASE):
        perks.add("drink")
    if re.search(r"free\s*(cafe|coffee|cà phê)", name, re.IGNORECASE):
        perks.add("coffee")
    if re.search(r"free\s*(trái cây|fruit)", name, re.IGNORECASE):
        perks.add("fruit")
    if re.search(r"free\s*(sữa|milk)", name, re.IGNORECASE):
        perks.add("milk")
    if re.search(r"free\s*(bánh)", name, re.IGNORECASE):
        perks.add("snack")
    if re.search(r"drill|clinic", name, re.IGNORECASE):
        perks.add("coaching")
    if re.search(r"round\s*robin|dupr", name, re.IGNORECASE):
        perks.add("tournament")
    return list(perks)


def fmt_time(ts):
    if not ts:
        return ""
    return datetime.fromtimestamp(ts, VN_TZ).strftime("%H:%M")


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ─── Reclub API ───────────────────────────────────────────────────────

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


def get_all_club_ids():
    club_map = {}

    print("  [a] Community features...")
    data = api_get(f"/communities/{COMMUNITY_ID}/features")
    if data:
        for c in data.get("topClubs", []):
            club_map[c["id"]] = {
                "id": c["id"],
                "name": c.get("name", ""),
                "slug": c.get("slug", ""),
                "communityId": c.get("communityId", COMMUNITY_ID),
                "sportId": c.get("sportId"),
                "numMembers": c.get("numMembers", 0),
            }
    print(f"      {len(club_map)} clubs")

    print("  [b] Sport features (global)...")
    for sid in SPORT_IDS_TO_SCAN:
        sdata = api_get(f"/sports/{sid}/features")
        if sdata:
            for c in sdata.get("topClubs", []):
                cid = c.get("id")
                if cid and cid not in club_map:
                    club_map[cid] = {
                        "id": cid,
                        "name": c.get("name", ""),
                        "slug": c.get("slug", ""),
                        "communityId": c.get("communityId"),
                        "sportId": c.get("sportId"),
                        "numMembers": c.get("numMembers", 0),
                    }
        time.sleep(0.05)

    print(f"      {len(club_map)} total clubs")
    return club_map


def fetch_club_activities(club_id):
    data = api_get(f"/groups/{club_id}/activities", {
        "types": "MEETS",
        "min_start_datetime": str(START_TS),
        "max_start_datetime": str(END_TS),
        "limit": "100",
        "sort_dir": "1",
    })
    if not data:
        return []
    meets = data if isinstance(data, list) else data.get("meets", data.get("activities", []))
    if not isinstance(meets, list):
        return []
    return [m for m in meets if isinstance(m, dict) and m.get("communityId") == COMMUNITY_ID]


def fetch_all_events(club_map):
    all_meets = {}
    club_ids = list(club_map.keys())
    total = len(club_ids)
    done = 0

    def process_club(club_id):
        return club_id, fetch_club_activities(club_id)

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(process_club, cid): cid for cid in club_ids}
        for future in concurrent.futures.as_completed(futures):
            done += 1
            club_id, meets = future.result()
            if meets:
                club_info = club_map.get(club_id, {})
                for m in meets:
                    ref_code = m.get("referenceCode")
                    if ref_code and ref_code not in all_meets:
                        m["_clubId"] = club_id
                        m["_clubName"] = club_info.get("name", "")
                        m["_clubSlug"] = club_info.get("slug", "")
                        m["_sportId"] = club_info.get("sportId")
                        m["_numMembers"] = club_info.get("numMembers", 0)
                        all_meets[ref_code] = m
            if done % 50 == 0 or done == total:
                print(f"    {done}/{total} clubs | {len(all_meets)} events")

    return all_meets


# ─── Database Upserts ─────────────────────────────────────────────────

def upsert_clubs(cur, meets):
    """Upsert clubs from scraped meets. Returns reclub_id -> db_id map."""
    clubs = {}
    for m in meets.values():
        rid = m["_clubId"]
        if rid not in clubs:
            clubs[rid] = {
                "reclub_id": rid,
                "name": m["_clubName"],
                "slug": m["_clubSlug"],
                "sport_id": m.get("_sportId"),
                "community_id": m.get("communityId", COMMUNITY_ID),
                "num_members": m.get("_numMembers", 0),
            }

    id_map = {}
    for c in clubs.values():
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
                slug = EXCLUDED.slug,
                num_members = EXCLUDED.num_members,
                updated_at = NOW()
            RETURNING id, reclub_id
        """, c)
        row = cur.fetchone()
        id_map[row[1]] = row[0]

    print(f"    Upserted {len(id_map)} clubs")
    return id_map


def upsert_venues(cur, meets):
    """Deduplicate venues by proximity (<50m = same venue). Returns (lat,lng) -> db_id map."""
    raw_venues = {}
    for m in meets.values():
        loc = m.get("location") or {}
        lat = loc.get("latitude")
        lng = loc.get("longitude")
        if lat and lng:
            key = (round(lat, 6), round(lng, 6))
            if key not in raw_venues:
                raw_venues[key] = {
                    "name": loc.get("name") or "",
                    "address": loc.get("address") or "",
                    "latitude": lat,
                    "longitude": lng,
                }

    # Cluster venues within 50m
    venue_list = list(raw_venues.values())
    clusters = []
    used = set()
    for i, v in enumerate(venue_list):
        if i in used:
            continue
        cluster = [v]
        used.add(i)
        for j in range(i + 1, len(venue_list)):
            if j in used:
                continue
            if haversine_m(v["latitude"], v["longitude"],
                           venue_list[j]["latitude"], venue_list[j]["longitude"]) < 50:
                cluster.append(venue_list[j])
                used.add(j)
        canonical = max(cluster, key=lambda x: len(x["name"] or ""))
        clusters.append(canonical)

    coord_to_id = {}
    for v in clusters:
        cur.execute("""
            INSERT INTO venues (name, address, latitude, longitude, updated_at)
            VALUES (%(name)s, %(address)s, %(latitude)s, %(longitude)s, NOW())
            ON CONFLICT ON CONSTRAINT venues_pkey DO NOTHING
            RETURNING id
        """, v)
        row = cur.fetchone()
        if not row:
            cur.execute(
                "SELECT id FROM venues WHERE ABS(latitude - %s) < 0.0005 AND ABS(longitude - %s) < 0.0005 LIMIT 1",
                (v["latitude"], v["longitude"])
            )
            row = cur.fetchone()
        if row:
            coord_to_id[(round(v["latitude"], 4), round(v["longitude"], 4))] = row[0]

    print(f"    Upserted {len(coord_to_id)} venues")
    return coord_to_id


def find_venue_id(coord_map, lat, lng):
    if not lat or not lng:
        return None
    key = (round(lat, 4), round(lng, 4))
    if key in coord_map:
        return coord_map[key]
    for (vlat, vlng), vid in coord_map.items():
        if haversine_m(lat, lng, vlat, vlng) < 100:
            return vid
    return None


def upsert_sessions_and_snapshots(cur, meets, club_id_map, venue_coord_map):
    """Upsert sessions and create daily snapshots."""
    session_count = 0
    snapshot_count = 0

    for ref_code, m in meets.items():
        loc = m.get("location") or {}
        psc = m.get("participantsStatusCount") or {}
        joined = psc.get("joined", 0)
        waitlisted = psc.get("waitlisted", 0)

        name = (m.get("name") or "").replace("\n", " ").strip()[:300]
        fee_amount = parse_fee(m.get("feeAmount"))
        duration_min = (m.get("duration") or 0) // 60
        cost_per_hour = round(fee_amount / (duration_min / 60)) if duration_min > 0 and fee_amount > 0 else 0

        skill_min, skill_max = parse_skill_level(name)
        perks = parse_perks(name)

        club_db_id = club_id_map.get(m["_clubId"])
        if not club_db_id:
            continue

        venue_id = find_venue_id(
            venue_coord_map,
            loc.get("latitude"),
            loc.get("longitude"),
        )

        status_map = {1: "active", 2: "cancelled", 3: "ended"}
        status_val = status_map.get(m.get("status"), str(m.get("status", "active")))
        privacy_map = {1: "public", 2: "private"}
        privacy_val = privacy_map.get(m.get("privacy"), "public")

        cur.execute("""
            INSERT INTO sessions (
                reference_code, name, club_id, venue_id,
                start_time, end_time, duration_min, max_players,
                fee_amount, fee_currency, cost_per_hour,
                privacy, status, skill_level_min, skill_level_max,
                perks, event_url, scraped_date
            ) VALUES (
                %(ref)s, %(name)s, %(club_id)s, %(venue_id)s,
                %(start)s, %(end)s, %(dur)s, %(max)s,
                %(fee)s, %(cur)s, %(cph)s,
                %(priv)s, %(stat)s, %(smin)s, %(smax)s,
                %(perks)s, %(url)s, %(date)s
            )
            ON CONFLICT (reference_code, scraped_date) DO UPDATE SET
                name = EXCLUDED.name,
                max_players = EXCLUDED.max_players,
                fee_amount = EXCLUDED.fee_amount,
                cost_per_hour = EXCLUDED.cost_per_hour,
                status = EXCLUDED.status,
                skill_level_min = EXCLUDED.skill_level_min,
                skill_level_max = EXCLUDED.skill_level_max,
                perks = EXCLUDED.perks
            RETURNING id
        """, {
            "ref": ref_code,
            "name": name,
            "club_id": club_db_id,
            "venue_id": venue_id,
            "start": fmt_time(m.get("startDatetime")),
            "end": fmt_time(m.get("endDatetime")),
            "dur": duration_min,
            "max": m.get("numPlayers", 0),
            "fee": fee_amount,
            "cur": m.get("feeCurrency", "VND") or "VND",
            "cph": cost_per_hour,
            "priv": privacy_val,
            "stat": status_val,
            "smin": skill_min,
            "smax": skill_max,
            "perks": perks,
            "url": f"https://reclub.co/m/{ref_code}",
            "date": TODAY_STR,
        })

        session_row = cur.fetchone()
        session_id = session_row[0]
        session_count += 1

        cur.execute("""
            INSERT INTO daily_snapshots (session_id, scraped_at, joined, waitlisted)
            VALUES (%s, NOW(), %s, %s)
        """, (session_id, joined, waitlisted))
        snapshot_count += 1

    print(f"    Upserted {session_count} sessions, {snapshot_count} snapshots")


def compute_club_daily_stats(cur):
    """Aggregate today's session data into club_daily_stats."""
    cur.execute("""
        INSERT INTO club_daily_stats (club_id, date, total_sessions, total_capacity, total_joined, avg_fill_rate, avg_fee, revenue_estimate)
        SELECT
            s.club_id,
            s.scraped_date AS date,
            COUNT(*) AS total_sessions,
            SUM(s.max_players) AS total_capacity,
            COALESCE(SUM(ds.joined), 0) AS total_joined,
            CASE WHEN SUM(s.max_players) > 0
                 THEN ROUND(CAST(COALESCE(SUM(ds.joined), 0) AS numeric) / SUM(s.max_players), 3)
                 ELSE 0 END AS avg_fill_rate,
            ROUND(AVG(s.fee_amount)) AS avg_fee,
            COALESCE(SUM(ds.joined * s.fee_amount), 0) AS revenue_estimate
        FROM sessions s
        LEFT JOIN LATERAL (
            SELECT joined, waitlisted FROM daily_snapshots
            WHERE session_id = s.id ORDER BY scraped_at DESC LIMIT 1
        ) ds ON true
        WHERE s.scraped_date = %s
        GROUP BY s.club_id, s.scraped_date
        ON CONFLICT (club_id, date) DO UPDATE SET
            total_sessions = EXCLUDED.total_sessions,
            total_capacity = EXCLUDED.total_capacity,
            total_joined = EXCLUDED.total_joined,
            avg_fill_rate = EXCLUDED.avg_fill_rate,
            avg_fee = EXCLUDED.avg_fee,
            revenue_estimate = EXCLUDED.revenue_estimate
    """, (TODAY_STR,))

    print(f"    Computed club daily stats for {TODAY_STR}")


# ─── Main ─────────────────────────────────────────────────────────────

def main():
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL environment variable not set.")
        print("  Export it or add to .env: DATABASE_URL=postgresql://user:pass@host:port/db")
        sys.exit(1)

    print("=" * 65)
    print("  PICKLEBALL HUB INGEST")
    print(f"  Target: {_target_day.strftime('%A, %B %d, %Y')} (Vietnam time)")
    print("=" * 65)

    # Step 1: Scrape
    print("\n[1/6] Gathering club IDs from API...")
    club_map = get_all_club_ids()

    # Also load clubs already known in the DB (from previous runs)
    print("\n[2/6] Loading known clubs from database...")
    conn_pre = psycopg2.connect(DATABASE_URL)
    cur_pre = conn_pre.cursor()
    cur_pre.execute("SELECT reclub_id, name, slug, sport_id, community_id, num_members FROM clubs")
    db_clubs = cur_pre.fetchall()
    cur_pre.close()
    conn_pre.close()
    added = 0
    for row in db_clubs:
        rid = row[0]
        if rid not in club_map:
            club_map[rid] = {
                "id": rid,
                "name": row[1] or "",
                "slug": row[2] or "",
                "communityId": row[4],
                "sportId": row[3],
                "numMembers": row[5] or 0,
            }
            added += 1
    print(f"    Added {added} clubs from DB ({len(club_map)} total)")

    print(f"\n[3/6] Fetching events from {len(club_map)} clubs...")
    all_meets = fetch_all_events(club_map)

    # Filter to pickleball only (sport_id=36) if we have the data
    pickleball_meets = {}
    other_meets = {}
    for ref, m in all_meets.items():
        if m.get("sportId") == PICKLEBALL_SPORT_ID or m.get("_sportId") == PICKLEBALL_SPORT_ID:
            pickleball_meets[ref] = m
        else:
            other_meets[ref] = m

    # Include meets whose sport we can't determine (they might be pickleball)
    for ref, m in other_meets.items():
        if not m.get("sportId") and not m.get("_sportId"):
            pickleball_meets[ref] = m

    print(f"    Pickleball sessions: {len(pickleball_meets)} / {len(all_meets)} total")

    if not pickleball_meets:
        print("  No pickleball events found!")
        return

    print(f"\n[4/6] Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        print("\n[5/6] Upserting data...")
        club_id_map = upsert_clubs(cur, pickleball_meets)
        venue_coord_map = upsert_venues(cur, pickleball_meets)
        upsert_sessions_and_snapshots(cur, pickleball_meets, club_id_map, venue_coord_map)

        print("\n[6/6] Computing aggregates...")
        compute_club_daily_stats(cur)

        conn.commit()
        print(f"\n  SUCCESS: Ingested {len(pickleball_meets)} sessions for {TODAY_STR}")

    except Exception as e:
        conn.rollback()
        print(f"\n  ERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()

    print("=" * 65)


if __name__ == "__main__":
    main()
