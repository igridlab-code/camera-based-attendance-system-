"""
Smart Attendance System - FastAPI Application Entry Point
Production-grade backend with middleware, CORS, error handling, and startup events.
Serves both React frontends (admin at / and live at /live/) as static files.
"""

import logging
import sys
import os
import time
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html

from app.config import settings
from app.database import init_db
from app.auth import create_default_admin
from app.services.face_service import face_service
from app.services.camera_service import camera_manager

# ─── Logging ────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format=settings.LOG_FORMAT,
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("smart-attendance")

# ─── Static-file paths ──────────────────────────────────────────────

# Built frontends are placed here by `npm run build`
BACKEND_DIR = Path(__file__).resolve().parent.parent          # .../backend/
STATIC_ROOT = BACKEND_DIR / "static"
ADMIN_DIST  = STATIC_ROOT / "admin"
LIVE_DIST   = STATIC_ROOT / "live"

# Ensure directories exist so StaticFiles doesn't crash even before first build
ADMIN_DIST.mkdir(parents=True, exist_ok=True)
LIVE_DIST.mkdir(parents=True, exist_ok=True)


# ─── Lifespan ───────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")

    # Initialize database
    init_db()

    from app.database import SessionLocal
    from app import models as app_models
    db = SessionLocal()
    try:
        create_default_admin(db)

        # Pre-load face recognition index
        logger.info("Loading face recognition index...")
        face_service.rebuild_index(db)

        # Auto-create default webcam camera if none exist
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
            try:
                camera_manager.add_camera(
                    camera_id=default_cam.id,
                    name=default_cam.name,
                    source_url=default_cam.source_url,
                    resolution=default_cam.resolution,
                    fps=default_cam.fps,
                )
            except Exception as cam_err:
                logger.warning(f"Could not start default camera: {cam_err}")
        else:
            # Start all active cameras
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
        logger.error(f"Startup error: {e}", exc_info=True)
    finally:
        db.close()

    # Pre-load face models in background (non-blocking)
    def _preload_face_models():
        logger.info("Pre-loading face recognition models (background)...")
        try:
            face_service._load_models()
            logger.info("Face recognition models loaded successfully")
        except Exception as e:
            logger.error(f"Face model preload error: {e}")

    threading.Thread(target=_preload_face_models, daemon=True).start()

    # NOTE: The previous background scheduler that pre-created "absent" attendance
    # records for ALL registered students at the start of every window has been
    # REMOVED. That scheduler was the root cause of the bug where students who were
    # never detected by the camera still appeared in attendance records.
    #
    # Absent records are now created ONLY during attendance finalization via
    # finalize_attendance(), which marks a student ABSENT only if they received no
    # confirmed recognition during the session.

    logger.info("Application startup complete")
    logger.info(f"Admin Dashboard : http://localhost:8000/")
    logger.info(f"Live Detection  : http://localhost:8000/live/")
    logger.info(f"API Docs        : http://localhost:8000/docs")

    yield

    # Shutdown
    logger.info("Shutting down...")
    camera_manager.stop_all()
    logger.info("Shutdown complete")


# ─── FastAPI App ─────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered facial recognition attendance system with liveness detection",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)

# ─── Middleware ──────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_request_timing(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    if duration > 1.0:
        logger.warning(f"Slow request: {request.method} {request.url.path} took {duration:.2f}s")
    response.headers["X-Response-Time"] = f"{duration:.3f}s"
    return response


# ─── Exception Handlers ──────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error", "type": "internal_error"},
    )


# ─── API Routers ─────────────────────────────────────────────────────

from app.routers import (
    users, 
    cameras, 
    attendance, 
    analytics,
    training,
    auth,
    websocket,
    settings as settings_router
)
app.include_router(auth.router,       prefix="/api")
app.include_router(users.router,      prefix="/api")
app.include_router(attendance.router, prefix="/api")
app.include_router(cameras.router,    prefix="/api")
app.include_router(analytics.router,  prefix="/api")
app.include_router(training.router,   prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(websocket.router)


# ─── Static Files ────────────────────────────────────────────────────

# Snapshots directory (face images saved by the system)
app.mount("/snapshots", StaticFiles(directory=str(settings.SNAPSHOTS_PATH)), name="snapshots")

# Live detection frontend assets (JS, CSS, images)
# Mounted BEFORE the admin mount so /live/ assets resolve correctly
_live_assets = LIVE_DIST / "assets"
_live_assets.mkdir(parents=True, exist_ok=True)
app.mount("/live/assets", StaticFiles(directory=str(_live_assets)), name="live_assets")

# Admin frontend assets
_admin_assets = ADMIN_DIST / "assets"
_admin_assets.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=str(_admin_assets)), name="admin_assets")


# ─── Health & Docs Endpoints ─────────────────────────────────────────

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "active_cameras": camera_manager.active_count,
        "timestamp": time.time(),
    }


# Keep /health as alias
@app.get("/health")
def health_check_alias():
    return health_check()


@app.get("/docs", include_in_schema=False)
def custom_docs():
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title=f"{settings.APP_NAME} API Docs",
    )


# ─── SPA Catch-all Routes ────────────────────────────────────────────
# These MUST come LAST so they don't shadow API routes.

@app.get("/live/{full_path:path}", include_in_schema=False)
async def serve_live_spa(full_path: str, request: Request):
    """
    Serve the Live Detection SPA for any /live/... path.
    Returns index.html so React Router handles client-side navigation.
    """
    # First try to serve an actual file (assets, favicon, etc.)
    file_path = LIVE_DIST / full_path
    if file_path.is_file():
        return FileResponse(str(file_path))

    # Fall back to index.html for SPA routing
    index = LIVE_DIST / "index.html"
    if index.exists():
        return FileResponse(str(index))

    return JSONResponse(
        {"detail": "Live frontend not built. Run: npm run build:live"},
        status_code=503,
    )


@app.get("/live", include_in_schema=False)
async def serve_live_root():
    """Redirect /live → /live/ index."""
    index = LIVE_DIST / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse(
        {"detail": "Live frontend not built. Run: npm run build:live"},
        status_code=503,
    )


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_admin_spa(full_path: str, request: Request):
    """
    Serve the Admin Dashboard SPA for any remaining path.
    Returns index.html so React Router handles client-side navigation.
    """
    # First try to serve an actual file (favicon.ico, logo, etc.)
    file_path = ADMIN_DIST / full_path
    if file_path.is_file():
        return FileResponse(str(file_path))

    # Fall back to index.html
    index = ADMIN_DIST / "index.html"
    if index.exists():
        return FileResponse(str(index))

    return JSONResponse(
        {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "status": "running",
            "docs": "/docs",
            "note": "Admin frontend not built. Run: npm run build:admin",
        }
    )
