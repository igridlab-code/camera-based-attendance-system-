"""
Smart Attendance System - Attendance Service
Handles attendance marking, cooldown management, late detection,
and notification triggers.
"""

import datetime
import logging
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc

from app.config import settings
from app import models, schemas

logger = logging.getLogger(__name__)

# In-memory cooldown tracker: {user_id: last_mark_timestamp}
_attendance_cooldown: Dict[int, datetime.datetime] = {}


def is_cooldown_active(user_id: int) -> bool:
    """Check if user is within attendance cooldown period."""
    last_mark = _attendance_cooldown.get(user_id)
    if last_mark is None:
        return False
    
    cooldown = datetime.timedelta(minutes=settings.ATTENDANCE_COOLDOWN_MINUTES)
    return datetime.datetime.utcnow() - last_mark < cooldown


def get_cooldown_remaining(user_id: int) -> int:
    """Get remaining cooldown seconds for a user."""
    last_mark = _attendance_cooldown.get(user_id)
    if last_mark is None:
        return 0
    
    cooldown = datetime.timedelta(minutes=settings.ATTENDANCE_COOLDOWN_MINUTES)
    elapsed = datetime.datetime.utcnow() - last_mark
    remaining = cooldown - elapsed
    return max(0, int(remaining.total_seconds()))


def parse_time_str(time_str: str) -> datetime.time:
    """Parse HH:MM time string."""
    hour, minute = map(int, time_str.split(':'))
    return datetime.time(hour, minute)


def is_late(entry_time: datetime.time) -> tuple:
    """Check if entry time is considered late."""
    start_time = parse_time_str(settings.ATTENDANCE_START_TIME)
    late_threshold = parse_time_str(
        f"{start_time.hour}:{start_time.minute + settings.LATE_THRESHOLD_MINUTES}"
    )
    
    # Handle minute overflow
    late_minutes = 0
    entry_minutes = entry_time.hour * 60 + entry_time.minute
    start_minutes = start_time.hour * 60 + start_time.minute
    
    if entry_minutes > start_minutes:
        late_minutes = entry_minutes - start_minutes
        is_late_flag = late_minutes > settings.LATE_THRESHOLD_MINUTES
    else:
        is_late_flag = False
    
    return is_late_flag, late_minutes


def mark_attendance(
    db: Session,
    user_id: int,
    camera_id: Optional[int] = None,
    confidence: float = 0.0,
    liveness_score: float = 0.0,
    snapshot_path: Optional[str] = None,
    verification_method: str = "automatic"
) -> Optional[models.AttendanceRecord]:
    """
    Mark attendance for a user with all metadata.
    Respects cooldown period and prevents duplicates.
    
    Returns:
        AttendanceRecord if marked, None if on cooldown or error.
    """
    # Check cooldown
    if is_cooldown_active(user_id):
        remaining = get_cooldown_remaining(user_id)
        logger.debug(f"User {user_id} on cooldown, {remaining}s remaining")
        return None
    
    try:
        now = datetime.datetime.utcnow()
        today = now.date()
        time_str = now.strftime("%H:%M")
        
        # Check if already marked today
        existing = db.query(models.AttendanceRecord).filter(
            and_(
                models.AttendanceRecord.user_id == user_id,
                models.AttendanceRecord.date == today
            )
        ).first()
        
        if existing:
            logger.debug(f"User {user_id} already marked present today")
            return existing
        
        # Determine late status
        entry_time = now.time()
        late_flag, late_minutes = is_late(entry_time)
        
        # Determine status
        if late_flag:
            status = "late"
        else:
            status = "present"
        
        # Create record
        record = models.AttendanceRecord(
            user_id=user_id,
            timestamp=now,
            date=today,
            time_str=time_str,
            camera_id=camera_id,
            confidence=confidence,
            liveness_score=liveness_score,
            status=status,
            snapshot_path=snapshot_path,
            verification_method=verification_method,
            is_late=late_flag,
            late_minutes=late_minutes,
        )
        
        db.add(record)
        db.commit()
        db.refresh(record)
        
        # Update cooldown
        _attendance_cooldown[user_id] = now
        
        logger.info(
            f"Attendance marked: user={user_id}, status={status}, "
            f"confidence={confidence:.3f}, liveness={liveness_score:.3f}"
        )
        
        return record
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to mark attendance for user {user_id}: {e}")
        return None


