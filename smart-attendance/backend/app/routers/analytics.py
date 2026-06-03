"""
Analytics Router - Dashboard statistics, charts, and insights.
"""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc
from datetime import datetime, timedelta, date

from app.database import get_db
from app.auth import get_current_admin
from app.services.camera_service import camera_manager
from app.services.face_service import face_service
from app.config import settings
from app import models, schemas

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/dashboard")
def dashboard_stats(db: Session = Depends(get_db), admin = Depends(get_current_admin)):
    """Get comprehensive dashboard statistics."""
    today = date.today()
    
    # User counts
    total_users = db.query(func.count(models.User.id)).filter(models.User.is_active == True).scalar() or 0
    
    # Today's attendance
    today_present = db.query(func.count(models.AttendanceRecord.id)).filter(
        and_(models.AttendanceRecord.date == today, models.AttendanceRecord.status == "present")
    ).scalar() or 0
    
    today_late = db.query(func.count(models.AttendanceRecord.id)).filter(
        and_(models.AttendanceRecord.date == today, models.AttendanceRecord.status == "late")
    ).scalar() or 0
    
    attendance_rate = ((today_present + today_late) / total_users * 100) if total_users > 0 else 0
    
    # Camera stats
    total_cameras = db.query(func.count(models.Camera.id)).scalar() or 0
    online_cameras = camera_manager.active_count
    
    # Unknown detections today
    unknown_today = db.query(func.count(models.UnknownDetection.id)).filter(
        func.date(models.UnknownDetection.timestamp) == today
    ).scalar() or 0
    
    # System health
    system_health = "healthy" if online_cameras > 0 else "degraded"
    
    # Recent activity (last 10 attendance records)
    recent_activity = db.query(models.AttendanceRecord).order_by(
        desc(models.AttendanceRecord.timestamp)
    ).limit(10).all()
    
    activity = []
    for r in recent_activity:
        activity.append({
            "id": r.id,
            "user_name": r.user.full_name if r.user else "Unknown",
            "employee_id": r.user.employee_id if r.user else None,
            "timestamp": r.timestamp.isoformat(),
            "status": r.status,
            "confidence": r.confidence,
        })
    
    # Department breakdown
    dept_stats = []
    departments = db.query(models.User.department).distinct().all()
    for (dept,) in departments:
        if not dept:
            continue
        dept_total = db.query(func.count(models.User.id)).filter(
            and_(models.User.department == dept, models.User.is_active == True)
        ).scalar() or 0
        dept_present = db.query(func.count(models.AttendanceRecord.id)).join(models.User).filter(
            and_(
                models.User.department == dept,
                models.AttendanceRecord.date == today,
                models.AttendanceRecord.status.in_(["present", "late"])
            )
        ).scalar() or 0
        dept_stats.append({
            "department": dept,
            "total": dept_total,
            "present": dept_present,
            "rate": round(dept_present / dept_total * 100, 1) if dept_total > 0 else 0,
        })
    
    return {
        "total_users": total_users,
        "today_present": today_present,
        "today_late": today_late,
        "today_absent": total_users - today_present - today_late,
        "attendance_rate": round(attendance_rate, 1),
        "total_cameras": total_cameras,
        "online_cameras": online_cameras,
        "unknown_detections_today": unknown_today,
        "system_health": system_health,
        "recent_activity": activity,
        "department_breakdown": dept_stats,
        "active_streams": camera_manager.active_count,
        "recognition_index_size": len(face_service._user_ids),
        "server_time": datetime.utcnow().isoformat(),
    }


