"""
Promotion main entry point.

Usage (cron):
  python -m promotion.main

Usage (forced, all types):
  python -m promotion.main --force

Usage (forced, specific type):
  python -m promotion.main --force --type competitive_tonight
  python -m promotion.main --force --type club_spotlight
  python -m promotion.main --force --type heatmap_weekly

Cron schedule:
  6am VN  → save club spotlight + heatmap (Mondays only)
  3pm VN  → save competitive tonight post
  Both runs: flush any approved post_now=True posts.
"""
import sys
from datetime import datetime, timezone, timedelta

from .agents.content import generate_posts
from .agents.distributor import check_facebook_token_expiry, post_to_zalo_oa, post_to_facebook
from .db import (
    get_session_data,
    get_club_spotlight,
    get_heatmap_data,
    save_post,
    get_posts_to_send,
    mark_post_sent,
    mark_post_error,
)

VN_TZ = timezone(timedelta(hours=7))

VALID_TYPES = {"competitive_tonight", "club_spotlight", "heatmap_weekly"}


def _parse_args():
    force = "--force" in sys.argv
    post_type = None
    if "--type" in sys.argv:
        idx = sys.argv.index("--type")
        if idx + 1 < len(sys.argv):
            post_type = sys.argv[idx + 1]
    return force, post_type


def run(force: bool = False, post_type: str | None = None):
    now = datetime.now(VN_TZ)
    hour = now.hour
    is_monday = now.weekday() == 0

    print(
        f"\n=== Promotion run — {now.strftime('%A %Y-%m-%d %H:%M')} VN "
        f"(hour={hour}, force={force}, type={post_type}) ===",
        flush=True,
    )

    check_facebook_token_expiry()

    # Determine which post types to generate
    if force:
        if post_type:
            if post_type not in VALID_TYPES:
                raise ValueError(f"Unknown post type: {post_type!r}. Valid: {VALID_TYPES}")
            generate_competitive = post_type == "competitive_tonight"
            generate_club       = post_type == "club_spotlight"
            generate_heatmap    = post_type == "heatmap_weekly"
        else:
            # --force without --type: generate everything
            generate_competitive = True
            generate_club        = True
            generate_heatmap     = True
    else:
        generate_competitive = (hour == 15)
        generate_club        = (hour == 6)
        generate_heatmap     = (hour == 6 and is_monday)

    if not (generate_competitive or generate_club or generate_heatmap):
        print("  Nothing to generate at this hour — skipping content generation.", flush=True)
    else:
        print("  Fetching data...", flush=True)
        session_data = get_session_data()
        club_data    = get_club_spotlight()
        heatmap_data = get_heatmap_data()
        print(
            f"  {session_data['total']} sessions, "
            f"{len(session_data['competitive'])} competitive, "
            f"club: {club_data.get('name', '(none)')}, "
            f"{len(heatmap_data['top_venues'])} heatmap venues",
            flush=True,
        )

        # generate_posts always generates all three, budget/block is checked inside
        print("  Generating posts via Claude...", flush=True)
        # Pass is_monday=True when forcing heatmap so Claude produces the weekly post
        effective_monday = is_monday or generate_heatmap
        posts = generate_posts(session_data, club_data, heatmap_data, effective_monday)
        print("  Posts generated.", flush=True)

        if generate_club:
            print("  Saving club spotlight posts...", flush=True)
            for channel in ("zalo_oa", "facebook"):
                pid = save_post("club_spotlight", posts["club_spotlight"], channel)
                print(f"    Saved club_spotlight/{channel} → {pid}", flush=True)

        if generate_heatmap and posts.get("heatmap_weekly"):
            print("  Saving heatmap posts...", flush=True)
            for channel in ("zalo_oa", "facebook"):
                pid = save_post("heatmap_weekly", posts["heatmap_weekly"], channel)
                print(f"    Saved heatmap_weekly/{channel} → {pid}", flush=True)

        if generate_competitive:
            print("  Saving competitive tonight posts...", flush=True)
            for channel in ("zalo_oa", "facebook"):
                pid = save_post("competitive_tonight", posts["competitive_tonight"], channel)
                print(f"    Saved competitive_tonight/{channel} → {pid}", flush=True)

    # Flush any approved post_now=True posts regardless of force/type
    pending = get_posts_to_send()
    if pending:
        print(f"  Sending {len(pending)} approved post(s)...", flush=True)
    for post in pending:
        try:
            if post["channel"] == "zalo_oa":
                post_to_zalo_oa(post["generated_text"])
            elif post["channel"] == "facebook":
                post_to_facebook(post["generated_text"])
            mark_post_sent(post["id"])
            print(f"  Posted: {post['post_type']} to {post['channel']}", flush=True)
        except Exception as e:
            mark_post_error(post["id"], str(e))
            print(f"  Error posting {post['id']}: {e}", flush=True)

    print("=== Promotion run done ===\n", flush=True)


if __name__ == "__main__":
    force, post_type = _parse_args()
    run(force=force, post_type=post_type)
