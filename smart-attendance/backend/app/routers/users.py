"""
Users Router - User registration, face capture, and management.
"""

import base64
import pickle
import logging
import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import Optional, List

from app.database import get_db
from app.auth import get_current_admin, require_admin
from app.config import settings
from app.services.face_service import face_service
from app import models, schemas

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["Users"])


def _save_snapshot(image_data: bytes, prefix: str = "face") -> str:
    """Save image to snapshots directory."""
    filename = f"{prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.jpg"
    filepath = settings.SNAPSHOTS_PATH / filename
    with open(filepath, "wb") as f:
        f.write(image_data)
    return str(filepath)


@router.post("", response_model=schemas.UserOut, dependencies=[Depends(require_admin)])
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    """Register a new user."""
    # Check for duplicate employee_id
    existing = db.query(models.User).filter(models.User.employee_id == user.employee_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Employee ID '{user.employee_id}' already exists")
    
    db_user = models.User(
        full_name=user.full_name,
        employee_id=user.employee_id,
        department=user.department,
        email=user.email,
        phone=user.phone,
        role=user.role.value if hasattr(user.role, 'value') else user.role,
        is_active=user.is_active,
        metadata_json=user.metadata_json or {},
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    logger.info(f"User registered: {db_user.full_name} ({db_user.employee_id})")
    
    return schemas.UserOut(
        id=db_user.id,
        full_name=db_user.full_name,
        employee_id=db_user.employee_id,
        department=db_user.department,
        email=db_user.email,
        phone=db_user.phone,
        role=db_user.role,
        is_active=db_user.is_active,
        created_at=db_user.created_at,
        face_samples_count=0,
    )


@router.get("", response_model=schemas.UserListResponse)
def list_users(
    search: Optional[str] = None,
    department: Optional[str] = None,
    is_active: Optional[bool] = None,
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    admin = Depends(get_current_admin)
):
    """List all users with filtering."""
    query = db.query(models.User)
    
    if search:
        query = query.filter(
            or_(
                models.User.full_name.ilike(f"%{search}%"),
                models.User.employee_id.ilike(f"%{search}%"),
                models.User.email.ilike(f"%{search}%"),
            )
        )
    
    if department:
        query = query.filter(models.User.department == department)
    
    if is_active is not None:
        query = query.filter(models.User.is_active == is_active)
    
    total = query.count()
    
    # Get face sample counts
    users = query.offset((page - 1) * page_size).limit(page_size).all()
    
    results = []
    for u in users:
        face_count = db.query(func.count(models.FaceEmbedding.id)).filter(
            models.FaceEmbedding.user_id == u.id
        ).scalar() or 0
        
        results.append(schemas.UserOut(
            id=u.id,
            full_name=u.full_name,
            employee_id=u.employee_id,
            department=u.department,
            email=u.email,
            phone=u.phone,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at,
            face_samples_count=face_count,
        ))
    
    return schemas.UserListResponse(items=results, total=total, page=page, page_size=page_size)


@router.get("/{user_id}", response_model=schemas.UserDetailOut)
def get_user(user_id: int, db: Session = Depends(get_db), admin = Depends(get_current_admin)):
    """Get user details with face samples."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    face_samples = [
        schemas.FaceSampleOut(
            id=emb.id,
            sample_type=emb.sample_type,
            quality_score=emb.quality_score,
            created_at=emb.created_at,
        )
        for emb in user.face_embeddings
    ]
    
    return schemas.UserDetailOut(
        id=user.id,
        full_name=user.full_name,
        employee_id=user.employee_id,
        department=user.department,
        email=user.email,
        phone=user.phone,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        face_samples_count=len(face_samples),
        face_embeddings=face_samples,
        metadata_json=user.metadata_json,
    )


@router.put("/{user_id}", response_model=schemas.UserOut, dependencies=[Depends(require_admin)])
def update_user(user_id: int, update: schemas.UserUpdate, db: Session = Depends(get_db)):
    """Update user information."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    
    db.commit()
    db.refresh(user)
    
    return schemas.UserOut(
        id=user.id,
        full_name=user.full_name,
        employee_id=user.employee_id,
        department=user.department,
        email=user.email,
        phone=user.phone,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        face_samples_count=len(user.face_embeddings),
    )


@router.delete("/{user_id}", dependencies=[Depends(require_admin)])
def delete_user(user_id: int, db: Session = Depends(get_db)):
    """Delete a user and all associated data."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Remove from recognition index
    face_service.remove_user_from_index(user_id)
    
    db.delete(user)
    db.commit()
    
    logger.info(f"User deleted: {user.full_name} ({user.employee_id})")
    return {"success": True, "message": "User deleted successfully"}


@router.post("/{user_id}/capture-face", response_model=schemas.FaceCaptureResponse, dependencies=[Depends(require_admin)])
def capture_face(
    user_id: int,
    request: schemas.FaceCaptureRequest,
    db: Session = Depends(get_db)
):
    """
    Capture face data from base64 image and store embedding.
    This is used during user registration to capture face samples.
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check max samples
    current_samples = db.query(func.count(models.FaceEmbedding.id)).filter(
        models.FaceEmbedding.user_id == user_id
    ).scalar() or 0
    
    if current_samples >= settings.MAX_FACE_SAMPLES_PER_USER:
        return schemas.FaceCaptureResponse(
            success=False,
            message=f"Maximum {settings.MAX_FACE_SAMPLES_PER_USER} face samples allowed",
            face_detected=False,
        )
    
    try:
        # Decode base64 image
        image_data = base64.b64decode(request.image_data.split(",")[-1])
        
        # Save snapshot
        snapshot_path = _save_snapshot(image_data, f"user_{user_id}")
        
        # Convert to numpy
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return schemas.FaceCaptureResponse(
                success=False,
                message="Invalid image data",
                face_detected=False,
            )
        
        # Quality assessment
        quality = face_service.assess_face_quality(img)
        if not quality.get("valid", False):
            recs = "; ".join(quality.get("recommendations", []))
            return schemas.FaceCaptureResponse(
                success=False,
                message=f"Face quality check failed: {recs}",
                face_detected=quality.get("face_detected", False),
                face_count=quality.get("face_count", 0),
            )
        
        # Detect faces to get embedding
        faces = face_service.detect_faces(img)
        if len(faces) == 0:
            return schemas.FaceCaptureResponse(
                success=False,
                message="No face detected in image",
                face_detected=False,
            )
        
        if len(faces) > 1:
            return schemas.FaceCaptureResponse(
                success=False,
                message="Multiple faces detected, please provide a single face",
                face_detected=True,
                face_count=len(faces),
            )
        
        detected = faces[0]
        
        # Extract embedding
        embedding = detected.embedding
        if embedding is None and detected.aligned_face is not None:
            embedding = face_service.extract_embedding(detected.aligned_face)
        
        if embedding is None:
            return schemas.FaceCaptureResponse(
                success=False,
                message="Failed to extract face embedding",
                face_detected=True,
                face_count=1,
            )
        
        # Normalize embedding
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        
        # Store in database
        embedding_blob = pickle.dumps(embedding.astype(np.float32))
        
        is_primary = current_samples == 0
        
        face_emb = models.FaceEmbedding(
            user_id=user_id,
            embedding=embedding_blob,
            sample_type=request.sample_type,
            quality_score=quality.get("overall_score", 0.5),
            face_image_path=snapshot_path,
            is_primary=is_primary,
        )
        db.add(face_emb)
        db.commit()
        db.refresh(face_emb)
        
        # Add to live index
        face_service.add_embedding_to_index(
            embedding=embedding,
            user_id=user_id,
            sample_id=face_emb.id,
            employee_id=user.employee_id,
            full_name=user.full_name,
        )
        
        logger.info(f"Face sample captured for user {user.full_name}: {request.sample_type}")
        
        return schemas.FaceCaptureResponse(
            success=True,
            embedding_id=face_emb.id,
            quality_score=quality.get("overall_score"),
            message=f"Face captured successfully ({request.sample_type})",
            face_detected=True,
            face_count=1,
        )
        
    except Exception as e:
        logger.error(f"Face capture error: {e}")
        return schemas.FaceCaptureResponse(
            success=False,
            message=f"Error processing face: {str(e)}",
            face_detected=False,
        )


@router.post("/{user_id}/capture-face-from-file", response_model=schemas.FaceCaptureResponse, dependencies=[Depends(require_admin)])
def capture_face_from_file(
    user_id: int,
    sample_type: str = Form("front"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Capture face from uploaded image file."""
    contents = file.file.read()
    request = schemas.FaceCaptureRequest(
        user_id=user_id,
        sample_type=sample_type,
        image_data=base64.b64encode(contents).decode(),
    )
    return capture_face(user_id, request, db)


@router.get("/{user_id}/quality-check")
def check_face_quality(
    user_id: int,
    image_data: str,
    db: Session = Depends(get_db),
    admin = Depends(get_current_admin)
):
    """Check face image quality without storing."""
    try:
        image_bytes = base64.b64decode(image_data.split(",")[-1])
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image")
        
        return face_service.assess_face_quality(img)
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{user_id}/face-samples/{sample_id}", dependencies=[Depends(require_admin)])
def delete_face_sample(user_id: int, sample_id: int, db: Session = Depends(get_db)):
    """Delete a face sample and rebuild index."""
    sample = db.query(models.FaceEmbedding).filter(
        models.FaceEmbedding.id == sample_id,
        models.FaceEmbedding.user_id == user_id
    ).first()
    
    if not sample:
        raise HTTPException(status_code=404, detail="Face sample not found")
    
    db.delete(sample)
    db.commit()
    
    # Rebuild index
    face_service.rebuild_index(db)
    
    return {"success": True, "message": "Face sample deleted"}


@router.get("/departments/list")
def list_departments(db: Session = Depends(get_db), admin = Depends(get_current_admin)):
    """List all unique departments."""
    departments = db.query(models.User.department).distinct().all()
    return [d[0] or "Unassigned" for d in departments if d[0]]


import numpy as np
import cv2
