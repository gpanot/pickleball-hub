"""
Token refresh utility — called by cron on the 1st of every month.

Usage:
  python -m promotion.refresh_tokens

Zalo tokens are refreshed automatically.
Facebook long-lived tokens (60 days) must be refreshed manually.
Set a calendar reminder every 50 days, then update:
  FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_TOKEN_EXPIRY_DATE in Railway.
"""
import os
import requests

from .config import settings

ZALO_APP_ID = os.environ.get("ZALO_APP_ID", "")


def refresh_zalo_token():
    """Refresh Zalo OA access token using the refresh token."""
    if not settings.zalo_oa_refresh_token:
        print("ZALO_OA_REFRESH_TOKEN not set — skipping Zalo token refresh.", flush=True)
        return

    if not ZALO_APP_ID:
        print("ZALO_APP_ID not set — skipping Zalo token refresh.", flush=True)
        return

    url = "https://oauth.zaloapp.com/v4/oa/access_token"
    payload = {
        "refresh_token": settings.zalo_oa_refresh_token,
        "app_id": ZALO_APP_ID,
        "grant_type": "refresh_token",
    }
    response = requests.post(url, data=payload, timeout=15)
    result = response.json()

    if "access_token" in result:
        print(f"New Zalo access token: {result['access_token']}", flush=True)
        print("Update ZALO_OA_ACCESS_TOKEN in Railway manually.", flush=True)
        if "refresh_token" in result:
            print(f"New Zalo refresh token: {result['refresh_token']}", flush=True)
            print("Update ZALO_OA_REFRESH_TOKEN in Railway manually.", flush=True)
    else:
        print(f"Zalo token refresh failed: {result}", flush=True)


def remind_facebook_refresh():
    """Print a reminder about the Facebook token expiry."""
    print(
        "Facebook long-lived tokens expire every 60 days.\n"
        "  1. Go to: https://developers.facebook.com/tools/explorer/\n"
        "  2. Generate a new long-lived page token.\n"
        "  3. Update FACEBOOK_PAGE_ACCESS_TOKEN in Railway.\n"
        "  4. Update FACEBOOK_TOKEN_EXPIRY_DATE (YYYY-MM-DD) in Railway.",
        flush=True,
    )


if __name__ == "__main__":
    print("=== Monthly token refresh ===", flush=True)
    refresh_zalo_token()
    remind_facebook_refresh()
    print("=== Done ===", flush=True)
