"""Application settings loaded from environment variables."""

import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_cors() -> list[str]:
    if os.getenv("VERCEL"):
        return ["*"]
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
    ]


class Settings(BaseSettings):
    """Runtime configuration for the FastAPI service."""

    model_config = SettingsConfigDict(env_prefix="LSP_", env_file=".env", extra="ignore")

    host: str = Field(default="127.0.0.1", description="Bind address for uvicorn.")
    port: int = Field(default=5000, description="Listen port for uvicorn.")
    cors_origins: list[str] = Field(default_factory=_default_cors)
    log_json: bool = Field(default=False, description="Emit JSON structured logs.")
    static_dir: Path | None = Field(
        default=None,
        description="Optional path to built frontend (frontend/dist).",
    )
    use_igraph: bool = Field(
        default=False,
        description="Reserved switch for optional igraph backend (not enabled in OSS build).",
    )


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""

    return Settings()
