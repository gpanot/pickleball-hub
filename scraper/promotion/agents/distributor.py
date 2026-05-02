"""Zalo OA and Facebook poster with mock mode support."""
import requests
from datetime import datetime, date

from ..config import settings


def check_facebook_token_expiry():
    """Log a warning if Facebook token expires within 10 days."""
    if not settings.facebook_token_expiry:
        return
    expiry = date.fromisoformat(settings.facebook_token_expiry)
    days_left = (expiry - date.today()).days
    if days_left <= 10:
        print(
            f"WARNING: Facebook Page token expires in {days_left} days. "
            "Refresh manually and update FACEBOOK_PAGE_ACCESS_TOKEN + "
            "FACEBOOK_TOKEN_EXPIRY_DATE in Railway.",
            flush=True,
        )


def post_to_zalo_oa(message: str) -> dict:
    if settings.mock_posting:
        print(f"[MOCK ZALO OA]\n{message}\n", flush=True)
        return {"mock": True, "status": "ok"}

    url = "https://openapi.zalo.me/v2.0/oa/message/broadcast"
    headers = {"access_token": settings.zalo_oa_access_token}
    payload = {
        "recipient": {"message_tag": "CONFIRMED_EVENT_UPDATE"},
        "message": {"text": message},
    }
    response = requests.post(url, json=payload, headers=headers, timeout=15)
    result = response.json()
    if result.get("error"):
        raise Exception(f"Zalo OA error: {result}")
    return result


def post_to_facebook(message: str) -> dict:
    if settings.mock_posting:
        print(f"[MOCK FACEBOOK]\n{message}\n", flush=True)
        return {"mock": True, "status": "ok"}

    url = f"https://graph.facebook.com/v19.0/{settings.facebook_page_id}/feed"
    payload = {
        "message": message,
        "access_token": settings.facebook_page_token,
    }
    response = requests.post(url, data=payload, timeout=15)
    result = response.json()
    if "error" in result:
        raise Exception(f"Facebook error: {result}")
    return result
