from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_path: str = "openkoutsi.db"
    # Set INIT_DB=true (env var) to run create_all on startup.
    # Safe for fresh installs. For existing databases use Alembic migrations instead.
    init_db: bool = False
    secret_key: str = "changeme-set-a-real-secret-in-env"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30
    file_storage_path: str = "uploads"
    frontend_url: str = "http://localhost:3000"
    api_url: str = "http://localhost:8000"

    # Phase 2
    strava_client_id: str = ""
    strava_client_secret: str = ""
    bridge_url: str = ""
    bridge_secret: str = ""


settings = Settings()
