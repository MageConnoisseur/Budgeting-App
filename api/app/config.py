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
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    algorithm: str = "HS256"

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
