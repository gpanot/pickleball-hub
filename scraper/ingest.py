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

from roster_scraper import run_roster_pass_for_day

# ─── Configuration ────────────────────────────────────────────────────

API_BASE = "https://api.reclub.co"
COMMUNITY_ID = 1
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "x-output-casing": "camelCase",
}

VN_TZ = timezone(timedelta(hours=7))
NOW = datetime.now(VN_TZ)

# Accept optional --date YYYY-MM-DD argument(s) to scrape specific days.
# Multiple --date flags are supported. Without any, defaults to today + tomorrow.
_explicit_dates = []
for i, arg in enumerate(sys.argv[1:], 1):
    if arg == "--date" and i < len(sys.argv) - 1:
        _explicit_dates.append(sys.argv[i + 1])
    elif arg.startswith("--date="):
        _explicit_dates.append(arg.split("=", 1)[1])

if _explicit_dates:
    TARGET_DAYS = [
        datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=VN_TZ) for d in _explicit_dates
    ]
else:
    TARGET_DAYS = [NOW, NOW + timedelta(days=1)]

# Legacy globals kept for the per-day loop (set before each pass)
TODAY_STR = None
START_OF_DAY = None
END_OF_DAY = None
START_TS = None
END_TS = None


def set_target_day(day):
    """Configure the global date variables for a scrape pass."""
    global TODAY_STR, START_OF_DAY, END_OF_DAY, START_TS, END_TS
    TODAY_STR = day.strftime("%Y-%m-%d")
    START_OF_DAY = day.replace(hour=0, minute=0, second=0, microsecond=0)
    END_OF_DAY = day.replace(hour=23, minute=59, second=59, microsecond=0)
    START_TS = int(START_OF_DAY.timestamp())
    END_TS = int(END_OF_DAY.timestamp())

PICKLEBALL_SPORT_ID = 36
SPORT_IDS_TO_SCAN = [1, 4, 5, 10, 11, 20, 24, 30, 33, 36, 37, 40, 42, 55, 62]

DATABASE_URL = os.environ.get("DATABASE_URL", "")
# Prisma-style ?schema=public breaks psycopg2's URI parser — strip query string
if DATABASE_URL and "?" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split("?", 1)[0]

# ─── Parsers ──────────────────────────────────────────────────────────

