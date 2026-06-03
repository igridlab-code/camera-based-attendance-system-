"""
Smart Attendance System - Configuration
Production-grade configuration with environment variable support.
"""

import os
from pathlib import Path
from functools import lru_cache

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"
SNAPSHOTS_DIR = BASE_DIR / "snapshots"

for d in [DATA_DIR, MODELS_DIR, SNAPSHOTS_DIR]:
    d.mkdir(exist_ok=True)


class Settings:
    """Application settings loaded from environment variables."""

    # App
    APP_NAME: str = "Smart Attendance AI"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "smart-attendance-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    PASSWORD_MIN_LENGTH: int = 6

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{DATA_DIR}/attendance.db"
    )
    DATABASE_POOL_SIZE: int = int(os.getenv("DATABASE_POOL_SIZE", "20"))
    DATABASE_MAX_OVERFLOW: int = int(os.getenv("DATABASE_MAX_OVERFLOW", "40"))

    # CORS
    CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]

    # AI / Face Recognition
    FACE_DETECTION_THRESHOLD: float = float(os.getenv("FACE_DETECTION_THRESHOLD", "0.5"))
    FACE_RECOGNITION_THRESHOLD: float = float(os.getenv("FACE_RECOGNITION_THRESHOLD", "0.45"))
    LIVENESS_THRESHOLD: float = float(os.getenv("LIVENESS_THRESHOLD", "0.6"))
    FACE_EMBEDDING_DIM: int = 512
    MAX_FACE_SAMPLES_PER_USER: int = 10
    FACE_SIMILARITY_TOP_K: int = int(os.getenv("FACE_SIMILARITY_TOP_K", "5"))

    # Camera
    CAMERA_DEFAULT_FPS: int = int(os.getenv("CAMERA_DEFAULT_FPS", "30"))
    CAMERA_DEFAULT_RESOLUTION: str = os.getenv("CAMERA_DEFAULT_RESOLUTION", "640x480")
    CAMERA_BUFFER_SIZE: int = int(os.getenv("CAMERA_BUFFER_SIZE", "4"))
    MAX_CAMERAS: int = int(os.getenv("MAX_CAMERAS", "16"))
    FRAME_PROCESSING_SKIP: int = int(os.getenv("FRAME_PROCESSING_SKIP", "2"))

    # Attendance
    ATTENDANCE_COOLDOWN_MINUTES: int = int(os.getenv("ATTENDANCE_COOLDOWN_MINUTES", "5"))
    ATTENDANCE_START_TIME: str = os.getenv("ATTENDANCE_START_TIME", "09:00")
    ATTENDANCE_END_TIME: str = os.getenv("ATTENDANCE_END_TIME", "18:00")
    LATE_THRESHOLD_MINUTES: int = int(os.getenv("LATE_THRESHOLD_MINUTES", "15"))

    # Notifications
    ENABLE_EMAIL_ALERTS: bool = os.getenv("ENABLE_EMAIL_ALERTS", "false").lower() == "true"
    ENABLE_SMS_ALERTS: bool = os.getenv("ENABLE_SMS_ALERTS", "false").lower() == "true"
    ENABLE_TELEGRAM_ALERTS: bool = os.getenv("ENABLE_TELEGRAM_ALERTS", "false").lower() == "true"
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    ALERT_EMAIL: str = os.getenv("ALERT_EMAIL", "")
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")

    # Paths
    FACE_MODELS_PATH: Path = MODELS_DIR
    SNAPSHOTS_PATH: Path = SNAPSHOTS_DIR

    # Performance
    ENABLE_GPU: bool = os.getenv("ENABLE_GPU", "true").lower() == "true"
    INFERENCE_BATCH_SIZE: int = int(os.getenv("INFERENCE_BATCH_SIZE", "1"))
    MAX_WORKERS: int = int(os.getenv("MAX_WORKERS", "4"))

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
