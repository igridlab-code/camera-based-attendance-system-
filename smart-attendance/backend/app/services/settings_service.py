"""
Smart Attendance System - Settings Service
Manages dynamic system configurations stored in the database.
"""
from typing import Any, Dict
import json
from sqlalchemy.orm import Session
from app import models
from app.database import SessionLocal

# Default configurations
DEFAULT_SETTINGS = {
    "attendance_interval": 40,
    "class_start_time": "09:00",
    "late_threshold_minutes": 10,
    "recognition_confidence_threshold": 0.65,
    "session_duration_hours": 8,
    "attendance_mode": "full_day",
}

def get_all_settings(db: Session) -> Dict[str, Any]:
    """Retrieve all dynamic settings from the database, fallback to defaults."""
    configs = db.query(models.SystemConfig).all()
    config_map = {c.config_key: c.config_value for c in configs}
    
    settings = {}
    for key, default_val in DEFAULT_SETTINGS.items():
        if key in config_map:
            try:
                # Try to parse as JSON for numbers/booleans, fallback to string
                settings[key] = json.loads(config_map[key])
            except (json.JSONDecodeError, TypeError):
                settings[key] = config_map[key]
        else:
            settings[key] = default_val
            
    return settings

def get_setting(db: Session, key: str, default: Any = None) -> Any:
    """Retrieve a single setting."""
    config = db.query(models.SystemConfig).filter(models.SystemConfig.config_key == key).first()
    if config:
        try:
            return json.loads(config.config_value)
        except (json.JSONDecodeError, TypeError):
            return config.config_value
    return default if default is not None else DEFAULT_SETTINGS.get(key)

def get_setting_threadsafe(key: str, default: Any = None) -> Any:
    """Thread-safe variant for background loops without an active session."""
    db = SessionLocal()
    try:
        return get_setting(db, key, default)
    finally:
        db.close()

def update_settings(db: Session, new_settings: Dict[str, Any]):
    """Update multiple settings in the database."""
    for key, value in new_settings.items():
        if key not in DEFAULT_SETTINGS:
            continue  # Only allow known settings
            
        config = db.query(models.SystemConfig).filter(models.SystemConfig.config_key == key).first()
        str_value = json.dumps(value) if not isinstance(value, str) else value
        
        if config:
            config.config_value = str_value
        else:
            new_config = models.SystemConfig(config_key=key, config_value=str_value)
            db.add(new_config)
            
    db.commit()