def extract_price_from_notes(text):
    """Extract price (VND) from notes: '80.000đ', '80,000 VND', 'Phí: 150k', etc."""
    if not text:
        return None
    for pat in [
        r"(\d{2,3})[.,](\d{3})\s*(?:đ|VND|vnđ|vnd|dong|/)",
        r"[Pp]hí[:\s]*(\d{2,3})[.,](\d{3})",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return int(m.group(1)) * 1000 + int(m.group(2))
    for pat in [r"[Pp]hí[:\s]*(\d{4,6})\b", r"(\d{5,6})\s*(?:đ|VND|vnđ|/người)"]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val = int(m.group(1))
            if 10000 <= val <= 500000:
                return val
    for pat in [r"(\d{2,3})\s*[kK]\b", r"[Pp]hí[:\s]*(\d{2,3})\s*[kK]"]:
        m = re.search(pat, text)
        if m:
            val = int(m.group(1))
            if 20 <= val <= 500:
                return val * 1000
    return None


def extract_price_from_title(title):
    """Extract price from event title: '[80k]', '50k/slot', '130K', '80.000'."""
    if not title:
        return None
    m = re.search(r"(\d{2,3})[.,](\d{3})", title)
    if m:
        return int(m.group(1)) * 1000 + int(m.group(2))
    m = re.search(r"(\d{2,3})\s*[kK]", title)
    if m:
        val = int(m.group(1))
        if 20 <= val <= 500:
            return val * 1000
    return None


def extract_zalo_links(text):
    """Extract zalo.me group links from text."""
    if not text:
        return []
    links = re.findall(r"https?://zalo\.me/[^\s\u200b\u2060\uFEFF)\"'>]+", text)
    return list(dict.fromkeys(lk.rstrip(".,;:!?)") for lk in links))


def extract_zalo_phone(text):
    """Extract first phone number mentioned alongside 'zalo' keyword."""
    if not text:
        return None
    for pat in [r"[Zz]alo[:\s]*(\d[\d\s.-]{8,12}\d)", r"(\d{4}[\s.-]?\d{3}[\s.-]?\d{3})\s*.*?[Zz]alo"]:
        m = re.search(pat, text)
        if m:
            return re.sub(r"[\s.-]", "", m.group(1))
    return None


def resolve_fee(meet):
    """
    Determine the best fee amount for a meet using this priority:
      1. API feeAmount (raw) — unless < 10,000 VND (likely a typo/credit unit)
      2. If API fee < 10k → try titlePrice, then notesPrice
      3. If API fee is 0 or missing → use notesPrice or titlePrice
    """
    raw = meet.get("feeAmount") or 0
    if isinstance(raw, str):
        cleaned = re.sub(r"[^\d]", "", raw)
        raw = int(cleaned) if cleaned else 0
    else:
        raw = int(raw)

    name = (meet.get("name") or "")
    notes = meet.get("notes") or ""
    title_price = extract_price_from_title(name)
    notes_price = extract_price_from_notes(notes)

    if raw >= 10000:
        return raw
    if raw > 0 and raw < 10000:
        if title_price:
            return title_price
        if notes_price:
            return notes_price
        return raw * 1000
    if title_price:
        return title_price
    if notes_price:
        return notes_price
    return 0


def parse_fee(fee_amount, fee_currency="VND"):
    """Legacy wrapper — kept for compatibility but resolve_fee() is preferred."""
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

    # [c] Load from hcm_pickleball_clubs.json (comprehensive list from scan)
    json_paths = [
        os.path.join(os.path.dirname(__file__), "..", "..", "hcm_pickleball_clubs.json"),
        os.path.join(os.path.dirname(__file__), "..", "hcm_pickleball_clubs.json"),
    ]
    added_from_json = 0
    for jp in json_paths:
        jp = os.path.abspath(jp)
        if os.path.exists(jp):
            try:
                with open(jp, "r") as f:
                    json_clubs = json.load(f)
                if isinstance(json_clubs, dict):
                    for cid_str, c in json_clubs.items():
                        cid = int(cid_str) if isinstance(cid_str, str) else c.get("id")
                        if cid and cid not in club_map:
                            club_map[cid] = {
                                "id": cid,
                                "name": c.get("name", ""),
                                "slug": c.get("slug", ""),
                                "communityId": c.get("communityId", COMMUNITY_ID),
                                "sportId": c.get("sportId"),
                                "numMembers": c.get("numMembers", 0),
                            }
                            added_from_json += 1
                elif isinstance(json_clubs, list):
                    for c in json_clubs:
                        cid = c.get("id")
                        if cid and cid not in club_map:
                            club_map[cid] = {
                                "id": cid,
                                "name": c.get("name", ""),
                                "slug": c.get("slug", ""),
                                "communityId": c.get("communityId", COMMUNITY_ID),
                                "sportId": c.get("sportId"),
                                "numMembers": c.get("numMembers", 0),
                            }
                            added_from_json += 1
                print(f"  [c] Loaded {added_from_json} extra clubs from {os.path.basename(jp)}")
                break
            except Exception as e:
                print(f"  [c] Warning: could not load {jp}: {e}")

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

def collect_club_zalo_phone(meets):
    """Scan all event notes to find the best Zalo URL and phone per club."""
    club_zalo = {}
    club_phone = {}
    for m in meets.values():
        rid = m["_clubId"]
        notes = m.get("notes") or ""
        if not notes:
            continue
        if rid not in club_zalo:
            links = extract_zalo_links(notes)
            if links:
                club_zalo[rid] = links[0]
        if rid not in club_phone:
            phone = extract_zalo_phone(notes)
            if phone:
                club_phone[rid] = phone
    return club_zalo, club_phone


def upsert_clubs(cur, meets):
    """Upsert clubs from scraped meets, enriched with Zalo/phone from notes. Returns reclub_id -> db_id map."""
    club_zalo, club_phone = collect_club_zalo_phone(meets)

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
                "zalo_url": club_zalo.get(rid),
                "phone": club_phone.get(rid),
            }

    cur.execute("""
        ALTER TABLE clubs ADD COLUMN IF NOT EXISTS zalo_url TEXT;
        ALTER TABLE clubs ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE clubs ADD COLUMN IF NOT EXISTS admins TEXT[] DEFAULT '{}';
    """)

    id_map = {}
    for c in clubs.values():
        cur.execute(
            "SELECT id FROM clubs WHERE slug = %s AND reclub_id != %s",
            (c["slug"], c["reclub_id"]),
        )
        if cur.fetchone():
            c["slug"] = f"{c['slug']}-{c['reclub_id']}"

        cur.execute("""
            INSERT INTO clubs (reclub_id, name, slug, sport_id, community_id, num_members, zalo_url, phone, updated_at)
            VALUES (%(reclub_id)s, %(name)s, %(slug)s, %(sport_id)s, %(community_id)s, %(num_members)s, %(zalo_url)s, %(phone)s, NOW())
            ON CONFLICT (reclub_id) DO UPDATE SET
                name = EXCLUDED.name,
                slug = EXCLUDED.slug,
                num_members = EXCLUDED.num_members,
                zalo_url = COALESCE(EXCLUDED.zalo_url, clubs.zalo_url),
                phone = COALESCE(EXCLUDED.phone, clubs.phone),
                updated_at = NOW()
            RETURNING id, reclub_id
        """, c)
        row = cur.fetchone()
        id_map[row[1]] = row[0]

    zalo_count = sum(1 for c in clubs.values() if c["zalo_url"])
    phone_count = sum(1 for c in clubs.values() if c["phone"])
    print(f"    Upserted {len(id_map)} clubs ({zalo_count} with Zalo, {phone_count} with phone)")
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


MAX_DURATION_MIN = 360  # 6 hours — reject events longer than this

