"""Claude API content generator for social media posts."""
import anthropic
import json
from datetime import datetime, timezone, timedelta

from ..config import settings
from ..db import get_llm_settings, log_usage, get_monthly_spend

VN_TZ = timezone(timedelta(hours=7))


def _budget_blocked(llm: dict) -> bool:
    """Return True if monthly spend has reached or exceeded the configured budget."""
    now = datetime.now(VN_TZ)
    spend = get_monthly_spend(now.year, now.month)
    budget = llm.get("monthly_budget_usd", 5.0)
    return spend >= budget


def generate_posts(session_data: dict, club_data: dict, heatmap_data: dict, is_monday: bool) -> dict:
    llm = get_llm_settings()

    if _budget_blocked(llm):
        now = datetime.now(VN_TZ)
        spend = get_monthly_spend(now.year, now.month)
        raise RuntimeError(
            f"Monthly LLM budget reached (${spend:.4f} / ${llm['monthly_budget_usd']:.2f}). "
            "Update your budget in /admin/settings or wait until next month."
        )

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    prompt = f"""
You generate social media content for Pickleball Hub ({settings.base_url}),
a session discovery platform for Vietnamese pickleball players in Ho Chi Minh City.

Today's data:
- Competitive sessions tonight: {json.dumps(session_data['competitive'][:5])}
- Club spotlight: {json.dumps(club_data)}
- Top heatmap venues (DUPR 3.0-3.5): {json.dumps(heatmap_data['top_venues'][:5])}
- Day of week: {session_data['day_of_week']}
- Total sessions today: {session_data['total']}
- Is Monday: {is_monday}

Generate 3 posts entirely in Vietnamese:

POST 1 — "competitive_tonight" (posted daily at 3pm)
For players looking for a competitive session tonight.
Lead with the sessions, never with the platform name.
Format: emoji header, date in Vietnamese, 3 sessions each on one line with
time / venue name / spots left / score rating, link at the very end.
Example line: "19:00 - An Phu Sports Park - còn 3 chỗ - ★78"

POST 2 — "club_spotlight" (posted every 2 days)
Highlight one club as a discovery tool for players looking to level up.
Tone: like a knowledgeable community member sharing insider knowledge,
not a platform announcement.
Include: club name, member count, median DUPR, top 3 DUPR buckets with
rough percentages, link to club page at {settings.base_url}/clubs/[slug].
Never use the word "algorithm" or "data".

POST 3 — "heatmap_weekly" (Monday only — return empty string if not Monday)
Show where DUPR 3.0-3.5 players are most active this week.
List top 5 venues with player counts.
Tone: "here's where the good players are going" — discovery framing.
End with: {settings.base_url}/heatmap

Rules for all posts:
- All text in Vietnamese
- No exclamation marks — confident, informative tone
- Never start with the platform name
- Keep each post under 300 characters for Zalo readability
- Link format: {settings.base_url} — no https prefix in the text

Return ONLY valid JSON with exactly these keys:
{{
  "competitive_tonight": "...",
  "club_spotlight": "...",
  "heatmap_weekly": ""
}}
No markdown, no preamble, no explanation outside the JSON.
"""

    response = client.messages.create(
        model=llm["model"],
        max_tokens=llm["max_tokens"],
        temperature=llm["temperature"],
        messages=[{"role": "user", "content": prompt}]
    )

    # Log usage immediately after the API call
    try:
        log_usage(
            model=llm["model"],
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            post_type="content_generation",
        )
    except Exception as e:
        print(f"  [usage_log] WARNING: failed to log usage: {e}", flush=True)

    raw = response.content[0].text.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())
