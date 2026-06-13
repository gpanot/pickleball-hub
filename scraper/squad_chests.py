"""
Squad Chests — scraper integration.

Called after a session_roster row is inserted. If the player is an active
squad member, creates a chest for the squad (source='scraper').

CRITICAL GUARD: The UNIQUE constraint on (squad_id, earner_id, checkin_date) means
only ONE chest per player per calendar day (HCMC) regardless of source. If a check-in
already created a chest today, the scraper MUST skip entirely — not attempt to insert
and catch the violation.
"""

import os
import uuid
from datetime import datetime, timedelta, timezone

HCMC_TZ = timezone(timedelta(hours=7))


def create_squad_chest_if_member(conn, reclub_user_id: int, session_id: int):
    """
    Called after a session_roster row is inserted.
    If the player is an active squad member, creates a chest for the squad.
    """
    with conn.cursor() as cur:
        # 1. Resolve Reclub player → SQUADD profile + active squad
        cur.execute("""
            SELECT pp.id as profile_id, sm.squad_id
            FROM player_profiles pp
            JOIN squad_members sm ON sm.profile_id = pp.id
            WHERE pp.reclub_user_id = %s
              AND sm.left_at IS NULL
              AND sm.role IN ('founder', 'member')
            LIMIT 1
        """, (reclub_user_id,))
        row = cur.fetchone()
        if not row:
            return  # player not in a squad, skip silently

        profile_id = row[0]
        squad_id = row[1]

        # 2. Daily cap guard: check for ANY existing chest today (any source)
        # This is the anti-cheat gate. If a check-in already happened today,
        # the scraper must not create a second chest.
        today_hcmc = datetime.now(HCMC_TZ).date()
        cur.execute("""
            SELECT id FROM squad_chests
            WHERE squad_id = %s AND earner_id = %s
              AND checkin_date = %s
        """, (squad_id, profile_id, today_hcmc))
        if cur.fetchone():
            return  # chest already exists today (from checkin or prior scraper run)

        # 3. Create the chest
        chest_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=24)

        cur.execute("""
            INSERT INTO squad_chests (id, squad_id, earner_id, session_id, source, venue_name, checkin_date, created_at, expires_at)
            VALUES (%s, %s, %s, %s, 'scraper', NULL, %s, %s, %s)
        """, (chest_id, squad_id, profile_id, session_id, today_hcmc, now, expires_at))

        # 4. Create opening rows for all active members
        cur.execute("""
            SELECT profile_id FROM squad_members
            WHERE squad_id = %s AND left_at IS NULL
        """, (squad_id,))
        members = cur.fetchall()

        for member in members:
            cur.execute("""
                INSERT INTO squad_chest_openings (chest_id, profile_id, status)
                VALUES (%s, %s, 'pending')
                ON CONFLICT (chest_id, profile_id) DO NOTHING
            """, (chest_id, member[0]))

        conn.commit()

        # 5. Trigger push notification via API (fire-and-forget)
        import requests
        api_base = os.environ.get('API_BASE_URL', '')
        internal_secret = os.environ.get('INTERNAL_SECRET', '')
        if api_base:
            try:
                requests.post(
                    f"{api_base}/api/squads/chests/{chest_id}/notify-created",
                    headers={"X-Internal-Secret": internal_secret},
                    timeout=5
                )
            except Exception:
                pass  # push failure is non-blocking

            # 6. Award scraper bonus XP (+80)
            try:
                requests.post(
                    f"{api_base}/api/squads/{squad_id}/award-xp",
                    json={"source": "scraper_session", "profileId": profile_id, "amount": 80},
                    headers={"X-Internal-Secret": internal_secret},
                    timeout=5
                )
            except Exception:
                pass  # XP award failure is non-blocking