def upsert_sessions_and_snapshots(cur, meets, club_id_map, venue_coord_map):
    """Upsert sessions and create daily snapshots."""
    session_count = 0
    snapshot_count = 0
    skipped_duration = 0

    for ref_code, m in meets.items():
        loc = m.get("location") or {}
        psc = m.get("participantsStatusCount") or {}
        joined = psc.get("joined", 0)
        waitlisted = psc.get("waitlisted", 0)

        name = (m.get("name") or "").replace("\n", " ").strip()[:300]
        notes_raw = (m.get("notes") or "").strip()
        description = notes_raw[:8000] if notes_raw else None
        fee_amount = resolve_fee(m)
        duration_min = (m.get("duration") or 0) // 60
        if duration_min > MAX_DURATION_MIN:
            skipped_duration += 1
            continue
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
                perks, description, event_url, scraped_date
            ) VALUES (
                %(ref)s, %(name)s, %(club_id)s, %(venue_id)s,
                %(start)s, %(end)s, %(dur)s, %(max)s,
                %(fee)s, %(cur)s, %(cph)s,
                %(priv)s, %(stat)s, %(smin)s, %(smax)s,
                %(perks)s, %(desc)s, %(url)s, %(date)s
            )
            ON CONFLICT (reference_code, scraped_date) DO UPDATE SET
                name = EXCLUDED.name,
                max_players = EXCLUDED.max_players,
                fee_amount = EXCLUDED.fee_amount,
                cost_per_hour = EXCLUDED.cost_per_hour,
                status = EXCLUDED.status,
                skill_level_min = EXCLUDED.skill_level_min,
                skill_level_max = EXCLUDED.skill_level_max,
                perks = EXCLUDED.perks,
                description = EXCLUDED.description
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
            "desc": description,
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

    if skipped_duration > 0:
        print(f"    Skipped {skipped_duration} sessions with duration > {MAX_DURATION_MIN}min")
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
        WHERE s.scraped_date = %s AND s.duration_min <= 360
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

def ingest_day(day, club_map):
    """Run the full ingest pipeline for a single day."""
    set_target_day(day)

    print(f"\n{'─' * 65}")
    print(f"  Ingesting: {day.strftime('%A, %B %d, %Y')} (Vietnam time)")
    print(f"{'─' * 65}")

    print(f"\n  Fetching events from {len(club_map)} clubs...")
    all_meets = fetch_all_events(club_map)

    pickleball_meets = {}
    other_meets = {}
    for ref, m in all_meets.items():
        if m.get("sportId") == PICKLEBALL_SPORT_ID or m.get("_sportId") == PICKLEBALL_SPORT_ID:
            pickleball_meets[ref] = m
        else:
            other_meets[ref] = m

    for ref, m in other_meets.items():
        if not m.get("sportId") and not m.get("_sportId"):
            pickleball_meets[ref] = m

    print(f"    Pickleball sessions: {len(pickleball_meets)} / {len(all_meets)} total")

    if not pickleball_meets:
        print("  No pickleball events found for this day — skipping.")
        return 0

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        print("\n  Upserting data...")
        club_id_map = upsert_clubs(cur, pickleball_meets)
        venue_coord_map = upsert_venues(cur, pickleball_meets)
        upsert_sessions_and_snapshots(cur, pickleball_meets, club_id_map, venue_coord_map)

        print("\n  Computing aggregates...")
        compute_club_daily_stats(cur)

        conn.commit()
        print(f"\n  SUCCESS: Ingested {len(pickleball_meets)} sessions for {TODAY_STR}")

        # Roster + DUPR: Vietnam calendar "today" only, separate DB work per session
        # (does not use the committed ingest connection).
        day_key = day.strftime("%Y-%m-%d")
        today_key = NOW.strftime("%Y-%m-%d")
        if day_key == today_key and pickleball_meets:
            print("\n  Scraping rosters (today only)...")
            try:
                run_roster_pass_for_day(
                    DATABASE_URL,
                    TODAY_STR,
                    list(pickleball_meets.keys()),
                )
            except Exception as e:
                print(f"  [ingest] Roster pass error (non-fatal): {e}")

        return len(pickleball_meets)

    except Exception as e:
        conn.rollback()
        print(f"\n  ERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def main():
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL environment variable not set.")
        print("  Export it or add to .env: DATABASE_URL=postgresql://user:pass@host:port/db")
        sys.exit(1)

    day_labels = ", ".join(d.strftime("%Y-%m-%d") for d in TARGET_DAYS)
    print("=" * 65)
    print("  PICKLEBALL HUB INGEST")
    print(f"  Days: {day_labels} (Vietnam time)")
    print("=" * 65)

    # Build the shared club map once (reused for all days)
    set_target_day(TARGET_DAYS[0])

    print("\n[1/3] Gathering club IDs from API...")
    club_map = get_all_club_ids()

    print("\n[2/3] Loading known clubs from database...")
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

    print(f"\n[3/3] Ingesting {len(TARGET_DAYS)} day(s)...")
    total = 0
    for day in TARGET_DAYS:
        total += ingest_day(day, club_map)

    print(f"\n{'=' * 65}")
    print(f"  DONE — {total} total sessions across {len(TARGET_DAYS)} day(s)")
    print(f"{'=' * 65}")


if __name__ == "__main__":
    main()
