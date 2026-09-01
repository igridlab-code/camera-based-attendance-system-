"""
WebSocket Router - Real-time attendance events and camera streaming.
Bidirectional WebSocket for live updates between backend and frontends.
"""

import asyncio
import json
import logging
import base64
import cv2
import numpy as np
from typing import Dict, Set, Optional
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.services.face_service import face_service, DetectedFace
from app.services.camera_service import camera_manager
from app.services.attendance_service import mark_attendance, mark_unknown_detection
from app.services.liveness_service import liveness_detector
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ws", tags=["WebSocket"])

# Thread-safe wrappers for DB operations to avoid SQLite thread crash
def thread_safe_mark_attendance(*args, **kwargs):
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        return mark_attendance(db=db, *args, **kwargs)
    finally:
        db.close()

def thread_safe_mark_unknown(*args, **kwargs):
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        return mark_unknown_detection(db=db, *args, **kwargs)
    finally:
        db.close()

# Connection managers for different channels
class ConnectionManager:
    """Manages WebSocket connections for real-time broadcasting."""
    
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {
            "attendance": set(),
            "camera": set(),
            "system": set(),
        }
    
    async def connect(self, websocket: WebSocket, channel: str):
        await websocket.accept()
        if channel not in self.active_connections:
            self.active_connections[channel] = set()
        self.active_connections[channel].add(websocket)
        logger.debug(f"WebSocket connected to channel: {channel}, total: {len(self.active_connections[channel])}")
    
    def disconnect(self, websocket: WebSocket, channel: str):
        if channel in self.active_connections:
            self.active_connections[channel].discard(websocket)
    
    async def broadcast(self, channel: str, message: dict):
        """Broadcast message to all connections in a channel."""
        if channel not in self.active_connections:
            return
        
        dead_connections = set()
        for connection in self.active_connections[channel]:
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.add(connection)
        
        # Clean up dead connections
        for dead in dead_connections:
            self.active_connections[channel].discard(dead)
    
    async def send_personal(self, websocket: WebSocket, message: dict):
        """Send message to a specific connection."""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.debug(f"Failed to send personal message: {e}")


manager = ConnectionManager()


# ─── WebSocket Endpoints ────────────────────────────────────────────

@router.websocket("/attendance")
async def websocket_attendance(websocket: WebSocket):
    """
    WebSocket for real-time attendance events.
    Sends: attendance_marked, unknown_detected, system_status events
    Receives: client commands (ping, subscribe)
    """
    await manager.connect(websocket, "attendance")
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                action = msg.get("action", "ping")
                
                if action == "ping":
                    await manager.send_personal(websocket, {"type": "pong", "timestamp": datetime.now().isoformat()})
                
                elif action == "get_stats":
                    # Send current stats
                    await manager.send_personal(websocket, {
                        "type": "stats",
                        "active_cameras": camera_manager.active_count,
                        "timestamp": datetime.now().isoformat(),
                    })
                
            except json.JSONDecodeError:
                pass
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, "attendance")


@router.websocket("/camera/{camera_id}")
async def websocket_camera(websocket: WebSocket, camera_id: int):
    """
    WebSocket for live camera feed streaming.
    Streams JPEG frames as base64 strings.
    """
    await manager.connect(websocket, "camera")
    
    # Start camera if not already running
    db = SessionLocal()
    try:
        from app import models
        camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
        if camera and not camera_manager.get_camera_status(camera_id).get("connected"):
            camera_manager.add_camera(
                camera_id=camera.id,
                name=camera.name,
                source_url=camera.source_url,
                resolution=camera.resolution,
                fps=camera.fps,
            )
    finally:
        db.close()
    
    try:
        frame_count = 0
        while True:
            loop_start = datetime.now()
            # Get latest frame
            frame = camera_manager.get_frame(camera_id)
            
            if frame is not None:
                # Encode as JPEG base64
                encode_params = [cv2.IMWRITE_JPEG_QUALITY, 70]
                _, buffer = cv2.imencode('.jpg', frame, encode_params)
                frame_b64 = base64.b64encode(buffer).decode('utf-8')
                
                await manager.send_personal(websocket, {
                    "type": "frame",
                    "camera_id": camera_id,
                    "frame": frame_b64,
                    "timestamp": datetime.now().isoformat(),
                })
                frame_count += 1
            else:
                # Send status update if no frame
                await manager.send_personal(websocket, {
                    "type": "status",
                    "camera_id": camera_id,
                    "connected": False,
                    "message": "Waiting for camera...",
                })
            
            # Control frame rate dynamically
            elapsed = (datetime.now() - loop_start).total_seconds()
            sleep_time = max(0.01, (1.0 / 15.0) - elapsed)
            await asyncio.sleep(sleep_time)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, "camera")
    except Exception as e:
        logger.error(f"Camera WebSocket error: {e}")
        manager.disconnect(websocket, "camera")


