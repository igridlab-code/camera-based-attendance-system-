"""
Smart Attendance System - FastAPI Application Entry Point
Production-grade backend with middleware, CORS, error handling, and startup events.
"""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html
import time

import threading
from app.config import settings
from app.database import init_db
from app.auth import create_default_admin
from app.services.face_service import face_service
from app.services.camera_service import camera_manager

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format=settings.LOG_FORMAT,
    handlers=[
        logging.StreamHandler(sys.stdout),
    ]
)
logger = logging.getLogger("smart-attendance")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    
    # Initialize database
    init_db()
    
    # Create default admin if none exists
    from app.database import SessionLocal
    from app import models as app_models
    db = SessionLocal()
    try:
        create_default_admin(db)
        
        # Pre-load face recognition index
        logger.info("Loading face recognition index...")
        face_service.rebuild_index(db)

        # Auto-create default webcam camera if no cameras exist
        camera_count = db.query(app_models.Camera).count()
        if camera_count == 0:
            default_cam = app_models.Camera(
                name="Default Webcam",
                source_url="0",
                camera_type="usb",
                location="Main Entrance",
                is_active=True,
                resolution="640x480",
                fps=15,
                flip_horizontal=False,
                auto_exposure=True,
                detection_zone={},
                health_status="unknown",
            )
            db.add(default_cam)
            db.commit()
            db.refresh(default_cam)
            logger.info(f"Auto-created default webcam camera (ID={default_cam.id})")
            # Start the default camera stream
            camera_manager.add_camera(
                camera_id=default_cam.id,
                name=default_cam.name,
                source_url=default_cam.source_url,
                resolution=default_cam.resolution,
                fps=default_cam.fps,
            )
        else:
            # Start all active cameras that exist in DB
            active_cams = db.query(app_models.Camera).filter(
                app_models.Camera.is_active == True
            ).all()
            for cam in active_cams:
                try:
                    camera_manager.add_camera(
                        camera_id=cam.id,
                        name=cam.name,
                        source_url=cam.source_url,
                        resolution=cam.resolution,
                        fps=cam.fps,
                        flip_horizontal=cam.flip_horizontal,
                    )
                    logger.info(f"Started camera: {cam.name} (ID={cam.id})")
                except Exception as cam_err:
                    logger.warning(f"Could not start camera {cam.id}: {cam_err}")

    except Exception as e:
        logger.error(f"Startup error: {e}")
    finally:
        db.close()

    # Pre-load face recognition models in background thread (non-blocking)
    def _preload_face_models():
        logger.info("Pre-loading face recognition models (background)...")
        try:
            face_service._load_models()
            logger.info("Face recognition models loaded successfully")
        except Exception as e:
            logger.error(f"Face model preload error: {e}")

    threading.Thread(target=_preload_face_models, daemon=True).start()

    logger.info("Application startup complete")
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    camera_manager.stop_all()
    logger.info("Shutdown complete")


# ─── Create FastAPI App ─────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered facial recognition attendance system with liveness detection",
    docs_url=None,  # Custom docs
    redoc_url=None,
    lifespan=lifespan,
)

# ─── Middleware ─────────────────────────────────────────────────────

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request timing middleware
@app.middleware("http")
async def add_request_timing(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    
    # Log slow requests
    if duration > 1.0:
        logger.warning(f"Slow request: {request.method} {request.url.path} took {duration:.2f}s")
    
    response.headers["X-Response-Time"] = f"{duration:.3f}s"
    return response


# ─── Exception Handlers ─────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error", "type": "internal_error"},
    )


# ─── Routers ────────────────────────────────────────────────────────

from app.routers import auth, users, attendance, cameras, analytics, training, websocket

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(attendance.router, prefix="/api")
app.include_router(cameras.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(training.router, prefix="/api")
app.include_router(websocket.router)

# ─── Static Files ───────────────────────────────────────────────────

# Serve snapshot files
app.mount("/snapshots", StaticFiles(directory=str(settings.SNAPSHOTS_PATH)), name="snapshots")

# ─── Root & Health Endpoints ────────────────────────────────────────

@app.get("/")
def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    from app.services.camera_service import camera_manager
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "active_cameras": camera_manager.active_count,
        "timestamp": time.time(),
    }


@app.get("/docs", include_in_schema=False)
def custom_docs():
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title=f"{settings.APP_NAME} API Docs",
    )


# ─── Startup Validation ─────────────────────────────────────────────

@app.on_event("startup")
def validate_config():
    """Validate critical configuration on startup."""
    if settings.SECRET_KEY == "smart-attendance-secret-key-change-in-production":
        logger.warning("Using default SECRET_KEY - change this in production!")
