"""
Smart Attendance System - Attendance Service
Handles attendance marking, window management, late detection,
and notification triggers.
"""

import datetime
import logging
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc

from app.config import settings
from app import models, schemas
from app.services import settings_service

logger = logging.getLogger(__name__)


def parse_time_str(time_str: str) -> datetime.time:
    """Parse HH:MM time string."""
    hour, minute = map(int, time_str.split(':'))
    return datetime.time(hour, minute)


def get_current_window_info(db: Optional[Session] = None) -> Dict[str, Any]:
    """Calculate the current attendance window based on settings."""
    if db:
        class_start = settings_service.get_setting(db, "class_start_time", "09:00")
        interval_min = int(settings_service.get_setting(db, "attendance_interval", 40))
        mode = settings_service.get_setting(db, "attendance_mode", "full_day")
    else:
        class_start = settings_service.get_setting_threadsafe("class_start_time", "09:00")
        interval_min = int(settings_service.get_setting_threadsafe("attendance_interval", 40))
        mode = settings_service.get_setting_threadsafe("attendance_mode", "full_day")
        
    start_time = parse_time_str(class_start)
    now = datetime.datetime.now()
    
    now_minutes = now.hour * 60 + now.minute
    start_minutes = start_time.hour * 60 + start_time.minute
    
    if mode == "full_day":
        window_id = 1
        interval_min = 24 * 60 # effectively the whole day
    else:
        if now_minutes < start_minutes:
            window_id = 1
        else:
            minutes_elapsed = now_minutes - start_minutes
            window_index = minutes_elapsed // interval_min
            window_id = window_index + 1
        
    next_window_minutes = start_minutes + (window_id * interval_min)
    if next_window_minutes >= 24 * 60:
        next_window_minutes = 24 * 60 - 1
        
    next_processing = datetime.datetime.combine(
        now.date(), 
        datetime.time(next_window_minutes // 60, next_window_minutes % 60)
    )
    
    return {
        "window_id": window_id,
        "interval_min": interval_min,
        "next_processing": next_processing.isoformat(),
        "countdown_seconds": max(0, int((next_processing - now).total_seconds()))
    }


def is_late(entry_time: datetime.time, db: Session, window_id: int = 1) -> tuple:
    """Check if entry time is considered late based on settings and window."""
    class_start = settings_service.get_setting(db, "class_start_time", "09:00")
    interval_min = int(settings_service.get_setting(db, "attendance_interval", 40))
    
    start_time = parse_time_str(class_start)
    start_minutes = start_time.hour * 60 + start_time.minute
    
    # Calculate the start time for the current window
    window_start_minutes = start_minutes + ((window_id - 1) * interval_min)
    
    # Determine threshold based on window_id
    if window_id == 1:
        late_threshold_min = int(settings_service.get_setting(db, "late_threshold_minutes", 10))
    else:
        late_threshold_min = 10 # Hardcoded 10 minutes for subsequent periods
        
    entry_minutes = entry_time.hour * 60 + entry_time.minute
    
    if entry_minutes > window_start_minutes:
        late_minutes = entry_minutes - window_start_minutes
        is_late_flag = late_minutes > late_threshold_min
    else:
        late_minutes = 0
        is_late_flag = False
    
    return is_late_flag, late_minutes


def _valid_recognition_confidence(confidence: float) -> bool:
    """
    Validate that a recognition confidence score is physically plausible.
    ArcFace embeddings are L2-normalized, so cosine similarity ranges in [-1.0, 1.0].
    Any value outside this range indicates a corrupted/broken similarity computation
    and MUST NOT be trusted to mark attendance.
    """
    try:
        conf = float(confidence)
    except (TypeError, ValueError):
        return False
    # Must be a positive similarity within the valid cosine range.
    # A threshold of 0.65 (default) means we require conf >= 0.65.
    return 0.0 <= conf <= 1.0


def mark_attendance(
    db: Session,
    user_id: int,
    camera_id: Optional[int] = None,
    confidence: float = 0.0,
    liveness_score: float = 0.0,
    snapshot_path: Optional[str] = None,
    verification_method: str = "automatic",
    employee_id: Optional[str] = None,
) -> Tuple[Optional[models.AttendanceRecord], bool]:
    """
    Mark attendance for a SPECIFIC recognized student using Window Logic.

    IMPORTANT: This function is ONLY ever called after the recognition pipeline
    has positively confirmed a student's identity (face matched against a
    registered face above threshold, liveness passed, multiple-frame confirmation).

    It NEVER creates a record for a student who was not recognized.
    Absent students are marked ABSENT only during finalization (finalize_attendance),
    NOT here and NOT at the start of a session.

    Updates out_time if already marked in the current window.
    """
    try:
        now = datetime.datetime.now()
        today = now.date()
        time_str = now.strftime("%H:%M")

        # Guard 1: Reject implausible confidence values. A cosine similarity
        # CANNOT exceed 1.0. The previous broken pipeline stored values like 3–21,
        # which made the threshold check pass trivially for every face.
        if not _valid_recognition_confidence(confidence):
            logger.warning(
                f"Rejected attendance for user={user_id}: implausible confidence={confidence} "
                f"(must be in [0.0, 1.0]). This face was NOT confirmed."
            )
            return None, False

        window_info = get_current_window_info(db)
        window_id = window_info["window_id"]

        # Guard 2: Resolve the user to enforce the unique Student ID / Register Number.
        # Attendance is matched by employee_id (unique Student ID), not by name.
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if user is None:
            logger.warning(f"Rejected attendance: user_id={user_id} does not exist")
            return None, False
        resolved_employee_id = employee_id or user.employee_id

        # Check if this specific student already has a record for the current session.
        # The UNIQUE(user_id, attendance_window_id) constraint guarantees at most one.
        existing = db.query(models.AttendanceRecord).filter(
            and_(
                models.AttendanceRecord.user_id == user_id,
                models.AttendanceRecord.date == today,
                models.AttendanceRecord.attendance_window_id == window_id
            )
        ).first()

        if existing:
            # This student was already marked in this session.
            # Only update OUT TIME — never change status, never create a duplicate.
            existing.out_time = now
            existing.confidence = max(existing.confidence, confidence)  # keep best confidence
            db.commit()
            db.refresh(existing)
            logger.debug(f"User {user_id} out_time updated for window {window_id}")
            return existing, False

        # Guard 3: Only a confirmed student gets a NEW present/late record.
        entry_time = now.time()
        late_flag, late_minutes = is_late(entry_time, db, window_id)
        status = "late" if late_flag else "present"

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
            in_time=now,
            out_time=now,
            attendance_window_id=window_id,
            employee_id=resolved_employee_id,
        )

        db.add(record)
        db.commit()
        db.refresh(record)

        logger.info(f"Attendance marked (CONFIRMED recognition): user={user_id} emp={resolved_employee_id} window={window_id} status={status} conf={confidence:.3f}")
        return record, True

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to mark attendance for user {user_id}: {e}")
        return None, False


