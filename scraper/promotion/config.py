"""Environment variable config for the promotion module."""
import os


class Settings:
    anthropic_api_key: str      = os.environ["ANTHROPIC_API_KEY"]
    zalo_oa_access_token: str   = os.environ["ZALO_OA_ACCESS_TOKEN"]
    zalo_oa_refresh_token: str  = os.environ.get("ZALO_OA_REFRESH_TOKEN", "")
    facebook_page_token: str    = os.environ["FACEBOOK_PAGE_ACCESS_TOKEN"]
    facebook_page_id: str       = os.environ["FACEBOOK_PAGE_ID"]
    facebook_token_expiry: str  = os.environ.get("FACEBOOK_TOKEN_EXPIRY_DATE", "")
    admin_secret: str           = os.environ["ADMIN_SECRET"]
    base_url: str               = os.environ.get("BASE_URL", "https://hub.thecourtflow.com")
    mock_posting: bool          = os.environ.get("MOCK_POSTING", "false").lower() == "true"


settings = Settings()
