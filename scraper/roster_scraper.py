"""
Roster + DUPR scrape for a single session row (sessions.id).

Fetches confirmed participants via the public /meets/by-ref/{ref} API endpoint,
then batch-fetches player profiles and upserts players, session_rosters,
session_dupr_stats.

Each public entrypoint uses its own DB connection + commit so failures never
roll back the main ingest transaction.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from squad_chests import create_squad_chest_if_member
from typing import Any, Optional

import psycopg2

API = "https://api.reclub.co"

HEADERS_JSON = {
    "User-Agent": "Mozilla/5.0 (compatible; pickleball-hub/1.0)",
    "x-output-casing": "camelCase",
    "Accept": "application/json",
}

PICKLEBALL_SPORT_ID = 36
# June 2026 /meets/by-ref/ API referenceType values:
#   1 = own Reclub account  → batch-fetch profile via /players/userIds
#   2 = guest slot (no account, added by admin/organiser) → no name, skip
#   3 = bring-a-friend (added by another player) → use externalReference.name directly
CONFIRMED_STATUS = 1
PROFILE_CHUNK = 30
PROFILE_SLEEP_S = 0.5

# ── Phase 1: roster eligibility filter ─────────────────────────────────
# Sessions below either threshold are skipped — not worth the API calls.
# Configurable via env vars so thresholds can be tuned without a redeploy.
ROSTER_MIN_MAX_PLAYERS = int(os.environ.get("ROSTER_MIN_MAX_PLAYERS", "16"))
ROSTER_MIN_JOINED      = int(os.environ.get("ROSTER_MIN_JOINED", "5"))

# ── Phase 2: player profile TTL cache ──────────────────────────────────
# Skip /players/userIds for players whose record was updated within this window.
# 24h covers all 4 intra-day scrape slots; DUPR rarely changes intraday.
PROFILE_CACHE_TTL_HOURS = int(os.environ.get("PROFILE_CACHE_TTL_HOURS", "24"))


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


def fetch_participants_by_ref(reference_code: str) -> Optional[list[dict]]:
    """
    Fetch confirmed participants for a meet using the public /meets/by-ref/{ref} endpoint.

    Returns a list of dicts sorted by join order (lastStatusUpdatedAt ASC).
    Each dict has:
      - userId (int) — present for referenceType 1 (own account); None for type 3
      - isHost (bool)
      - is_added_by_friend (bool) — True for referenceType 3 (bring-a-friend slots)
      - friend_name (str | None) — display name from externalReference.name, type 3 only

    referenceType 2 (anonymous guest slots with no name) are silently dropped.

    Returns None on fetch/parse error so the caller can write an empty stats row.
    """
    try:
        data = api_get(f"/meets/by-ref/{reference_code}")
    except Exception as e:
        print(f"[roster] Failed to fetch /meets/by-ref/{reference_code}: {e}")
        return None

    raw_participants = data.get("participants") if isinstance(data, dict) else None
    if not isinstance(raw_participants, list):
        print(f"[roster] No participants array in /meets/by-ref/{reference_code} response")
        return None

    # Sort by join order before processing so result order is stable
    confirmed = sorted(
        (e for e in raw_participants if isinstance(e, dict) and e.get("status") == CONFIRMED_STATUS),
        key=lambda e: e.get("lastStatusUpdatedAt") or 0,
    )

    seen_type1: dict[int, dict] = {}   # deduplicate own-account users
    type3_entries: list[dict] = []     # bring-a-friend (have a name, no DB player row)
    skipped_type2 = 0

    for entry in confirmed:
        rt = entry.get("referenceType")
        uid = entry.get("referenceId")
        is_host = bool(entry.get("isHost", False))

        if rt == 1:
            # Own Reclub account — deduplicate by userId
            if not isinstance(uid, int) or uid <= 0:
                continue
            if uid not in seen_type1:
                seen_type1[uid] = {"userId": uid, "isHost": is_host, "is_added_by_friend": False, "friend_name": None}
            else:
                seen_type1[uid]["isHost"] = seen_type1[uid]["isHost"] or is_host

        elif rt == 3:
            # Bring-a-friend: name comes from externalReference, not a player profile
            ext = entry.get("externalReference")
            name = ext.get("name") if isinstance(ext, dict) else None
            if name:
                type3_entries.append({
                    "userId": None,
                    "isHost": is_host,
                    "is_added_by_friend": True,
                    "friend_name": name,
                })

        elif rt == 2:
            # Anonymous guest slot — no name available, skip
            skipped_type2 += 1

    result = list(seen_type1.values()) + type3_entries
    print(
        f"[roster] fetch_participants_by_ref({reference_code}): "
        f"{len(raw_participants)} raw → {len(confirmed)} confirmed → "
        f"{len(seen_type1)} real users + {len(type3_entries)} bring-a-friend "
        f"+ {skipped_type2} anon guests (skipped)"
    )
    return result


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


def fetch_player_profiles_with_cache(
    cur,
    user_ids: list[int],
) -> list[dict]:
    """
    Phase 2: profile TTL cache.
    Players updated within PROFILE_CACHE_TTL_HOURS are loaded from the DB
    instead of hitting the Reclub API again. Only truly stale or new players
    are fetched from the API, then merged back.
    """
    if not user_ids:
        return []

    # Query which user_ids are already fresh in the DB
    ph = ",".join(["%s"] * len(user_ids))
    cur.execute(
        f"""
        SELECT user_id, username, display_name, image_url,
               dupr_singles, dupr_doubles,
               dupr_singles_reliability, dupr_doubles_reliability,
               dupr_id, dupr_updated_at
        FROM players
        WHERE user_id IN ({ph})
          AND updated_at >= NOW() - INTERVAL '{PROFILE_CACHE_TTL_HOURS} hours'
        """,
        user_ids,
    )
    cached_rows = cur.fetchall()
    cached_map: dict[int, dict] = {}
    for row in cached_rows:
        uid = int(row[0])
        cached_map[uid] = {
            "userId": uid,
            "username": row[1],
            "name": row[2] or "",
            "displayName": row[2] or "",
            "imageUrl": row[3],
            # Reconstruct minimal sport profile shape so extract_dupr() works
            "sports": [
                {
                    "sportId": PICKLEBALL_SPORT_ID,
                    "ratings": {
                        "dupr": {
                            "singles": row[4],
                            "doubles": row[5],
                            "singlesReliabilityScore": row[6],
                            "doublesReliabilityScore": row[7],
                            "duprId": row[8],
                            "updatedAt": row[9],
                        }
                    },
                }
            ] if any(row[4:9]) else [],
        }

    stale_ids = [uid for uid in user_ids if uid not in cached_map]
    cache_hits = len(cached_map)

    print(
        f"[roster]   profile cache: {cache_hits}/{len(user_ids)} fresh "
        f"({cache_hits*100//max(len(user_ids),1)}% hit) — fetching {len(stale_ids)} from API"
    )

    api_profiles = fetch_player_profiles(stale_ids) if stale_ids else []
    api_map = {p["userId"]: p for p in api_profiles if isinstance(p, dict) and "userId" in p}

    # Merge: API result wins for stale/new players; cached result for fresh ones
    return [api_map.get(uid) or cached_map.get(uid) for uid in user_ids
            if api_map.get(uid) or cached_map.get(uid)]


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


def record_dupr_history(cur, player_id: int, new_dupr: float | None) -> None:
    """Insert a history row only if DUPR changed from the last recorded value."""
    if new_dupr is None:
        return
    cur.execute(
        """
        SELECT dupr_doubles FROM player_dupr_history
        WHERE player_id = %s
        ORDER BY recorded_at DESC
        LIMIT 1
        """,
        (player_id,),
    )
    row = cur.fetchone()
    last_dupr = float(row[0]) if row and row[0] is not None else None

    if last_dupr is None or abs(float(new_dupr) - last_dupr) >= 0.01:
        cur.execute(
            """
            INSERT INTO player_dupr_history (player_id, dupr_doubles, recorded_at)
            VALUES (%s, %s, NOW())
            """,
            (player_id, new_dupr),
        )


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

    participants = fetch_participants_by_ref(reference_code)
    if not participants:
        print(f"[roster] No confirmed participants for {reference_code} — writing empty stats row")
        # Write a zero-participant stats row so the swipe-deck duprRange fallback
        # can use session.skillLevelMin/Max rather than showing nothing.
        url = _strip_db_url(database_url)
        try:
            conn = psycopg2.connect(url)
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO session_dupr_stats (
                    session_id, scraped_date,
                    total_confirmed, players_with_dupr,
                    dupr_participation_pct, avg_dupr_singles, avg_dupr_doubles, updated_at
                ) VALUES (%s, %s, 0, 0, 0, NULL, NULL, NOW())
                ON CONFLICT (session_id) DO UPDATE SET
                    scraped_date = EXCLUDED.scraped_date,
                    total_confirmed = 0,
                    players_with_dupr = 0,
                    dupr_participation_pct = 0,
                    updated_at = NOW()
                """,
                (session_id, scraped_date_str),
            )
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            print(f"[roster] WARN: could not write empty stats for {reference_code}: {e}")
        return {"dupr_participation_pct": 0, "total": 0, "with_dupr": 0, "returning_player_pct": None}

    print(f"[roster] {len(participants)} confirmed participants for {reference_code}")

    # Split into real Reclub users (have userId, stored in DB) vs bring-a-friend entries
    # (userId=None, have a name but no player profile — counted in total, not in DB)
    real_participants = [p for p in participants if p["userId"] is not None]
    friend_count = len(participants) - len(real_participants)

    user_ids = [p["userId"] for p in real_participants]

    url = _strip_db_url(database_url)
    conn = psycopg2.connect(url)
    cur = conn.cursor()

    # Phase 2: use TTL cache — players updated within PROFILE_CACHE_TTL_HOURS
    # are loaded from DB, only stale/new players hit the Reclub API.
    profiles = fetch_player_profiles_with_cache(cur, user_ids)
    profile_map = {p["userId"]: p for p in profiles if isinstance(p, dict) and "userId" in p}
    players_with_dupr = 0
    singles_vals: list[float] = []
    doubles_vals: list[float] = []

    try:
        for participant in real_participants:
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
            image_url = profile.get("imageUrl")

            cur.execute(
                """
                INSERT INTO players (
                    user_id, username, display_name, image_url,
                    dupr_singles, dupr_doubles,
                    dupr_singles_reliability, dupr_doubles_reliability,
                    dupr_id, dupr_updated_at, last_seen_at, updated_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    username = COALESCE(EXCLUDED.username, players.username),
                    display_name = COALESCE(EXCLUDED.display_name, players.display_name),
                    image_url = COALESCE(EXCLUDED.image_url, players.image_url),
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
                    image_url,
                    dupr["dupr_singles"],
                    dupr["dupr_doubles"],
                    dupr["dupr_singles_reliability"],
                    dupr["dupr_doubles_reliability"],
                    dupr["dupr_id"],
                    dupr_ts,
                ),
            )

            record_dupr_history(cur, uid, dupr["dupr_doubles"])

            cur.execute(
                """
                INSERT INTO session_rosters (
                    session_id, user_id, is_host, is_confirmed,
                    scraped_at, first_seen_at
                ) VALUES (%s, %s, %s, TRUE, NOW(), NOW())
                ON CONFLICT (session_id, user_id) DO UPDATE SET
                    is_host = EXCLUDED.is_host,
                    scraped_at = NOW()
                """,
                (session_id, uid, participant["isHost"]),
            )

            # Squad chest: create if player is a squad member
            try:
                create_squad_chest_if_member(conn, reclub_user_id=uid, session_id=session_id)
            except Exception as e:
                print(f"[squad_chests] Skipped chest for uid={uid} session={session_id}: {e}")

        # total_confirmed reflects all confirmed slots (real users + bring-a-friend)
        # DUPR % is computed over real users only (bring-a-friend have no profile)
        total = len(participants)
        dupr_denominator = len(real_participants)
        dupr_pct = round((players_with_dupr / dupr_denominator) * 100, 2) if dupr_denominator > 0 else 0
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

        # Compute returning-player % for this session:
        # A "regular" is a non-host player who has attended this club at least 3 times
        # across all sessions in the past 60 days (excluding today).
        returning_pct: float | None = None
        # Keep denominator aligned with persisted roster rows (confirmed only),
        # so regulars % cannot exceed 100 due to mixed status rows.
        cur.execute(
            """
            SELECT
              SUM(CASE WHEN is_confirmed = TRUE AND is_host = FALSE THEN 1 ELSE 0 END) AS non_host_total,
              SUM(CASE WHEN is_confirmed = TRUE AND is_host = TRUE THEN 1 ELSE 0 END) AS host_total
            FROM session_rosters
            WHERE session_id = %s
            """,
            (session_id,),
        )
        row = cur.fetchone() or (0, 0)
        non_host_total = int(row[0] or 0)
        host_total = int(row[1] or 0)
        print(
            f"[roster] {reference_code} participants breakdown — "
            f"non_host={non_host_total}, host={host_total}, scraped_date={scraped_date_str}"
        )
        if non_host_total > 0:
            try:
                cur.execute(
                    """
                    SELECT COUNT(DISTINCT r1.user_id) AS regulars
                    FROM session_rosters r1
                    JOIN sessions s1 ON r1.session_id = s1.id
                    WHERE s1.id = %s
                      AND r1.is_confirmed = TRUE
                      AND r1.is_host = FALSE
                      AND r1.user_id IN (
                          SELECT r2.user_id
                          FROM session_rosters r2
                          JOIN sessions s2 ON r2.session_id = s2.id
                          WHERE s2.club_id = (SELECT club_id FROM sessions WHERE id = %s)
                            AND s2.scraped_date < %s
                            AND s2.scraped_date >= (DATE %s - INTERVAL '60 days')::text
                            AND r2.is_confirmed = TRUE
                            AND r2.is_host = FALSE
                          GROUP BY r2.user_id
                          HAVING COUNT(DISTINCT r2.session_id) >= 3
                      )
                    """,
                    (session_id, session_id, scraped_date_str, scraped_date_str),
                )
                row = cur.fetchone()
                if row is None:
                    print(f"[roster] WARN: retention query returned no row for {reference_code} (session_id={session_id})")
                else:
                    (regulars,) = row
                    returning_pct = round((int(regulars) / non_host_total) * 100, 2)
                    if returning_pct > 100:
                        returning_pct = 100.0
                    print(f"[roster] {reference_code} regulars query — regulars={regulars}, non_host_total={non_host_total}")
            except Exception as e:
                import traceback
                print(f"[roster] ERROR: retention query failed for {reference_code} (session_id={session_id}, date={scraped_date_str}): {type(e).__name__}: {e}")
                print(traceback.format_exc())
        else:
            print(f"[roster] WARN: {reference_code} skipping regulars — non_host_total=0 (all {host_total} participants marked as host)")

        try:
            cur.execute(
                """
                UPDATE session_dupr_stats
                   SET returning_player_pct = %s, updated_at = NOW()
                 WHERE session_id = %s
                """,
                (returning_pct, session_id),
            )
        except Exception as e:
            import traceback
            print(f"[roster] ERROR: UPDATE returning_player_pct failed for {reference_code} (session_id={session_id}): {type(e).__name__}: {e}")
            print(traceback.format_exc())
            raise

        conn.commit()
        print(
            f"[roster] {reference_code} — {len(real_participants)} real + {friend_count} bring-a-friend = {total} total | "
            f"{players_with_dupr}/{dupr_denominator} with DUPR ({dupr_pct}%)"
            + (f", regulars {returning_pct}%" if returning_pct is not None else ", regulars=NULL")
        )
        return {
            "dupr_participation_pct": dupr_pct,
            "total": total,
            "with_dupr": players_with_dupr,
            "returning_player_pct": returning_pct,
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
        print(f"[roster] run_roster_pass_for_day({scraped_date_str}): no reference_codes, skipping")
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
    skipped_phase1 = 0
    try:
        ph = ",".join(["%s"] * len(reference_codes))
        cur.execute(
            f"""
            SELECT
                s.id,
                s.reference_code,
                s.max_players,
                COALESCE(ds.joined, 0) AS joined
            FROM sessions s
            LEFT JOIN LATERAL (
                SELECT joined FROM daily_snapshots
                WHERE session_id = s.id
                ORDER BY scraped_at DESC
                LIMIT 1
            ) ds ON true
            WHERE s.scraped_date = %s
              AND s.reference_code IN ({ph})
            """,
            [scraped_date_str, *reference_codes],
        )
        for sid, ref, max_players, joined in cur.fetchall():
            # Phase 1: skip sessions that are too small to yield useful roster data
            if max_players < ROSTER_MIN_MAX_PLAYERS or joined < ROSTER_MIN_JOINED:
                skipped_phase1 += 1
                continue
            pairs.append((int(sid), str(ref)))
    finally:
        cur.close()
        conn.close()

    print(
        f"[roster] run_roster_pass_for_day({scraped_date_str}): "
        f"{len(reference_codes)} refs → {len(pairs)} eligible "
        f"(skipped {skipped_phase1} by Phase-1 filter: max_players<{ROSTER_MIN_MAX_PLAYERS} OR joined<{ROSTER_MIN_JOINED})"
        + (f", capped to {cap}" if cap is not None else "")
    )

    if cap is not None:
        pairs = pairs[:cap]

    delay = float(os.environ.get("ROSTER_SLEEP_SECONDS", "1"))
    success = 0
    failed = 0

    for session_id, ref in pairs:
        try:
            result = scrape_session_roster(url, session_id, ref, scraped_date_str)
            if result is not None:
                success += 1
            else:
                failed += 1
        except Exception as e:
            failed += 1
            print(f"[roster] ERROR: scrape failed for {ref} (session_id={session_id}): {type(e).__name__}: {e}")
        time.sleep(delay)

    print(
        f"[roster] run_roster_pass_for_day({scraped_date_str}) done — "
        f"{success} ok, {failed} failed out of {len(pairs)} sessions"
    )


