from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any

from app.database import get_db
from app.services import settings_service

router = APIRouter(prefix="/settings", tags=["settings"])

@router.get("/")
def get_settings(db: Session = Depends(get_db)):
    """Retrieve system settings."""
    return settings_service.get_all_settings(db)

@router.put("/")
def update_settings(settings: Dict[str, Any], db: Session = Depends(get_db)):
    """Update system settings."""
    settings_service.update_settings(db, settings)
    return settings_service.get_all_settings(db)
