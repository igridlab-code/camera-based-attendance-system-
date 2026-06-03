"""
Cameras Router - Camera management and streaming endpoints.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional



from app.database import get_db
from app.auth import get_current_admin, require_admin
from app.config import settings
from app.services.camera_service import camera_manager
from app import models, schemas

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cameras", tags=["Cameras"])


def _db_camera_to_schema(camera: models.Camera) -> schemas.CameraOut:
    return schemas.CameraOut(
        id=camera.id,
        name=camera.name,
        source_url=camera.source_url,
        camera_type=camera.camera_type,
        location=camera.location,
        is_active=camera.is_active,
        resolution=camera.resolution,
        fps=camera.fps,
        health_status=camera.health_status,
        last_online_at=camera.last_online_at,
        created_at=camera.created_at,
    )


@router.post("", response_model=schemas.CameraOut, dependencies=[Depends(require_admin)])
def create_camera(camera: schemas.CameraCreate, db: Session = Depends(get_db)):
    """Add a new camera."""
    db_camera = models.Camera(
        name=camera.name,
        source_url=camera.source_url,
        camera_type=camera.camera_type.value if hasattr(camera.camera_type, 'value') else camera.camera_type,
        location=camera.location,
        is_active=camera.is_active,
        resolution=camera.resolution,
        fps=camera.fps,
        flip_horizontal=camera.flip_horizontal,
        auto_exposure=camera.auto_exposure,
        detection_zone=camera.detection_zone or {},
        notes=camera.notes,
        health_status="unknown",
    )
    db.add(db_camera)
    db.commit()
    db.refresh(db_camera)
    
    logger.info(f"Camera added: {db_camera.name} ({db_camera.source_url})")
    return _db_camera_to_schema(db_camera)


@router.get("")
def list_cameras(
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    admin = Depends(get_current_admin)
):
    """List all cameras."""
    query = db.query(models.Camera)
    if is_active is not None:
        query = query.filter(models.Camera.is_active == is_active)
    
    cameras = query.all()
    return [_db_camera_to_schema(c) for c in cameras]


@router.get("/{camera_id}", response_model=schemas.CameraOut)
def get_camera(camera_id: int, db: Session = Depends(get_db), admin = Depends(get_current_admin)):
    """Get camera details."""
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return _db_camera_to_schema(camera)


@router.put("/{camera_id}", response_model=schemas.CameraOut, dependencies=[Depends(require_admin)])
def update_camera(camera_id: int, update: schemas.CameraUpdate, db: Session = Depends(get_db)):
    """Update camera configuration."""
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(camera, field):
            setattr(camera, field, value)
    
    db.commit()
    db.refresh(camera)
    
    # Restart stream if active
    if camera.is_active and camera_manager.get_camera_status(camera_id).get("connected"):
        camera_manager.remove_camera(camera_id)
        camera_manager.add_camera(
            camera_id=camera.id,
            name=camera.name,
            source_url=camera.source_url,
            resolution=camera.resolution,
            fps=camera.fps,
            flip_horizontal=camera.flip_horizontal,
        )
    
    return _db_camera_to_schema(camera)


@router.delete("/{camera_id}", dependencies=[Depends(require_admin)])
def delete_camera(camera_id: int, db: Session = Depends(get_db)):
    """Delete a camera."""
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Stop stream if active
    camera_manager.remove_camera(camera_id)
    
    db.delete(camera)
    db.commit()
    
    logger.info(f"Camera deleted: {camera.name}")
    return {"success": True, "message": "Camera deleted"}


@router.post("/{camera_id}/test", response_model=schemas.CameraTestResponse)
def test_camera_connection(camera_id: int, db: Session = Depends(get_db), admin = Depends(get_current_admin)):
    """Test camera connection."""
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    result = camera_manager.test_camera(camera.source_url)
    
    # Update health status
    camera.health_status = "online" if result["success"] else "offline"
    if result["success"]:
        camera.last_online_at = func.now()
    db.commit()
    
    return schemas.CameraTestResponse(**result)


@router.post("/{camera_id}/start", dependencies=[Depends(require_admin)])
def start_camera_stream(camera_id: int, db: Session = Depends(get_db)):
    """Start camera streaming."""
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    status = camera_manager.get_camera_status(camera_id)
    if status.get("connected"):
        return {"success": True, "message": "Camera already streaming"}
    
    camera_manager.add_camera(
        camera_id=camera.id,
        name=camera.name,
        source_url=camera.source_url,
        resolution=camera.resolution,
        fps=camera.fps,
        flip_horizontal=camera.flip_horizontal,
    )
    
    return {"success": True, "message": "Camera stream started"}


@router.post("/{camera_id}/stop", dependencies=[Depends(require_admin)])
def stop_camera_stream(camera_id: int, db: Session = Depends(get_db)):
    """Stop camera streaming."""
    camera_manager.remove_camera(camera_id)
    return {"success": True, "message": "Camera stream stopped"}


@router.get("/{camera_id}/frame")
def get_camera_frame(camera_id: int, db: Session = Depends(get_db), admin = Depends(get_current_admin)):
    """Get a single frame from camera as base64 JPEG."""
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    frame_b64 = camera_manager.get_frame_base64(camera_id)
    if frame_b64 is None:
        raise HTTPException(status_code=503, detail="Camera not available")
    
    return {"frame": frame_b64, "timestamp": func.now()}


@router.get("/{camera_id}/status")
def get_camera_status(camera_id: int, db: Session = Depends(get_db), admin = Depends(get_current_admin)):
    """Get camera streaming status."""
    return camera_manager.get_camera_status(camera_id)


@router.get("/status/all")
def get_all_camera_status(db: Session = Depends(get_db), admin = Depends(get_current_admin)):
    """Get status of all camera streams."""
    return camera_manager.get_all_status()
