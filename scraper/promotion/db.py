"""
DB helpers for the promotion module.

Follows the same psycopg2 connection pattern used in ingest.py:
  - Read DATABASE_URL from env (strip query string if present)
  - Use psycopg2.connect(DATABASE_URL) per operation
  - Commit/close after each write
"""
import os
import uuid
from datetime import datetime, date, timezone, timedelta

import psycopg2
import psycopg2.extras

VN_TZ = timezone(timedelta(hours=7))

_DATABASE_URL = os.environ.get("DATABASE_URL", "")
if _DATABASE_URL and "?" in _DATABASE_URL:
    _DATABASE_URL = _DATABASE_URL.split("?", 1)[0]


def _connect():
    if not _DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable not set")
    return psycopg2.connect(_DATABASE_URL)


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------

def get_session_data() -> dict:
    """
    Fetch today's evening (17:00+) competitive sessions.

    Competitive = skill_level_min >= 3.0  OR
                  (dupr_participation_pct >= 40 AND avg_dupr_doubles >= 3.0)

    Falls back to all evening sessions with decent fill rate if fewer than 3
    competitive sessions are found.

    Returns { competitive: [...], total: int, day_of_week: str }
    """
    now = datetime.now(VN_TZ)
    today = now.strftime("%Y-%m-%d")
    current_time = now.strftime("%H:%M")
    day_of_week = now.strftime("%A")

    conn = _connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        # Total active sessions today (for context, unrestricted)
        cur.execute(
            "SELECT COUNT(*) FROM sessions WHERE scraped_date = %s AND status = 'active' AND duration_min <= 360",
            (today,),
        )
        total = cur.fetchone()["count"]

        # Evening competitive sessions: start_time >= 17:00 AND not yet finished
        cur.execute("""
            SELECT
                s.id,
                s.name,
                s.start_time,
                s.end_time,
                s.max_players,
                s.fee_amount,
                s.skill_level_min,
                s.skill_level_max,
                c.name  AS club_name,
                c.slug  AS club_slug,
                v.name  AS venue_name,
                COALESCE(ds_latest.joined, 0)                              AS joined,
                GREATEST(s.max_players - COALESCE(ds_latest.joined, 0), 0) AS spots_left,
                sds.dupr_participation_pct,
                sds.avg_dupr_doubles
            FROM sessions s
            JOIN clubs c ON c.id = s.club_id
            LEFT JOIN venues v ON v.id = s.venue_id
            LEFT JOIN LATERAL (
                SELECT joined FROM daily_snapshots
                WHERE session_id = s.id ORDER BY scraped_at DESC LIMIT 1
            ) ds_latest ON true
            LEFT JOIN session_dupr_stats sds ON sds.session_id = s.id
            WHERE s.scraped_date = %s
              AND s.status = 'active'
              AND s.duration_min <= 360
              AND s.max_players > 0
              AND s.start_time >= '17:00'
              AND s.start_time >= %s
              AND (
                  s.skill_level_min >= 3.0
                  OR (
                      sds.dupr_participation_pct >= 40
                      AND sds.avg_dupr_doubles >= 3.0
                  )
              )
            ORDER BY s.start_time ASC
            LIMIT 20
        """, (today, current_time))
        competitive_rows = cur.fetchall()

        # Fallback: all evening sessions not yet finished, ordered by fill rate
        fallback_rows = []
        if len(competitive_rows) < 3:
            cur.execute("""
                SELECT
                    s.id,
                    s.name,
                    s.start_time,
                    s.end_time,
                    s.max_players,
                    s.fee_amount,
                    s.skill_level_min,
                    s.skill_level_max,
                    c.name  AS club_name,
                    c.slug  AS club_slug,
                    v.name  AS venue_name,
                    COALESCE(ds_latest.joined, 0)                              AS joined,
                    GREATEST(s.max_players - COALESCE(ds_latest.joined, 0), 0) AS spots_left,
                    sds.dupr_participation_pct,
                    sds.avg_dupr_doubles
                FROM sessions s
                JOIN clubs c ON c.id = s.club_id
                LEFT JOIN venues v ON v.id = s.venue_id
                LEFT JOIN LATERAL (
                    SELECT joined FROM daily_snapshots
                    WHERE session_id = s.id ORDER BY scraped_at DESC LIMIT 1
                ) ds_latest ON true
                LEFT JOIN session_dupr_stats sds ON sds.session_id = s.id
                WHERE s.scraped_date = %s
                  AND s.status = 'active'
                  AND s.duration_min <= 360
                  AND s.max_players > 0
                  AND s.start_time >= '17:00'
                  AND s.start_time >= %s
                ORDER BY
                    (COALESCE(ds_latest.joined, 0)::float / NULLIF(s.max_players, 0)) DESC,
                    s.start_time ASC
                LIMIT 20
            """, (today, current_time))
            fallback_rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    def row_to_dict(r) -> dict:
        avg_dupr = float(r["avg_dupr_doubles"] or 0)
        return {
            "name": r["name"],
            "start_time": r["start_time"],
            "club_name": r["club_name"],
            "venue_name": r["venue_name"] or r["club_name"],
            "spots_left": int(r["spots_left"]),
            "max_players": r["max_players"],
            "avg_dupr": round(avg_dupr, 1) if avg_dupr else None,
            "skill_min": r["skill_level_min"],
            "skill_max": r["skill_level_max"],
            "fee_amount": r["fee_amount"],
        }

    # Merge: competitive first, then fallback (deduplicated by session id)
    seen_ids = {r["id"] for r in competitive_rows}
    extra = [r for r in fallback_rows if r["id"] not in seen_ids]
    combined = list(competitive_rows) + extra

    competitive = [row_to_dict(r) for r in combined[:8]]

    return {
        "competitive": competitive,
        "total": int(total),
        "day_of_week": day_of_week,
    }


