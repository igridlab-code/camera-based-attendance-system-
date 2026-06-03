"""
Smart Attendance System - Pydantic Schemas
Request/response models for API validation and serialization.
"""

from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from enum import Enum


# ─── Enums ──────────────────────────────────────────────────────────

class UserRole(str, Enum):
    STUDENT = "student"
    EMPLOYEE = "employee"
    VISITOR = "visitor"

class AdminRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    VIEWER = "viewer"

class CameraType(str, Enum):
    WEBCAM = "webcam"
    IP = "ip"
    CCTV = "cctv"
    FILE = "file"

class AttendanceStatus(str, Enum):
    PRESENT = "present"
    LATE = "late"
    ABSENT = "absent"
    UNKNOWN = "unknown"
    SPOOF_ATTEMPT = "spoof_attempt"

class EventSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


# ─── Auth Schemas ───────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class TokenPayload(BaseModel):
    sub: Optional[int] = None
    role: Optional[str] = None
    exp: Optional[datetime] = None

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=100)

class LoginResponse(BaseModel):
    success: bool
    token: Optional[Token] = None
    user: Optional[Dict[str, Any]] = None
    message: Optional[str] = None


# ─── User Schemas ───────────────────────────────────────────────────

class UserBase(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=200)
    employee_id: str = Field(..., min_length=1, max_length=100)
    department: Optional[str] = Field(None, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    role: UserRole = UserRole.EMPLOYEE
    is_active: bool = True
    metadata_json: Optional[Dict[str, Any]] = Field(default_factory=dict)

class UserCreate(UserBase):
    pass

class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=200)
    department: Optional[str] = Field(None, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    metadata_json: Optional[Dict[str, Any]] = None

class FaceSampleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sample_type: str
    quality_score: float
    created_at: datetime

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    employee_id: str
    department: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    role: str
    is_active: bool
    created_at: datetime
    face_samples_count: int = 0

class UserDetailOut(UserOut):
    face_embeddings: List[FaceSampleOut] = []
    metadata_json: Optional[Dict[str, Any]] = None

class UserListResponse(BaseModel):
    items: List[UserOut]
    total: int
    page: int
    page_size: int


# ─── Face Capture Schemas ───────────────────────────────────────────

class FaceCaptureRequest(BaseModel):
    user_id: int
    sample_type: str = "front"
    image_data: str = Field(..., description="Base64 encoded JPEG image")

class FaceCaptureResponse(BaseModel):
    success: bool
    embedding_id: Optional[int] = None
    quality_score: Optional[float] = None
    message: str
    face_detected: bool = False
    face_count: int = 0

class FaceQualityReport(BaseModel):
    face_detected: bool
    face_count: int
    blur_score: float
    brightness_score: float
    contrast_score: float
    alignment_score: float
    overall_score: float
    recommendations: List[str]


# ─── Attendance Schemas ─────────────────────────────────────────────

class AttendanceRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: Optional[int]
    user_name: Optional[str] = None
    user_employee_id: Optional[str] = None
    timestamp: datetime
    date: date
    time_str: Optional[str]
    camera_id: Optional[int]
    camera_name: Optional[str] = None
    confidence: float
    liveness_score: float
    status: str
    snapshot_path: Optional[str]
    is_late: bool
    late_minutes: int

class AttendanceFilter(BaseModel):
    user_id: Optional[int] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    status: Optional[str] = None
    camera_id: Optional[int] = None
    department: Optional[str] = None
    page: int = 1
    page_size: int = 50

class AttendanceStats(BaseModel):
    total_present: int
    total_late: int
    total_absent: int
    total_unknown: int
    attendance_rate: float
    late_rate: float
    peak_hour: Optional[str] = None
    department_breakdown: Dict[str, Dict[str, int]]

class DailyAttendanceSummary(BaseModel):
    date: date
    total_registered: int
    total_present: int
    total_late: int
    total_absent: int
    attendance_percentage: float


# ─── Camera Schemas ─────────────────────────────────────────────────

class CameraBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    source_url: str = Field(..., min_length=1, max_length=500)
    camera_type: CameraType = CameraType.WEBCAM
    location: Optional[str] = Field(None, max_length=300)
    is_active: bool = True
    resolution: str = "640x480"
    fps: int = 30
    flip_horizontal: bool = False
    auto_exposure: bool = True
    detection_zone: Optional[Dict[str, Any]] = Field(default_factory=dict)
    notes: Optional[str] = None

class CameraCreate(CameraBase):
    pass

class CameraUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    source_url: Optional[str] = Field(None, min_length=1, max_length=500)
    camera_type: Optional[CameraType] = None
    location: Optional[str] = Field(None, max_length=300)
    is_active: Optional[bool] = None
    resolution: Optional[str] = None
    fps: Optional[int] = None
    flip_horizontal: Optional[bool] = None
    auto_exposure: Optional[bool] = None
    detection_zone: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None

class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    source_url: str
    camera_type: str
    location: Optional[str]
    is_active: bool
    resolution: str
    fps: int
    health_status: str
    last_online_at: Optional[datetime]
    created_at: datetime

class CameraTestResponse(BaseModel):
    success: bool
    message: str
    frame_width: Optional[int] = None
    frame_height: Optional[int] = None
    fps: Optional[float] = None


# ─── Analytics Schemas ──────────────────────────────────────────────

class AttendanceTrend(BaseModel):
    date: str
    present: int
    late: int
    absent: int

class HourlyDistribution(BaseModel):
    hour: str
    count: int

class DepartmentStats(BaseModel):
    department: str
    total_users: int
    present_today: int
    attendance_rate: float

class RecognitionAccuracy(BaseModel):
    total_recognitions: int
    successful_recognitions: int
    failed_recognitions: int
    average_confidence: float
    accuracy_rate: float

class DashboardStats(BaseModel):
    total_users: int
    active_users: int
    total_cameras: int
    online_cameras: int
    today_present: int
    today_late: int
    today_attendance_rate: float
    unknown_detections_today: int
    system_health: str
    last_training_at: Optional[datetime] = None
    recognition_accuracy: float


# ─── WebSocket Schemas ──────────────────────────────────────────────

class DetectionEvent(BaseModel):
    event_type: str
    timestamp: datetime
    camera_id: int
    camera_name: str
    detections: List[Dict[str, Any]]
    frame_data: Optional[str] = None

class AttendanceEvent(BaseModel):
    event_type: str = "attendance_marked"
    timestamp: datetime
    user_id: int
    user_name: str
    employee_id: str
    confidence: float
    liveness_score: float
    camera_id: int
    camera_name: str
    status: str
    snapshot: Optional[str] = None

class SystemStatusEvent(BaseModel):
    event_type: str = "system_status"
    active_cameras: int
    total_detections_today: int
    fps: float
    cpu_usage: float
    memory_usage: float
    gpu_usage: Optional[float] = None


# ─── Training Schemas ───────────────────────────────────────────────

class TrainingStatus(BaseModel):
    is_training: bool
    progress: float
    current_step: Optional[str] = None
    total_samples: int
    processed_samples: int
    accuracy: Optional[float] = None
    loss: Optional[float] = None
    started_at: Optional[datetime] = None
    estimated_completion: Optional[datetime] = None
    last_training_at: Optional[datetime] = None
    last_accuracy: Optional[float] = None


# ─── Settings Schemas ───────────────────────────────────────────────

class SystemSettings(BaseModel):
    attendance_start_time: str = "09:00"
    attendance_end_time: str = "18:00"
    late_threshold_minutes: int = 15
    attendance_cooldown_minutes: int = 5
    face_recognition_threshold: float = 0.45
    liveness_threshold: float = 0.6
    enable_email_alerts: bool = False
    enable_sms_alerts: bool = False
    enable_telegram_alerts: bool = False
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    alert_email: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None


# ─── Notification Schemas ───────────────────────────────────────────

class NotificationRequest(BaseModel):
    notification_type: str
    recipient: str
    subject: Optional[str] = None
    content: str


# ─── Audit Log Schemas ──────────────────────────────────────────────

class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    event_type: str
    description: Optional[str]
    admin_id: Optional[int]
    ip_address: Optional[str]
    severity: str
    created_at: datetime
