from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "Qira - Testing Agent"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/testing_agent"

    # GitHub OAuth
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI: str = "http://localhost:8000/api/auth/github/callback"

    # AI
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    # OpenAI-compatible endpoint for Gemini models
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai/"

    # Playwright
    PLAYWRIGHT_BROWSERS_PATH: str = ""
    HEADLESS: bool = True

    # Auth
    SECRET_KEY: str = "change-me-to-a-real-secret-key"
    ALGORITHM: str = "HS256"
    # 8h base lifetime; the frontend slides this forward on activity via
    # /api/auth/refresh, so active users are not forced to re-login mid-session.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    class Config:
        env_file = ".env"
        extra = "ignore"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Ensure async driver is always used
        if self.DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in self.DATABASE_URL:
            self.DATABASE_URL = self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
        if self.DATABASE_URL.startswith("postgresql+psycopg2://"):
            self.DATABASE_URL = self.DATABASE_URL.replace("postgresql+psycopg2://", "postgresql+asyncpg://")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def frontend_url(self) -> str:
        origins = self.cors_origins
        return origins[0].rstrip("/") if origins else "http://localhost:5173"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