def mark_unknown_detection(
    db: Session,
    camera_id: Optional[int] = None,
    confidence: float = 0.0,
    liveness_score: float = 0.0,
    snapshot_path: Optional[str] = None,
    bounding_box: Optional[List[int]] = None
) -> Optional[models.UnknownDetection]:
    """Log an unknown face detection for security review."""
    try:
        detection = models.UnknownDetection(
            snapshot_path=snapshot_path or "",
            camera_id=camera_id,
            confidence=confidence,
            liveness_score=liveness_score,
            bounding_box=bounding_box or [],
        )
        db.add(detection)
        db.commit()
        db.refresh(detection)
        return detection
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to log unknown detection: {e}")
        return None


def get_attendance_records(
    db: Session,
    filters: schemas.AttendanceFilter
) -> tuple:
    """
    Get attendance records with filtering and pagination.
    
    Returns:
        (records, total_count)
    """
    query = db.query(models.AttendanceRecord)
    
    # Apply filters
    if filters.user_id:
        query = query.filter(models.AttendanceRecord.user_id == filters.user_id)
    
    if filters.date_from:
        query = query.filter(models.AttendanceRecord.date >= filters.date_from)
    
    if filters.date_to:
        query = query.filter(models.AttendanceRecord.date <= filters.date_to)
    
    if filters.status:
        query = query.filter(models.AttendanceRecord.status == filters.status)
    
    if filters.camera_id:
        query = query.filter(models.AttendanceRecord.camera_id == filters.camera_id)
    
    # Count total
    total = query.count()
    
    # Apply pagination
    offset = (filters.page - 1) * filters.page_size
    records = query.order_by(desc(models.AttendanceRecord.timestamp)).offset(offset).limit(filters.page_size).all()
    
    return records, total


def get_today_stats(db: Session) -> Dict[str, Any]:
    """Get today's attendance statistics."""
    today = datetime.date.today()
    
    present_count = db.query(func.count(models.AttendanceRecord.id)).filter(
        and_(
            models.AttendanceRecord.date == today,
            models.AttendanceRecord.status == "present"
        )
    ).scalar() or 0
    
    late_count = db.query(func.count(models.AttendanceRecord.id)).filter(
        and_(
            models.AttendanceRecord.date == today,
            models.AttendanceRecord.status == "late"
        )
    ).scalar() or 0
    
    unknown_count = db.query(func.count(models.UnknownDetection.id)).filter(
        func.date(models.UnknownDetection.timestamp) == today
    ).scalar() or 0
    
    total_users = db.query(func.count(models.User.id)).filter(
        models.User.is_active == True
    ).scalar() or 0
    
    attendance_rate = ((present_count + late_count) / total_users * 100) if total_users > 0 else 0
    
    return {
        "today_present": present_count,
        "today_late": late_count,
        "today_unknown": unknown_count,
        "total_users": total_users,
        "attendance_rate": round(attendance_rate, 1),
    }


def get_attendance_trends(
    db: Session,
    days: int = 30
) -> List[Dict[str, Any]]:
    """Get daily attendance trends for the past N days."""
    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=days)
    
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
    
    # Organize by date
    trend_map: Dict[str, Dict[str, int]] = {}
    for date_val, status_val, count in results:
        date_str = date_val.strftime("%Y-%m-%d")
        if date_str not in trend_map:
            trend_map[date_str] = {"present": 0, "late": 0, "absent": 0}
        trend_map[date_str][status_val] = count
    
    # Fill in missing dates
    trends = []
    for i in range(days):
        date = end_date - datetime.timedelta(days=days - 1 - i)
        date_str = date.strftime("%Y-%m-%d")
        day_data = trend_map.get(date_str, {"present": 0, "late": 0, "absent": 0})
        trends.append({
            "date": date_str,
            "present": day_data.get("present", 0),
            "late": day_data.get("late", 0),
            "absent": day_data.get("absent", 0),
        })
    
    return trends


