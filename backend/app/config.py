"""Application configuration, loaded from the repo-root `.env`.

The `.env` holds the owner's Azure Postgres connection (and later the OTP/LLM
provider keys). It lives at the repository root and is gitignored; only
`.env.example` is committed.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# app/config.py -> app -> backend -> <repo root>
REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",  # the .env also carries PG* parts + provider keys we don't read here
    )

    # --- Database ---
    # The owner's .env stores a libpq-style URL (postgresql://...). SQLAlchemy needs
    # an explicit driver; `sqlalchemy_url` normalizes it to postgresql+psycopg://.
    DATABASE_URL: str

    # --- Runtime ---
    ENV: str = "dev"
    # Web app origins allowed by CORS (comma-separated in env).
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # --- Auth / OTP ---
    SESSION_TTL_DAYS: int = 30
    PAT_TTL_DAYS: int = 365  # Personal Access Tokens are long-lived (MCP)
    OTP_TTL_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5
    OTP_LENGTH: int = 6
    # Per-identifier / per-IP request-code rate limit (dev, in-memory).
    OTP_RATE_MAX: int = 5
    OTP_RATE_WINDOW_SECONDS: int = 300
    # In dev, echo the generated code in the API response so testing needs no
    # SMS/email provider. MUST be false in any real environment.
    DEV_OTP_ECHO: bool = True

    # --- Email delivery (Azure Communication Services) ---
    # Both a connection string and a verified sender enable real OTP email.
    # If either is blank, OTP delivery falls back to logging the code (dev), so
    # local testing needs no provider. Set both in prod (Key Vault → env).
    ACS_EMAIL_CONNECTION_STRING: str = ""
    ACS_EMAIL_SENDER: str = ""  # e.g. DoNotReply@<your-verified-domain>
    # Product name used in the OTP email subject/body.
    APP_NAME: str = "Project Management"

    # --- AI / chat agent (Phase 2) ---
    # Gemini API key (Google AI Studio). Blank disables the chat agent; /chat
    # then returns a clear "AI not configured" error instead of failing obscurely.
    GEMINI_API_KEY: str = ""
    # `-latest` alias tracks the current stable Gemini Flash (older pinned names
    # like gemini-2.5-flash are blocked for new keys). Pin via env if you need to.
    GEMINI_MODEL: str = "gemini-flash-latest"
    # Live (real-time voice) model — native-audio, bidirectional streaming.
    GEMINI_LIVE_MODEL: str = "gemini-2.5-flash-native-audio-latest"
    # Safety cap on the tool-calling loop (tool round-trips per user message).
    AGENT_MAX_STEPS: int = 8

    # --- Retrieval / "ask anything" (A1) ---
    GEMINI_EMBED_MODEL: str = "gemini-embedding-001"
    EMBED_DIM: int = 768  # <=2000 so it's indexable by pgvector hnsw/ivfflat
    # Embed content inline on create/update (best-effort). Turn off to rely only
    # on the reindex script if embedding quota becomes a constraint.
    RETRIEVAL_INLINE_INDEX: bool = True

    @property
    def ai_enabled(self) -> bool:
        return bool(self.GEMINI_API_KEY.strip())

    @property
    def email_enabled(self) -> bool:
        """True when ACS email is configured; otherwise OTP delivery dev-logs."""
        return bool(
            self.ACS_EMAIL_CONNECTION_STRING.strip() and self.ACS_EMAIL_SENDER.strip()
        )

    @property
    def is_dev(self) -> bool:
        return self.ENV.lower() in {"dev", "development", "local"}

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def sqlalchemy_url(self) -> str:
        """DATABASE_URL with an explicit psycopg (v3) driver for SQLAlchemy."""
        url = self.DATABASE_URL
        if url.startswith("postgresql+"):
            return url
        if url.startswith("postgresql://"):
            return "postgresql+psycopg://" + url[len("postgresql://") :]
        if url.startswith("postgres://"):
            return "postgresql+psycopg://" + url[len("postgres://") :]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
