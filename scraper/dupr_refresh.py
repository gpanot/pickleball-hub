"""
Weekly DUPR rating refresh task.

Strategy
--------
- First pass: fetch only players where dupr_singles IS NULL AND dupr_doubles IS NULL
  (new players who never got a rating)
- Once per month (day-of-month == 1): re-fetch ALL players to pick up rating changes

Data source: Reclub /players/userIds API (same endpoint used by roster_scraper.py),
scoped to BASIC_PROFILE + SPORT_PROFILES.  We already have DUPR data flowing through
the roster scraper on session days; this task fills in players who were never on a
session roster that we scraped, and refreshes stale ratings monthly.

Rate limiting: PROFILE_CHUNK players per request, SLEEP_S between chunks.
"""

from __future__ import annotations

import os
import time
import urllib.error
import urllib.parse
import urllib.request
import json
from datetime import datetime, timezone
from typing import Any, Optional

import psycopg2

API = "https://api.reclub.co"
PICKLEBALL_SPORT_ID = 36
PROFILE_CHUNK = 30
SLEEP_S = 1.0   # pause between API chunks to avoid hammering
BATCH_DB_COMMIT = 100   # commit every N players to keep transactions small


HEADERS_JSON = {
    "User-Agent": "Mozilla/5.0 (compatible; pickleball-hub/1.0)",
    "x-output-casing": "camelCase",
    "Accept": "application/json",
}


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


def extract_dupr(player: dict) -> dict[str, Any]:
    dupr: dict[str, Any] = {
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


def fetch_profiles_for_ids(user_ids: list[int]) -> list[dict]:
    """Fetch player profiles from Reclub API in chunks."""
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
            print(f"[dupr_refresh] API error for chunk at {i}: {e}", flush=True)
        if i + PROFILE_CHUNK < len(user_ids):
            time.sleep(SLEEP_S)
    return results


def run_dupr_refresh(database_url: str) -> dict:
    """
    Main entry point.  Returns a summary dict with matched/unmatched counts.
    """
    now_vn = datetime.now(timezone.utc)
    is_first_of_month = now_vn.day == 1

    url = _strip_db_url(database_url)
    conn = psycopg2.connect(url)
    cur = conn.cursor()

    try:
        if is_first_of_month:
            print("[dupr_refresh] First of month — fetching ALL players", flush=True)
            cur.execute("SELECT user_id FROM players ORDER BY user_id")
        else:
            print("[dupr_refresh] Regular run — fetching only players with no DUPR rating", flush=True)
            cur.execute(
                "SELECT user_id FROM players WHERE dupr_singles IS NULL AND dupr_doubles IS NULL ORDER BY user_id"
            )

        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    user_ids = [int(r[0]) for r in rows]
    total_players = len(user_ids)
    print(f"[dupr_refresh] {total_players} players to process", flush=True)

    if total_players == 0:
        return {"total": 0, "matched": 0, "unmatched": 0, "updated": 0}

    profiles = fetch_profiles_for_ids(user_ids)
    profile_map = {
        p["userId"]: p
        for p in profiles
        if isinstance(p, dict) and "userId" in p
    }

    matched = 0
    unmatched = 0
    updated = 0

    conn2 = psycopg2.connect(url)
    cur2 = conn2.cursor()

    try:
        for idx, uid in enumerate(user_ids):
            profile = profile_map.get(uid)
            if not profile:
                unmatched += 1
                continue

            matched += 1
            dupr = extract_dupr(profile)
            has_dupr = dupr["dupr_singles"] is not None or dupr["dupr_doubles"] is not None
            if has_dupr:
                updated += 1

            dupr_ts = _parse_dupr_updated_at(dupr["dupr_updated_at"])
            display_name = profile.get("displayName") or profile.get("name")

            cur2.execute(
                """
                UPDATE players SET
                    username = COALESCE(%s, username),
                    display_name = COALESCE(%s, display_name),
                    dupr_singles = COALESCE(%s, dupr_singles),
                    dupr_doubles = COALESCE(%s, dupr_doubles),
                    dupr_singles_reliability = COALESCE(%s, dupr_singles_reliability),
                    dupr_doubles_reliability = COALESCE(%s, dupr_doubles_reliability),
                    dupr_id = COALESCE(%s, dupr_id),
                    dupr_updated_at = COALESCE(%s, dupr_updated_at),
                    updated_at = NOW()
                WHERE user_id = %s
                """,
                (
                    profile.get("username"),
                    display_name,
                    dupr["dupr_singles"],
                    dupr["dupr_doubles"],
                    dupr["dupr_singles_reliability"],
                    dupr["dupr_doubles_reliability"],
                    dupr["dupr_id"],
                    dupr_ts,
                    uid,
                ),
            )

            if (idx + 1) % BATCH_DB_COMMIT == 0:
                conn2.commit()
                print(
                    f"[dupr_refresh] Progress: {idx + 1}/{total_players} processed "
                    f"({matched} matched, {unmatched} unmatched, {updated} with DUPR)",
                    flush=True,
                )

        conn2.commit()
    except Exception as e:
        conn2.rollback()
        print(f"[dupr_refresh] DB error: {e}", flush=True)
        raise
    finally:
        cur2.close()
        conn2.close()

    print(
        f"[dupr_refresh] Done. total={total_players} matched={matched} "
        f"unmatched={unmatched} with_dupr={updated}",
        flush=True,
    )
    return {
        "total": total_players,
        "matched": matched,
        "unmatched": unmatched,
        "updated": updated,
        "first_of_month": is_first_of_month,
    }