def get_club_spotlight() -> dict:
    """
    Rotate through top 20 clubs by player volume using a date-based index.
    Returns club data with member count, median DUPR, and top 3 DUPR buckets.
    """
    index = date.today().toordinal() % 20

    conn = _connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cutoff = (date.today().replace(day=1) - timedelta(days=1)).replace(day=1) - timedelta(days=60)
        cutoff_str = cutoff.isoformat()

        # Top 20 clubs by unique players in last 90 days
        cur.execute("""
            WITH top_clubs AS (
                SELECT
                    c.id,
                    c.name,
                    c.slug,
                    c.num_members,
                    COUNT(DISTINCT sr.user_id) AS player_count
                FROM clubs c
                JOIN sessions s ON s.club_id = c.id
                JOIN session_rosters sr ON sr.session_id = s.id
                WHERE s.scraped_date >= %s AND sr.is_confirmed = true
                GROUP BY c.id, c.name, c.slug, c.num_members
                ORDER BY player_count DESC
                LIMIT 20
            )
            SELECT * FROM top_clubs
            OFFSET %s LIMIT 1
        """, (cutoff_str, index))
        club = cur.fetchone()

        if not club:
            # Fallback: any club
            cur.execute("SELECT id, name, slug, num_members FROM clubs ORDER BY num_members DESC LIMIT 1")
            club = cur.fetchone()

        if not club:
            return {"name": "", "slug": "", "member_count": 0, "median_dupr": None, "top_dupr_buckets": []}

        club_id = club["id"]

        # DUPR distribution for this club (last 90 days, doubles only)
        cur.execute("""
            SELECT
                FLOOR(p.dupr_doubles::numeric * 10) / 10 AS bucket,
                COUNT(DISTINCT sr.user_id) AS player_count
            FROM session_rosters sr
            JOIN sessions s ON s.id = sr.session_id
            JOIN players p ON p.user_id = sr.user_id
            WHERE s.club_id = %s
              AND s.scraped_date >= %s
              AND p.dupr_doubles IS NOT NULL
              AND p.dupr_doubles > 0
              AND sr.is_confirmed = true
            GROUP BY bucket
            ORDER BY bucket
        """, (club_id, cutoff_str))
        buckets_raw = cur.fetchall()

        total_rated = sum(r["player_count"] for r in buckets_raw)
        buckets = [
            {
                "bucket": f"{float(r['bucket']):.1f}",
                "count": r["player_count"],
                "pct": round(r["player_count"] / total_rated * 100) if total_rated > 0 else 0,
            }
            for r in buckets_raw
        ]

        # Median DUPR
        all_vals = []
        for r in buckets_raw:
            all_vals.extend([float(r["bucket"])] * r["player_count"])
        median_dupr = None
        if all_vals:
            all_vals.sort()
            mid = len(all_vals) // 2
            median_dupr = (all_vals[mid - 1] + all_vals[mid]) / 2 if len(all_vals) % 2 == 0 else all_vals[mid]
            median_dupr = round(median_dupr, 1)

        # Top 3 buckets by count
        top_3 = sorted(buckets, key=lambda x: x["count"], reverse=True)[:3]

    finally:
        cur.close()
        conn.close()

    return {
        "name": club["name"],
        "slug": club["slug"],
        "member_count": club["num_members"],
        "median_dupr": median_dupr,
        "top_dupr_buckets": top_3,
        "total_rated_players": total_rated if buckets_raw else 0,
    }