def get_hourly_distribution(db: Session, date: Optional[datetime.date] = None) -> List[Dict[str, Any]]:
    """Get hourly attendance distribution."""
    if date is None:
        date = datetime.date.today()
    
    results = db.query(
        func.strftime('%H', models.AttendanceRecord.timestamp).label("hour"),
        func.count(models.AttendanceRecord.id).label("count")
    ).filter(
        models.AttendanceRecord.date == date
    ).group_by("hour").all()
    
    distribution = [{"hour": f"{h:02d}:00", "count": 0} for h in range(24)]
    
    for hour_str, count in results:
        if hour_str:
            hour = int(hour_str)
            distribution[hour] = {"hour": f"{hour:02d}:00", "count": count}
    
    return distribution


def get_department_stats(db: Session) -> List[Dict[str, Any]]:
    """Get attendance statistics by department."""
    today = datetime.date.today()
    
    results = db.query(
        models.User.department,
        func.count(models.User.id).label("total"),
    ).filter(
        models.User.is_active == True
    ).group_by(models.User.department).all()
    
    stats = []
    for dept, total in results:
        dept = dept or "Unassigned"
        
        present_today = db.query(func.count(models.AttendanceRecord.id)).join(models.User).filter(
            and_(
                models.User.department == dept,
                models.AttendanceRecord.date == today,
                models.AttendanceRecord.status.in_(["present", "late"])
            )
        ).scalar() or 0
        
        stats.append({
            "department": dept,
            "total_users": total,
            "present_today": present_today,
            "attendance_rate": round(present_today / total * 100, 1) if total > 0 else 0,
        })
    
    return stats


def export_attendance(
    db: Session,
    filters: schemas.AttendanceFilter,
    format_type: str = "csv"
) -> str:
    """
    Export attendance records to CSV/JSON string.
    
    Returns:
        Formatted string for download.
    """
    records, _ = get_attendance_records(db, filters)
    
    if format_type == "csv":
        lines = ["ID,User Name,Employee ID,Date,Time,Status,Camera,Confidence,Late Minutes"]
        for r in records:
            user_name = r.user.full_name if r.user else "Unknown"
            emp_id = r.user.employee_id if r.user else ""
            lines.append(
                f"{r.id},{user_name},{emp_id},{r.date},{r.time_str or ''},"
                f"{r.status},{r.camera_id or ''},{r.confidence:.3f},{r.late_minutes}"
            )
        return "\n".join(lines)
    
    elif format_type == "json":
        import json
        data = []
        for r in records:
            data.append({
                "id": r.id,
                "user_name": r.user.full_name if r.user else None,
                "employee_id": r.user.employee_id if r.user else None,
                "date": str(r.date),
                "time": r.time_str,
                "status": r.status,
                "confidence": r.confidence,
                "liveness_score": r.liveness_score,
                "is_late": r.is_late,
                "late_minutes": r.late_minutes,
            })
        return json.dumps(data, indent=2)
    
    return ""


def cleanup_old_cooldowns():
    """Remove expired cooldown entries from memory."""
    now = datetime.datetime.utcnow()
    expired = []
    cooldown_td = datetime.timedelta(minutes=settings.ATTENDANCE_COOLDOWN_MINUTES)
    
    for user_id, last_mark in _attendance_cooldown.items():
        if now - last_mark > cooldown_td:
            expired.append(user_id)
    
    for user_id in expired:
        del _attendance_cooldown[user_id]