@router.get("/daily-summary")
def daily_summary(
    days: int = 30,
    db: Session = Depends(get_db),
    admin = Depends(get_current_admin)
):
    """Get daily attendance summary for charts."""
    end_date = date.today()
    start_date = end_date - timedelta(days=days)
    
    results = db.query(
        models.AttendanceRecord.date,
        models.AttendanceRecord.status,
        func.count(models.AttendanceRecord.id).label("count")
    ).filter(
        models.AttendanceRecord.date >= start_date
    ).group_by(
        models.AttendanceRecord.date,
        models.AttendanceRecord.status
    ).all()
    
    # Build date map
    date_map = {}
    for d, status, count in results:
        date_str = d.strftime("%Y-%m-%d")
        if date_str not in date_map:
            date_map[date_str] = {"present": 0, "late": 0, "absent": 0}
        date_map[date_str][status] = count
    
    # Fill all dates
    summary = []
    for i in range(days):
        d = end_date - timedelta(days=days - 1 - i)
        d_str = d.strftime("%Y-%m-%d")
        data = date_map.get(d_str, {"present": 0, "late": 0, "absent": 0})
        total_users = db.query(func.count(models.User.id)).filter(models.User.is_active == True).scalar() or 0
        marked = data.get("present", 0) + data.get("late", 0)
        summary.append({
            "date": d_str,
            "present": data.get("present", 0),
            "late": data.get("late", 0),
            "absent": total_users - marked,
            "total_users": total_users,
        })
    
    return summary


@router.get("/peak-hours")
def peak_hours(
    days: int = 7,
    db: Session = Depends(get_db),
    admin = Depends(get_current_admin)
):
    """Get peak attendance hours."""
    start_date = date.today() - timedelta(days=days)
    
    results = db.query(
        func.strftime('%H', models.AttendanceRecord.timestamp).label("hour"),
        func.count(models.AttendanceRecord.id).label("count")
    ).filter(
        models.AttendanceRecord.date >= start_date
    ).group_by("hour").order_by("hour").all()
    
    return [
        {"hour": f"{int(r.hour):02d}:00", "count": r.count}
        for r in results if r.hour
    ]


@router.get("/user-stats/{user_id}")
def user_attendance_stats(
    user_id: int,
    db: Session = Depends(get_db),
    admin = Depends(get_current_admin)
):
    """Get detailed attendance stats for a specific user."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        return {"error": "User not found"}
    
    # Monthly stats
    this_month = date.today().replace(day=1)
    month_records = db.query(models.AttendanceRecord).filter(
        and_(
            models.AttendanceRecord.user_id == user_id,
            models.AttendanceRecord.date >= this_month
        )
    ).all()
    
    present_days = sum(1 for r in month_records if r.status == "present")
    late_days = sum(1 for r in month_records if r.status == "late")
    
    # Recent history
    recent = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.user_id == user_id
    ).order_by(desc(models.AttendanceRecord.date)).limit(30).all()
    
    history = [
        {
            "date": r.date.strftime("%Y-%m-%d"),
            "time": r.time_str,
            "status": r.status,
            "confidence": r.confidence,
        }
        for r in recent
    ]
    
    return {
        "user_id": user_id,
        "full_name": user.full_name,
        "employee_id": user.employee_id,
        "department": user.department,
        "this_month_present": present_days,
        "this_month_late": late_days,
        "this_month_total": present_days + late_days,
        "attendance_rate": round(present_days / max(len(month_records), 1) * 100, 1),
        "history": history,
    }


@router.get("/system-health")
def system_health(db: Session = Depends(get_db), admin = Depends(get_current_admin)):
    """Get system health status."""
    import psutil
    
    cpu = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    # Camera health
    camera_status = camera_manager.get_all_status()
    camera_health = {
        "total": len(camera_status),
        "online": sum(1 for s in camera_status.values() if s.get("connected")),
        "offline": sum(1 for s in camera_status.values() if not s.get("connected")),
        "details": camera_status,
    }
    
    # Recognition engine status
    recognition_status = {
        "initialized": face_service._initialized,
        "index_size": len(face_service._user_ids),
        "unique_users": len(set(face_service._user_ids)),
    }
    
    return {
        "cpu_usage": cpu,
        "memory_usage": {
            "total_gb": round(memory.total / (1024**3), 1),
            "used_gb": round(memory.used / (1024**3), 1),
            "percent": memory.percent,
        },
        "disk_usage": {
            "total_gb": round(disk.total / (1024**3), 1),
            "used_gb": round(disk.used / (1024**3), 1),
            "percent": round(disk.percent, 1),
        },
        "cameras": camera_health,
        "recognition": recognition_status,
        "status": "healthy" if cpu < 90 and memory.percent < 90 else "warning",
    }
