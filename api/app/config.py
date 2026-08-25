"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    secret_key: str = "dev-only-change-me"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8081,http://127.0.0.1:8081"
    )
    algorithm: str = "HS256"

    # Public URLs used for OAuth redirects (no trailing slash).
    frontend_url: str = "http://localhost:5173"
    api_public_url: str = "http://localhost:8000"

    # Social login — leave unset to hide that provider in the UI.
    google_client_id: str = ""
    google_client_secret: str = ""
    facebook_app_id: str = ""
    facebook_app_secret: str = ""

    # When true, expose a local "dev" OAuth provider for tests / local demos.
    oauth_dev_mode: bool = False

    # Password reset link lifetime.
    password_reset_expire_minutes: int = 60

    # Resend (https://resend.com) for password-reset email. Both must be set
    # for Forgot password to reach a real inbox. Unset = log only (dev/tests).
    resend_api_key: str = ""
    resend_from: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sqlalchemy_database_url(self) -> str:
        """Normalize postgres URLs for SQLAlchemy + psycopg2."""
        url = self.database_url
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://") :]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
