"""
Application Configuration — Environment & Settings
Centralizes all config from .env with Pydantic Settings for validation.
"""
import os
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings

# Resolve paths relative to backend/ directory
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # --- Core ---
    APP_NAME: str = "NPS Digital Onboarding API"
    APP_VERSION: str = "2.0.0-PROD"
    DEBUG: bool = False

    # --- Database ---
    DATABASE_URL: str = f"sqlite:///{BASE_DIR / 'data' / 'nps_onboarding.db'}"

    # --- AI / OCR ---
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash-latest"
    OCR_CONFIDENCE_THRESHOLD: int = 85

    # --- Security ---
    SECRET_KEY: str = "nps-onboarding-secret-key-change-in-production"
    SESSION_EXPIRY_MINUTES: int = 30
    CORS_ORIGINS: list[str] = ["*"]

    # --- PFRDA Compliance ---
    CKYC_UPLOAD_DEADLINE_DAYS: int = 10
    PRAN_PREFIX: str = "1100"

    # --- Logging ---
    LOG_DIR: str = str(BASE_DIR / "logs")

    class Config:
        env_file = str(BASE_DIR / ".env")
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
