"""
Roster + DUPR scrape for a single session row (sessions.id).

Fetches meet page Nuxt payload, confirmed participants, batch player profiles,
then upserts players, session_rosters, session_dupr_stats.

Each public entrypoint uses its own DB connection + commit so failures never
roll back the main ingest transaction.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Optional

import psycopg2

API = "https://api.reclub.co"
NUXT_BASE = "https://reclub.co/m"

HEADERS_JSON = {
    "User-Agent": "Mozilla/5.0 (compatible; pickleball-hub/1.0)",
    "x-output-casing": "camelCase",
    "Accept": "application/json",
}

HEADERS_HTML = {
    "User-Agent": "Mozilla/5.0 (compatible; pickleball-hub/1.0)",
    "Accept": "text/html",
}

PICKLEBALL_SPORT_ID = 36
VALID_REFERENCE_TYPES = {9, 10, 30}
CONFIRMED_STATUSES = {0, 1}
PROFILE_CHUNK = 30
PROFILE_SLEEP_S = 0.5


def _strip_db_url(url: str) -> str:
    if url and "?" in url:
        return url.split("?", 1)[0]
    return url or ""


def api_get(path: str, params: Optional[dict] = None) -> Any:
    q = ""
    if params:
        q = "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(f"{API}{path}{q}", headers=HEADERS_JSON)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode())


def fetch_nuxt_page(reference_code: str) -> Optional[str]:
    url = f"{NUXT_BASE}/{reference_code}"
    req = urllib.request.Request(url, headers=HEADERS_HTML)
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"[roster] Failed to fetch {url}: {e}")
        return None


def parse_nuxt_data(html: str) -> Optional[list]:
    match = re.search(
        r'<script[^>]+id="__NUXT_DATA__"[^>]*>(.*?)</script>',
        html,
        re.DOTALL,
    )
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except Exception as e:
        print(f"[roster] Failed to parse __NUXT_DATA__: {e}")
        return None


def resolve(raw: list, val: Any) -> Any:
    seen = set()
    while isinstance(val, int) and val not in seen:
        if val < 0 or val >= len(raw):
            break
        seen.add(val)
        val = raw[val]
    return val


def extract_participants(raw: list) -> list[dict]:
    """Walk Nuxt raw array for meet participant entries (confirmed)."""
    participants: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        if "referenceId" not in item or "status" not in item:
            continue
        ref_type = item.get("referenceType")  # literal int, not an index reference
        if not isinstance(ref_type, int) or ref_type not in VALID_REFERENCE_TYPES:
            continue
        status_raw = item["status"]
        # status field is an index into raw; resolve one level only
        if isinstance(status_raw, int) and 0 <= status_raw < len(raw):
            status = raw[status_raw]
        else:
            status = status_raw
        # if still a list/dict after one resolve, skip
        if not isinstance(status, int) or status not in CONFIRMED_STATUSES:
            continue
        user_id = resolve(raw, item["referenceId"])
        if not isinstance(user_id, int):
            continue
        is_host = resolve(raw, item.get("isHost", False))
        if not isinstance(is_host, bool):
            is_host = is_host is True or is_host == 1
        participants.append({"userId": user_id, "isHost": is_host, "status": status})

    seen: dict[int, dict] = {}
    for p in participants:
        uid = p["userId"]
        if uid not in seen:
            seen[uid] = p
        else:
            seen[uid]["isHost"] = seen[uid]["isHost"] or p["isHost"]
    print(f"[roster] extract_participants found {len(participants)} raw, {len(seen)} unique")
    return list(seen.values())


def extract_participants_structured(raw: list, reference_code: str) -> list[dict]:
    """
    Fallback: navigate meet-{code} → participants like repo root scraper.py.
    Returns same shape as extract_participants (userId int, isHost bool, status).
    """
    try:
        root = raw[1]
        data_wrapper = raw[root["data"]]
        if isinstance(data_wrapper, list) and data_wrapper[0] in ("ShallowReactive", "Reactive"):
            data_dict = raw[data_wrapper[1]]
        else:
            data_dict = data_wrapper

        meet_key = f"meet-{reference_code}"
        if meet_key not in data_dict:
            return []

        meet_container = raw[data_dict[meet_key]]
        meet_ref = raw[meet_container["meet"]]
        if isinstance(meet_ref, list) and meet_ref[0] in ("Reactive", "ShallowReactive"):
            meet_obj = raw[meet_ref[1]]
        else:
            meet_obj = meet_ref

        part_ref = raw[meet_obj["participants"]]
        if isinstance(part_ref, list) and part_ref[0] in ("Reactive", "ShallowReactive"):
            part_list = raw[part_ref[1]]
        else:
            part_list = part_ref

        out: list[dict] = []
        for pidx in part_list:
            entry = raw[pidx]
            if not isinstance(entry, dict):
                continue
            if "referenceId" not in entry or "status" not in entry:
                continue
            status = resolve(raw, entry["status"])
            if not isinstance(status, int) or status not in CONFIRMED_STATUSES:
                continue
            rid = resolve(raw, entry["referenceId"])
            if not isinstance(rid, int):
                continue
            is_host = resolve(raw, entry.get("isHost", False))
            if not isinstance(is_host, bool):
                is_host = is_host is True or is_host == 1
            out.append({"userId": rid, "isHost": is_host, "status": status})
        seen: dict[int, dict] = {}
        for p in out:
            uid = p["userId"]
            if uid not in seen:
                seen[uid] = p
            else:
                seen[uid]["isHost"] = seen[uid]["isHost"] or p["isHost"]
        return list(seen.values())
    except Exception as e:
        print(f"[roster] structured extract failed for {reference_code}: {e}")
        return []


def fetch_player_profiles(user_ids: list[int]) -> list[dict]:
    results: list[dict] = []
    for i in range(0, len(user_ids), PROFILE_CHUNK):
        chunk = user_ids[i : i + PROFILE_CHUNK]
        ids_str = ",".join(str(uid) for uid in chunk)
        try:
            data = api_get(
                "/players/userIds",
                {"userIds": ids_str, "scopes": "BASIC_PROFILE,SPORT_PROFILES"},
            )
            players = data if isinstance(data, list) else data.get("players", [])
            if isinstance(players, list):
                results.extend(players)
        except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError, Exception) as e:
            print(f"[roster] Profile fetch error for chunk starting {i}: {e}")
        if i + PROFILE_CHUNK < len(user_ids):
            time.sleep(PROFILE_SLEEP_S)
    return results


def extract_dupr(player: dict) -> dict[str, Any]:
    dupr = {
        "dupr_singles": None,
        "dupr_doubles": None,
        "dupr_singles_reliability": None,
        "dupr_doubles_reliability": None,
        "dupr_id": None,
        "dupr_updated_at": None,
    }
    sports = player.get("sports") or []
    for sport in sports:
        if not isinstance(sport, dict):
            continue
        if sport.get("sportId") != PICKLEBALL_SPORT_ID:
            continue
        ratings = sport.get("ratings") or {}
        if not isinstance(ratings, dict):
            continue
        d = ratings.get("dupr") or {}
        if not isinstance(d, dict) or not d:
            continue
        dupr["dupr_singles"] = d.get("singles")
        dupr["dupr_doubles"] = d.get("doubles")
        dupr["dupr_singles_reliability"] = d.get("singlesReliabilityScore")
        dupr["dupr_doubles_reliability"] = d.get("doublesReliabilityScore")
        dupr["dupr_id"] = d.get("duprId")
        dupr["dupr_updated_at"] = d.get("updatedAt")
        break
    return dupr


def _parse_dupr_updated_at(val: Any) -> Optional[datetime]:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        ts = float(val)
        if ts > 1e12:
            ts /= 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    if isinstance(val, str):
        s = val.strip().replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(s)
        except ValueError:
            return None
    return None


def scrape_session_roster(
    database_url: str,
    session_id: int,
    reference_code: str,
    scraped_date_str: str,
) -> Optional[dict]:
    """
    Full pipeline for one session row. Own connection + commit.
    Returns summary dict or None on hard failure.
    """
    print(f"[roster] Scraping session_id={session_id} ref={reference_code}")

    html = fetch_nuxt_page(reference_code)
    if not html:
        return None

    raw = parse_nuxt_data(html)
    if not raw:
        print(f"[roster] No __NUXT_DATA__ for {reference_code}")
        return None

    participants = extract_participants(raw)
    if not participants:
        participants = extract_participants_structured(raw, reference_code)
    if not participants:
        print(f"[roster] No confirmed participants for {reference_code}")
        return None

    print(f"[roster] {len(participants)} confirmed participants for {reference_code}")

    user_ids = [p["userId"] for p in participants]
    profiles = fetch_player_profiles(user_ids)
    profile_map = {p["userId"]: p for p in profiles if isinstance(p, dict) and "userId" in p}

    url = _strip_db_url(database_url)
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    players_with_dupr = 0
    singles_vals: list[float] = []
    doubles_vals: list[float] = []

    try:
        for participant in participants:
            uid = participant["userId"]
            profile = profile_map.get(uid, {})
            dupr = extract_dupr(profile)

            has_dupr = dupr["dupr_singles"] is not None or dupr["dupr_doubles"] is not None
            if has_dupr:
                players_with_dupr += 1
            if dupr["dupr_singles"] is not None:
                try:
                    singles_vals.append(float(dupr["dupr_singles"]))
                except (TypeError, ValueError):
                    pass
            if dupr["dupr_doubles"] is not None:
                try:
                    doubles_vals.append(float(dupr["dupr_doubles"]))
                except (TypeError, ValueError):
                    pass

            dupr_ts = _parse_dupr_updated_at(dupr["dupr_updated_at"])
            display_name = profile.get("displayName") or profile.get("name")

            cur.execute(
                """
                INSERT INTO players (
                    user_id, username, display_name,
                    dupr_singles, dupr_doubles,
                    dupr_singles_reliability, dupr_doubles_reliability,
                    dupr_id, dupr_updated_at, last_seen_at, updated_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    username = COALESCE(EXCLUDED.username, players.username),
                    display_name = COALESCE(EXCLUDED.display_name, players.display_name),
                    dupr_singles = COALESCE(EXCLUDED.dupr_singles, players.dupr_singles),
                    dupr_doubles = COALESCE(EXCLUDED.dupr_doubles, players.dupr_doubles),
                    dupr_singles_reliability = COALESCE(EXCLUDED.dupr_singles_reliability, players.dupr_singles_reliability),
                    dupr_doubles_reliability = COALESCE(EXCLUDED.dupr_doubles_reliability, players.dupr_doubles_reliability),
                    dupr_id = COALESCE(EXCLUDED.dupr_id, players.dupr_id),
                    dupr_updated_at = COALESCE(EXCLUDED.dupr_updated_at, players.dupr_updated_at),
                    last_seen_at = NOW(),
                    updated_at = NOW()
                """,
                (
                    uid,
                    profile.get("username"),
                    display_name,
                    dupr["dupr_singles"],
                    dupr["dupr_doubles"],
                    dupr["dupr_singles_reliability"],
                    dupr["dupr_doubles_reliability"],
                    dupr["dupr_id"],
                    dupr_ts,
                ),
            )

            cur.execute(
                """
                INSERT INTO session_rosters (
                    session_id, user_id, is_host, is_confirmed, scraped_at
                ) VALUES (%s, %s, %s, TRUE, NOW())
                ON CONFLICT (session_id, user_id) DO UPDATE SET
                    is_host = EXCLUDED.is_host,
                    scraped_at = NOW()
                """,
                (session_id, uid, participant["isHost"]),
            )

        total = len(participants)
        dupr_pct = round((players_with_dupr / total) * 100, 2) if total > 0 else 0
        avg_s = round(sum(singles_vals) / len(singles_vals), 3) if singles_vals else None
        avg_d = round(sum(doubles_vals) / len(doubles_vals), 3) if doubles_vals else None

        cur.execute(
            """
            INSERT INTO session_dupr_stats (
                session_id, scraped_date,
                total_confirmed, players_with_dupr,
                dupr_participation_pct, avg_dupr_singles, avg_dupr_doubles, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (session_id) DO UPDATE SET
                scraped_date = EXCLUDED.scraped_date,
                total_confirmed = EXCLUDED.total_confirmed,
                players_with_dupr = EXCLUDED.players_with_dupr,
                dupr_participation_pct = EXCLUDED.dupr_participation_pct,
                avg_dupr_singles = EXCLUDED.avg_dupr_singles,
                avg_dupr_doubles = EXCLUDED.avg_dupr_doubles,
                updated_at = NOW()
            """,
            (
                session_id,
                scraped_date_str,
                total,
                players_with_dupr,
                dupr_pct,
                avg_s,
                avg_d,
            ),
        )

        conn.commit()
        print(f"[roster] {reference_code} — {players_with_dupr}/{total} with DUPR ({dupr_pct}%)")
        return {
            "dupr_participation_pct": dupr_pct,
            "total": total,
            "with_dupr": players_with_dupr,
        }
    except Exception as e:
        conn.rollback()
        print(f"[roster] DB error for {reference_code}: {e}")
        return None
    finally:
        cur.close()
        conn.close()


def run_roster_pass_for_day(
    database_url: str,
    scraped_date_str: str,
    reference_codes: list[str],
) -> None:
    """
    After main ingest commit: resolve session ids and scrape each roster.
    Failures are logged only.
    """
    if not reference_codes:
        return

    max_n = os.environ.get("ROSTER_MAX_SESSIONS")
    try:
        cap = int(max_n) if max_n else None
    except ValueError:
        cap = None

    url = _strip_db_url(database_url)
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    pairs: list[tuple[int, str]] = []
    try:
        ph = ",".join(["%s"] * len(reference_codes))
        cur.execute(
            f"""
            SELECT id, reference_code FROM sessions
            WHERE scraped_date = %s AND reference_code IN ({ph})
            """,
            [scraped_date_str, *reference_codes],
        )
        for sid, ref in cur.fetchall():
            pairs.append((int(sid), str(ref)))
    finally:
        cur.close()
        conn.close()

    if cap is not None:
        pairs = pairs[:cap]

    delay = float(os.environ.get("ROSTER_SLEEP_SECONDS", "1"))

    for session_id, ref in pairs:
        try:
            scrape_session_roster(url, session_id, ref, scraped_date_str)
        except Exception as e:
            print(f"[ingest] Roster scrape failed for {ref}: {e}")
        time.sleep(delay)


# --- Retention (future; do not run until 14+ days of roster data) ---
# SELECT
#   s1.reference_code,
#   COUNT(DISTINCT r2.user_id) AS returning_players,
#   COUNT(DISTINCT r1.user_id) AS total_players
# FROM session_rosters r1
# JOIN sessions s1 ON r1.session_id = s1.id
# JOIN sessions s2 ON s2.club_id = s1.club_id
#   AND s2.scraped_date BETWEEN (s1.scraped_date::date - INTERVAL '14 days')::text
#   AND (s1.scraped_date::date - INTERVAL '1 day')::text
# JOIN session_rosters r2
#   ON r2.session_id = s2.id
#   AND r2.user_id = r1.user_id
#   AND r2.is_host = FALSE
# WHERE r1.is_host = FALSE
# GROUP BY s1.reference_code;