@router.websocket("/live-detection/{camera_id}")
async def websocket_live_detection(websocket: WebSocket, camera_id: int):
    """
    WebSocket for live face detection and attendance marking.
    This is the main pipeline: capture -> detect -> recognize -> liveness -> attendance
    """
    await manager.connect(websocket, "camera")
    
    # Ensure camera is running
    db = SessionLocal()
    camera_name = f"Camera {camera_id}"
    try:
        from app import models
        camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
        if camera:
            camera_name = camera.name
            if not camera_manager.get_camera_status(camera_id).get("connected"):
                camera_manager.add_camera(
                    camera_id=camera.id,
                    name=camera.name,
                    source_url=camera.source_url,
                    resolution=camera.resolution,
                    fps=min(camera.fps, 15),  # Limit FPS for processing
                )
    finally:
        db.close()
    
    frame_skip = settings.FRAME_PROCESSING_SKIP
    frame_counter = 0
    last_detections_data = []
    is_processing = False
    
    # Temporal buffer for identity confirmation: {user_id: count}
    identity_buffer: Dict[int, int] = {}
    
    # Keep track of unknown faces logged in this session
    logged_unknowns: Set[int] = set()
    
    last_window_info = {"window_id": 1, "next_processing": datetime.now().isoformat(), "countdown_seconds": 0}
    rec_threshold = settings.FACE_RECOGNITION_THRESHOLD
    
    def fetch_settings_sync():
        db_session = SessionLocal()
        try:
            from app.services.attendance_service import get_current_window_info
            from app.services.settings_service import get_setting
            w_info = get_current_window_info(db_session)
            threshold = float(get_setting(db_session, "recognition_confidence_threshold", settings.FACE_RECOGNITION_THRESHOLD))
            return w_info, threshold
        except Exception as e:
            logger.error(f"Error fetching settings: {e}")
            return None, None
        finally:
            db_session.close()
    
    try:
        while True:
            loop_start = datetime.now()
            frame = camera_manager.get_frame(camera_id)
            camera_status = camera_manager.get_camera_status(camera_id)
            
            if frame is not None and camera_status.get("connected"):
                frame_counter += 1                # Process Nth frame for recognition (performance) WITHOUT blocking
                if frame_counter % frame_skip == 0:
                    if frame_counter % (frame_skip * 5) == 0:
                        w_info, t_hold = await asyncio.to_thread(fetch_settings_sync)
                        if w_info is not None:
                            last_window_info = w_info
                            rec_threshold = t_hold
                            
                    if not is_processing:
                        is_processing = True
                        
                        async def background_process(f, cid, cname):
                            nonlocal last_detections_data, is_processing, identity_buffer, logged_unknowns
                            try:
                                a_f, detected_faces = await asyncio.to_thread(
                                    face_service.process_frame,
                                    frame=f,
                                    recognize=True,
                                    liveness=True,
                                    enhance=False,
                                )
                                
                                # Decay old identities slightly
                                for uid in list(identity_buffer.keys()):
                                    identity_buffer[uid] = max(0, identity_buffer[uid] - 1)
                                    if identity_buffer[uid] == 0:
                                        del identity_buffer[uid]
                                        
                                new_detections = []
                                for face in detected_faces:
                                    face_data = {
                                        "bbox": face.bbox,
                                        "identity": face.identity or "Unknown",
                                        "confidence": round(face.recognition_confidence, 3),
                                        "is_real": face.is_real,
                                        "liveness_score": round(face.liveness_score, 3),
                                        "user_id": face.user_id,
                                        "employee_id": face.employee_id,
                                        "recognition_confidence": round(face.recognition_confidence, 3),
                                        "face_id": face.face_id,
                                    }
                                    new_detections.append(face_data)
                                    
                                    # Temporal Buffer Logic
                                    if (face.user_id and face.is_real and 
                                        face.recognition_confidence >= rec_threshold):
                                        
                                        identity_buffer[face.user_id] = identity_buffer.get(face.user_id, 0) + 2
                                        
                                        if identity_buffer[face.user_id] >= 5:
                                            try:
                                                record, is_new = await asyncio.to_thread(
                                                    thread_safe_mark_attendance,
                                                    user_id=face.user_id,
                                                    camera_id=cid,
                                                    confidence=face.recognition_confidence,
                                                    liveness_score=face.liveness_score,
                                                )
                                                
                                                if record:
                                                    event_msg = {
                                                        "type": "attendance_marked",
                                                        "camera_id": cid,
                                                        "camera_name": cname,
                                                        "user_id": face.user_id,
                                                        "user_name": face.identity,
                                                        "employee_id": face.employee_id,
                                                        "confidence": round(face.recognition_confidence, 3),
                                                        "liveness_score": round(face.liveness_score, 3),
                                                        "status": record.status,
                                                        "timestamp": record.timestamp.isoformat(),
                                                        "in_time": record.in_time.strftime("%H:%M:%S") if record.in_time else None,
                                                        "out_time": record.out_time.strftime("%H:%M:%S") if record.out_time else None,
                                                        "window_id": record.attendance_window_id,
                                                    }
                                                    if is_new:
                                                        await manager.send_personal(websocket, event_msg)
                                                        await manager.broadcast("attendance", event_msg)
                                            except Exception as e:
                                                logger.debug(f"Attendance marking error: {e}")
                                            
                                            identity_buffer[face.user_id] = 5
                                            
                                    # Log unknown detections (save full frame instead of cropped zoom)
                                    elif face.identity == "Unknown" and face.confidence > 0.7:
                                        if face.face_id not in logged_unknowns:
                                            try:
                                                import uuid
                                                import os
                                                
                                                filename = f"unknown_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.jpg"
                                                filepath = os.path.join(settings.SNAPSHOTS_PATH, filename)
                                                # Save full frame instead of face.aligned_face
                                                cv2.imwrite(filepath, a_f)
                                                snapshot_url = f"/snapshots/{filename}"
                                                    
                                                await asyncio.to_thread(
                                                    thread_safe_mark_unknown,
                                                    camera_id=cid,
                                                    confidence=face.confidence,
                                                    liveness_score=face.liveness_score,
                                                    snapshot_path=snapshot_url,
                                                    bounding_box=[int(x) for x in face.bbox],
                                                )
                                                logged_unknowns.add(face.face_id)
                                            except Exception as e:
                                                logger.error(f"Failed to save unknown face: {e}")
                                
                                last_detections_data = new_detections
                                
                            except Exception as e:
                                logger.error(f"Frame processing error: {e}")
                            finally:
                                is_processing = False
                                
                        asyncio.create_task(background_process(frame.copy(), camera_id, camera_name))
                
                # Draw the latest known detections on the current frame
                display_frame = frame.copy()
                detections_data = last_detections_data
                
                for face_data in detections_data:
                    x1, y1, x2, y2 = [int(v) for v in face_data["bbox"]]
                    if face_data["identity"] != "Unknown":
                        color = (0, 255, 0) if face_data["is_real"] else (0, 165, 255)
                    else:
                        color = (0, 255, 255) if face_data["is_real"] else (0, 0, 255)
                    cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)
                
                encode_params = [cv2.IMWRITE_JPEG_QUALITY, 65]
                _, buffer = cv2.imencode('.jpg', display_frame, encode_params)
                frame_b64 = base64.b64encode(buffer).decode('utf-8')
                
                message = {
                    "type": "detection_frame",
                    "camera_id": camera_id,
                    "camera_name": camera_name,
                    "frame": frame_b64,
                    "detections": detections_data,
                    "timestamp": datetime.now().isoformat(),
                    "fps": camera_status.get("fps", 0),
                    "window_info": last_window_info,
                    "camera_status": camera_status,
                }
                
                await manager.send_personal(websocket, message)
            else:
                # Handle frozen/reconnecting states gracefully
                state_msg = "Waiting for camera feed..."
                if camera_status and camera_status.get("is_running") and not camera_status.get("connected"):
                    state_msg = "Camera is RECONNECTING or frozen..."
                
                await manager.send_personal(websocket, {
                    "type": "error",
                    "camera_id": camera_id,
                    "connected": False,
                    "message": state_msg,
                    "camera_status": camera_status,
                })
                # Add a small delay so we don't spin if there's no frame
                await asyncio.sleep(0.5)
            
            # Maintain steady FPS
            elapsed = (datetime.now() - loop_start).total_seconds()
            sleep_time = max(0.01, (1.0 / 15.0) - elapsed)
            await asyncio.sleep(sleep_time)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, "camera")
    except Exception as e:
        logger.error(f"Live detection WebSocket error: {e}")
        manager.disconnect(websocket, "camera")


@router.websocket("/system")
async def websocket_system(websocket: WebSocket):
    """WebSocket for system status updates."""
    await manager.connect(websocket, "system")
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                action = msg.get("action")
                
                if action == "get_status":
                    await manager.send_personal(websocket, {
                        "type": "system_status",
                        "active_cameras": camera_manager.active_count,
                        "timestamp": datetime.now().isoformat(),
                    })
                    
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, "system")


# ─── Helper Functions for Broadcasting ──────────────────────────────

async def broadcast_attendance_event(event: dict):
    """Broadcast attendance event to all connected clients."""
    await manager.broadcast("attendance", {
        "type": "attendance_marked",
        **event,
        "timestamp": datetime.now().isoformat(),
    })

async def broadcast_unknown_detection(camera_id: int, camera_name: str):
    """Broadcast unknown face detection alert."""
    await manager.broadcast("attendance", {
        "type": "unknown_detected",
        "camera_id": camera_id,
        "camera_name": camera_name,
        "timestamp": datetime.now().isoformat(),
    })
