"""
Smart Attendance System - Database Models
Comprehensive schema for users, embeddings, attendance, cameras, and audit logs.
"""

import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Date, JSON, LargeBinary,
    UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.database import Base


class TimestampMixin:
    """Mixin to add created_at and updated_at timestamps."""
    created_at = Column(DateTime, default=datetime.datetime.now)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now)


class User(Base, TimestampMixin):
    """Registered users (students/employees)."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(200), nullable=False)
    employee_id = Column(String(100), unique=True, nullable=False, index=True)
    department = Column(String(200), nullable=True)
    email = Column(String(200), nullable=True)
    phone = Column(String(50), nullable=True)
    role = Column(String(50), default="student")
    is_active = Column(Boolean, default=True)
    profile_image = Column(String(500), nullable=True)
    metadata_json = Column(JSON, default=dict)

    face_embeddings = relationship("FaceEmbedding", back_populates="user", cascade="all, delete-orphan")
    attendance_records = relationship("AttendanceRecord", back_populates="user")


class FaceEmbedding(Base, TimestampMixin):
    """Face embedding vectors extracted from user face samples."""
    __tablename__ = "face_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    embedding = Column(LargeBinary, nullable=False)
    embedding_norm = Column(LargeBinary, nullable=True)
    sample_type = Column(String(50), default="front")
    quality_score = Column(Float, default=0.0)
    face_image_path = Column(String(500), nullable=True)
    is_primary = Column(Boolean, default=False)

    user = relationship("User", back_populates="face_embeddings")


class AttendanceRecord(Base, TimestampMixin):
    """Attendance records with recognition metadata."""
    __tablename__ = "attendance_records"
    # A student can only have ONE attendance record per attendance window.
    # This database-level constraint guarantees no duplicate PRESENT records
    # can ever be created for the same student in the same session.
    __table_args__ = (
        UniqueConstraint("user_id", "attendance_window_id", name="uq_attendance_user_window"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.now)
    date = Column(Date, default=datetime.date.today)
    time_str = Column(String(10), nullable=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), nullable=True)
    confidence = Column(Float, default=0.0)
    liveness_score = Column(Float, default=0.0)
    status = Column(String(50), default="present")
    snapshot_path = Column(String(500), nullable=True)
    verification_method = Column(String(100), default="automatic")
    is_late = Column(Boolean, default=False)
    late_minutes = Column(Integer, default=0)
    in_time = Column(DateTime, nullable=True)
    out_time = Column(DateTime, nullable=True)
    attendance_window_id = Column(Integer, nullable=True, index=True)
    # Unique Student ID / Register Number used for attendance matching.
    # The row is created ONLY when this specific student is recognized.
    employee_id = Column(String(100), nullable=True, index=True)

    user = relationship("User", back_populates="attendance_records")
    camera = relationship("Camera")


class Camera(Base, TimestampMixin):
    """Camera configuration for attendance capture."""
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    source_url = Column(String(500), nullable=False)
    camera_type = Column(String(50), default="webcam")
    location = Column(String(300), nullable=True)
    is_active = Column(Boolean, default=True)
    resolution = Column(String(50), default="640x480")
    fps = Column(Integer, default=30)
    flip_horizontal = Column(Boolean, default=False)
    auto_exposure = Column(Boolean, default=True)
    detection_zone = Column(JSON, default=dict)
    notes = Column(Text, nullable=True)
    last_online_at = Column(DateTime, nullable=True)
    health_status = Column(String(50), default="unknown")


class AdminUser(Base, TimestampMixin):
    """Administrative users with role-based access."""
    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(200), nullable=True)
    email = Column(String(200), nullable=True)
    role = Column(String(50), default="admin")
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)
    login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)


class AuditLog(Base):
    """Security audit logs for compliance."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)
    admin_id = Column(Integer, ForeignKey("admin_users.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    ip_address = Column(String(100), nullable=True)
    user_agent = Column(String(500), nullable=True)
    severity = Column(String(20), default="info")
    created_at = Column(DateTime, default=datetime.datetime.now)


class UnknownDetection(Base, TimestampMixin):
    """Unknown face detections for security review."""
    __tablename__ = "unknown_detections"

    id = Column(Integer, primary_key=True, index=True)
    snapshot_path = Column(String(500), nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.now)
    camera_id = Column(Integer, ForeignKey("cameras.id"), nullable=True)
    confidence = Column(Float, default=0.0)
    liveness_score = Column(Float, default=0.0)
    bounding_box = Column(JSON, default=list)
    is_reviewed = Column(Boolean, default=False)
    review_notes = Column(Text, nullable=True)
    review_by = Column(Integer, ForeignKey("admin_users.id"), nullable=True)


class SystemConfig(Base):
    """Dynamic system configuration key-value store."""
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, index=True)
    config_key = Column(String(200), unique=True, nullable=False)
    config_value = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now)


class NotificationLog(Base):
    """Notification delivery log."""
    __tablename__ = "notification_logs"

    id = Column(Integer, primary_key=True, index=True)
    notification_type = Column(String(50), nullable=False)
    recipient = Column(String(500), nullable=False)
    subject = Column(String(500), nullable=True)
    content = Column(Text, nullable=True)
    status = Column(String(50), default="pending")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now)
    sent_at = Column(DateTime, nullable=True)