def get_heatmap_data() -> dict:
    """
    Fetch top venues by unique player count for DUPR 3.0-3.5 band, last 90 days.
    Returns { top_venues: [{ name, player_count, sessions_90d }] }
    """
    cutoff_str = (date.today() - timedelta(days=90)).isoformat()

    conn = _connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT
                v.name AS venue_name,
                COUNT(DISTINCT sr.user_id) AS player_count,
                COUNT(DISTINCT s.id) AS sessions_90d
            FROM session_rosters sr
            JOIN sessions s ON s.id = sr.session_id
            JOIN venues v ON v.id = s.venue_id
            JOIN players p ON p.user_id = sr.user_id
            WHERE s.scraped_date >= %s
              AND sr.is_confirmed = true
              AND p.dupr_doubles >= 3.0
              AND p.dupr_doubles < 3.5
            GROUP BY v.id, v.name
            ORDER BY player_count DESC
            LIMIT 10
        """, (cutoff_str,))
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    return {
        "top_venues": [
            {
                "name": r["venue_name"],
                "player_count": r["player_count"],
                "sessions_90d": r["sessions_90d"],
            }
            for r in rows
        ]
    }


# ---------------------------------------------------------------------------
# Write helpers
# ---------------------------------------------------------------------------

def save_post(post_type: str, text: str, channel: str = "zalo_oa") -> str:
    """Save a generated post as pending. Returns the post id."""
    now = datetime.now(VN_TZ)
    post_id = str(uuid.uuid4())

    conn = _connect()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO content_posts (id, post_type, channel, generated_text, status, scheduled_date, created_at)
            VALUES (%s, %s, %s, %s, 'pending', %s, NOW())
        """, (post_id, post_type, channel, text, now.date()))
        conn.commit()
    finally:
        cur.close()
        conn.close()

    return post_id


def get_posts_to_send() -> list:
    """Fetch posts with status='approved' and post_now=True."""
    conn = _connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT id, post_type, channel, generated_text, status, scheduled_date
            FROM content_posts
            WHERE status = 'approved' AND post_now = true
            ORDER BY created_at ASC
        """)
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    return [dict(r) for r in rows]


def mark_post_sent(post_id: str):
    """Update post status to 'posted' and set posted_at to now."""
    conn = _connect()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE content_posts
            SET status = 'posted', posted_at = NOW(), post_now = false
            WHERE id = %s
        """, (post_id,))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def mark_post_error(post_id: str, error: str):
    """Update post status to 'error' and save the error message."""
    conn = _connect()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE content_posts
            SET status = 'error', error = %s, post_now = false
            WHERE id = %s
        """, (error[:2000], post_id))
        conn.commit()
    finally:
        cur.close()
        conn.close()


# ---------------------------------------------------------------------------
# LLM settings + usage logging
# ---------------------------------------------------------------------------

_DEFAULT_LLM_SETTINGS = {
    "model": "claude-haiku-4-5-20251001",
    "temperature": 0.7,
    "max_tokens": 1000,
    "monthly_budget_usd": 5.0,
}


def get_llm_settings() -> dict:
    """Read LLM model/temperature/max_tokens from admin_settings. Falls back to defaults."""
    conn = _connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT llm_model, temperature, max_tokens, monthly_budget_usd
            FROM admin_settings WHERE id = 'singleton'
        """)
        row = cur.fetchone()
    finally:
        cur.close()
        conn.close()

    if not row:
        return dict(_DEFAULT_LLM_SETTINGS)

    return {
        "model": row["llm_model"],
        "temperature": float(row["temperature"]),
        "max_tokens": int(row["max_tokens"]),
        "monthly_budget_usd": float(row["monthly_budget_usd"]),
    }


# Pricing per million tokens (input, output)
_MODEL_PRICING = {
    "claude-haiku-4-5-20251001": {"input": 0.80,  "output": 4.00},
    "claude-sonnet-4-6":          {"input": 3.00,  "output": 15.00},
    "claude-opus-4-6":            {"input": 15.00, "output": 75.00},
}


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate USD cost for a Claude API call."""
    p = _MODEL_PRICING.get(model, {"input": 3.00, "output": 15.00})
    return (input_tokens / 1_000_000 * p["input"]) + (output_tokens / 1_000_000 * p["output"])


def log_usage(model: str, input_tokens: int, output_tokens: int, post_type: str):
    """Insert a row into llm_usage_logs."""
    cost = calculate_cost(model, input_tokens, output_tokens)
    row_id = str(uuid.uuid4())

    conn = _connect()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO llm_usage_logs (id, model, input_tokens, output_tokens, cost_usd, post_type, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
        """, (row_id, model, input_tokens, output_tokens, cost, post_type))
        conn.commit()
    finally:
        cur.close()
        conn.close()

    return cost


def get_monthly_spend(year: int, month: int) -> float:
    """Return total cost_usd for the given year/month."""
    conn = _connect()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT COALESCE(SUM(cost_usd), 0)
            FROM llm_usage_logs
            WHERE EXTRACT(YEAR FROM created_at) = %s
              AND EXTRACT(MONTH FROM created_at) = %s
        """, (year, month))
        row = cur.fetchone()
    finally:
        cur.close()
        conn.close()

    return float(row[0]) if row else 0.0
