"""
Attendance Router - Attendance records, logs, and export endpoints.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse, JSONResponse
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from app.database import get_db
from app.auth import get_current_admin, get_current_admin_optional, require_admin
from app.services.attendance_service import (
    get_attendance_records, get_today_stats, get_attendance_trends,
    get_hourly_distribution, get_department_stats, export_attendance
)
from app import schemas

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/attendance", tags=["Attendance"])


@router.get("/today/stats")
def today_stats(db: Session = Depends(get_db), admin = Depends(get_current_admin_optional)):
    """Get today's attendance statistics."""
    return get_today_stats(db)


@router.get("/records")
def list_attendance(
    user_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    camera_id: Optional[int] = None,
    department: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    admin = Depends(get_current_admin_optional)
):
    """Get attendance records with filtering."""
    filters = schemas.AttendanceFilter(
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        status=status,
        camera_id=camera_id,
        department=department,
        page=page,
        page_size=page_size,
    )
    
    records, total = get_attendance_records(db, filters)
    
    results = []
    seen_user_ids = set()
    today = date.today()
    
    for r in records:
        if r.user_id and r.date == today:
            seen_user_ids.add(r.user_id)
        results.append(schemas.AttendanceRecordOut(
            id=r.id,
            user_id=r.user_id,
            user_name=r.user.full_name if r.user else None,
            user_employee_id=r.user.employee_id if r.user else None,
            timestamp=r.timestamp,
            date=r.date,
            time_str=r.time_str,
            camera_id=r.camera_id,
            camera_name=r.camera.name if r.camera else None,
            confidence=r.confidence,
            liveness_score=r.liveness_score,
            status=r.status,
            snapshot_path=r.snapshot_path,
            is_late=r.is_late,
            late_minutes=r.late_minutes,
            in_time=r.in_time,
            out_time=r.out_time,
            attendance_window_id=r.attendance_window_id,
        ))
    
    # Include ABSENT entries for registered active users who have not checked in today
    if page == 1 and not status and not user_id and not date_from and not date_to:
        from datetime import datetime as dt
        from app.models import User
        active_users = db.query(User).filter(User.is_active == True).all()
        now_dt = dt.now()
        for u in active_users:
            if u.id not in seen_user_ids:
                results.append(schemas.AttendanceRecordOut(
                    id=900000 + u.id,
                    user_id=u.id,
                    user_name=u.full_name,
                    user_employee_id=u.employee_id,
                    timestamp=now_dt,
                    date=today,
                    time_str=None,
                    camera_id=None,
                    camera_name=None,
                    confidence=0.0,
                    liveness_score=0.0,
                    status="absent",
                    snapshot_path=None,
                    is_late=False,
                    late_minutes=0,
                    in_time=None,
                    out_time=None,
                    attendance_window_id=1,
                ))
                total += 1
    
    return {"items": results, "total": total, "page": page, "page_size": page_size}


@router.get("/trends")
def attendance_trends(
    days: int = 30,
    db: Session = Depends(get_db),
    admin = Depends(get_current_admin)
):
    """Get attendance trends over time."""
    return get_attendance_trends(db, days)


@router.get("/hourly-distribution")
def hourly_distribution(
    date: Optional[date] = None,
    db: Session = Depends(get_db),
    admin = Depends(get_current_admin)
):
    """Get hourly attendance distribution."""
    return get_hourly_distribution(db, date)


@router.get("/department-stats")
def department_stats(
    db: Session = Depends(get_db),
    admin = Depends(get_current_admin)
):
    """Get attendance statistics by department."""
    return get_department_stats(db)


@router.get("/export/csv")
def export_csv(
    user_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin = Depends(get_current_admin)
):
    """Export attendance records as CSV."""
    filters = schemas.AttendanceFilter(
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        status=status,
        page=1,
        page_size=10000,
    )
    
    csv_data = export_attendance(db, filters, "csv")
    
    return PlainTextResponse(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=attendance.csv"}
    )


@router.get("/export/json")
def export_json(
    user_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin = Depends(get_current_admin)
):
    """Export attendance records as JSON."""
    filters = schemas.AttendanceFilter(
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        status=status,
        page=1,
        page_size=10000,
    )
    
    json_data = export_attendance(db, filters, "json")
    
    return PlainTextResponse(
        content=json_data,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=attendance.json"}
    )


@router.get("/unknown-detections")
def list_unknown_detections(
    is_reviewed: Optional[bool] = None,
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    admin = Depends(get_current_admin)
):
    """List unknown face detections for security review."""
    from app import models
    from sqlalchemy import desc
    
    query = db.query(models.UnknownDetection)
    
    if is_reviewed is not None:
        query = query.filter(models.UnknownDetection.is_reviewed == is_reviewed)
    
    total = query.count()
    detections = query.order_by(desc(models.UnknownDetection.timestamp)).offset((page-1)*page_size).limit(page_size).all()
    
    results = []
    for d in detections:
        results.append({
            "id": d.id,
            "snapshot_path": d.snapshot_path,
            "timestamp": d.timestamp.isoformat(),
            "camera_id": d.camera_id,
            "confidence": d.confidence,
            "liveness_score": d.liveness_score,
            "bounding_box": d.bounding_box,
            "is_reviewed": d.is_reviewed,
            "review_notes": d.review_notes,
        })
    
    return {"items": results, "total": total, "page": page, "page_size": page_size}


@router.post("/unknown-detections/{detection_id}/review", dependencies=[Depends(require_admin)])
def review_unknown_detection(
    detection_id: int,
    notes: str = "",
    db: Session = Depends(get_db)
):
    """Mark an unknown detection as reviewed."""
    from app import models
    
    detection = db.query(models.UnknownDetection).filter(models.UnknownDetection.id == detection_id).first()
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    
    detection.is_reviewed = True
    detection.review_notes = notes
    db.commit()
    
    return {"success": True, "message": "Detection reviewed"}