def initialize_daily_attendance(db: Session, window_id: int = 1):
    """
    DEPRECATED / NO-OP.

    Previously this pre-created an "absent" attendance row for EVERY registered
    student at the start of each window. That was the root cause of the bug where
    students who were never seen by the camera still appeared in attendance records.

    Per requirements:
      - A registered student who is NOT detected by the camera must remain UNSET
        until the attendance session is finalised.
      - ABSENT is determined ONLY during finalization (see finalize_attendance).

    This function is kept as a safe no-op so existing scheduler callers do not
    break, but it no longer creates any records.
    """
    # Intentionally do nothing. Absent records are created only in finalize_attendance.
    logger.info("initialize_daily_attendance is a no-op (absent records are created only at finalization)")


def finalize_attendance(db: Session, window_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Finalize the current attendance session/window.

    ABSENT determination (rule #12):
      1. Get all registered (active) students.
      2. Get the students who received at least one valid confirmed recognition
         during the current session => PRESENT or LATE.
      3. Students WITHOUT any valid recognition => ABSENT.

    This is the ONLY place where ABSENT records are created.
    """
    try:
        now = datetime.datetime.now()
        today = now.date()

        if window_id is None:
            window_id = get_current_window_info(db)["window_id"]

        active_users = db.query(models.User).filter(models.User.is_active == True).all()

        # Students already marked present/late in this session (confirmed recognition).
        marked = db.query(models.AttendanceRecord).filter(
            and_(
                models.AttendanceRecord.date == today,
                models.AttendanceRecord.attendance_window_id == window_id,
                models.AttendanceRecord.status.in_(["present", "late"]),
            )
        ).all()
        marked_user_ids = {r.user_id for r in marked if r.user_id is not None}

        present_count = 0
        late_count = 0
        absent_created = 0

        for user in active_users:
            if user.id in marked_user_ids:
                # Already has a confirmed PRESENT/LATE record — do not touch.
                continue
            # This student was never confirmed by the camera => ABSENT.
            existing_absent = db.query(models.AttendanceRecord).filter(
                and_(
                    models.AttendanceRecord.user_id == user.id,
                    models.AttendanceRecord.date == today,
                    models.AttendanceRecord.attendance_window_id == window_id,
                    models.AttendanceRecord.status == "absent",
                )
            ).first()

            if existing_absent:
                continue  # already marked absent

            record = models.AttendanceRecord(
                user_id=user.id,
                timestamp=now,
                date=today,
                time_str=now.strftime("%H:%M"),
                status="absent",
                in_time=None,
                out_time=None,
                attendance_window_id=window_id,
                verification_method="system",
                employee_id=user.employee_id,
            )
            db.add(record)
            absent_created += 1

        db.commit()
        logger.info(
            f"Attendance finalized for {today}, window {window_id}: "
            f"present={present_count}, late={late_count}, absent_created={absent_created}"
        )
        return {
            "date": str(today),
            "window_id": window_id,
            "present": present_count,
            "late": late_count,
            "absent": absent_created,
            "total_users": len(active_users),
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to finalize attendance: {e}")
        return {"error": str(e)}


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
    query = db.query(models.AttendanceRecord)
    
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
    
    total = query.count()
    offset = (filters.page - 1) * filters.page_size
    records = query.order_by(desc(models.AttendanceRecord.timestamp)).offset(offset).limit(filters.page_size).all()
    
    return records, total


def get_today_stats(db: Session) -> Dict[str, Any]:
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


def get_attendance_trends(db: Session, days: int = 30) -> List[Dict[str, Any]]:
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
    
    trend_map: Dict[str, Dict[str, int]] = {}
    for date_val, status_val, count in results:
        date_str = date_val.strftime("%Y-%m-%d")
        if date_str not in trend_map:
            trend_map[date_str] = {"present": 0, "late": 0, "absent": 0}
        trend_map[date_str][status_val] = count
    
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


def export_attendance(db: Session, filters: schemas.AttendanceFilter, format_type: str = "csv") -> str:
    records, _ = get_attendance_records(db, filters)
    
    if format_type == "csv":
        lines = ["ID,User Name,Employee ID,Date,In Time,Out Time,Window,Status,Camera,Confidence,Late Minutes"]
        for r in records:
            user_name = r.user.full_name if r.user else "Unknown"
            emp_id = r.user.employee_id if r.user else ""
            in_t = r.in_time.strftime("%H:%M:%S") if r.in_time else ""
            out_t = r.out_time.strftime("%H:%M:%S") if r.out_time else ""
            lines.append(
                f"{r.id},{user_name},{emp_id},{r.date},{in_t},{out_t},{r.attendance_window_id},"
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
                "in_time": r.in_time.isoformat() if r.in_time else None,
                "out_time": r.out_time.isoformat() if r.out_time else None,
                "window_id": r.attendance_window_id,
                "status": r.status,
                "confidence": r.confidence,
                "liveness_score": r.liveness_score,
                "is_late": r.is_late,
                "late_minutes": r.late_minutes,
            })
        return json.dumps(data, indent=2)
    
    return ""


def cleanup_old_cooldowns():
    """No longer used. Replaced by Window logic."""
    pass
