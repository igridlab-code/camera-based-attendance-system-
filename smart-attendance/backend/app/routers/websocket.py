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
                    await manager.send_personal(websocket, {"type": "pong", "timestamp": datetime.utcnow().isoformat()})
                
                elif action == "get_stats":
                    # Send current stats
                    await manager.send_personal(websocket, {
                        "type": "stats",
                        "active_cameras": camera_manager.active_count,
                        "timestamp": datetime.utcnow().isoformat(),
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
                    "timestamp": datetime.utcnow().isoformat(),
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
            
            # Control frame rate
            await asyncio.sleep(1 / 15)  # 15 FPS for WebSocket
            
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
    
    try:
        while True:
            frame = camera_manager.get_frame(camera_id)
            
            if frame is not None:
                frame_counter += 1
                detections_data = []
                attendance_events = []
                
                # Process every Nth frame for recognition (performance)
                if frame_counter % frame_skip == 0:
                    try:
                        annotated_frame, detected_faces = face_service.process_frame(
                            frame=frame,
                            recognize=True,
                            liveness=True,
                            enhance=True,
                        )
                        
                        for face in detected_faces:
                            face_data = {
                                "bbox": face.bbox,
                                "confidence": round(face.confidence, 3),
                                "identity": face.identity or "Unknown",
                                "user_id": face.user_id,
                                "employee_id": face.employee_id,
                                "recognition_confidence": round(face.recognition_confidence, 3),
                                "liveness_score": round(face.liveness_score, 3),
                                "is_real": face.is_real,
                                "face_id": face.face_id,
                            }
                            detections_data.append(face_data)
                            
                            # Mark attendance for recognized real faces
                            if (face.user_id and face.is_real and 
                                face.recognition_confidence >= settings.FACE_RECOGNITION_THRESHOLD):
                                
                                db = SessionLocal()
                                try:
                                    record = mark_attendance(
                                        db=db,
                                        user_id=face.user_id,
                                        camera_id=camera_id,
                                        confidence=face.recognition_confidence,
                                        liveness_score=face.liveness_score,
                                    )
                                    
                                    if record:
                                        attendance_events.append({
                                            "user_id": face.user_id,
                                            "user_name": face.identity,
                                            "employee_id": face.employee_id,
                                            "confidence": round(face.recognition_confidence, 3),
                                            "liveness_score": round(face.liveness_score, 3),
                                            "status": record.status,
                                            "timestamp": record.timestamp.isoformat(),
                                        })
                                    
                                except Exception as e:
                                    logger.debug(f"Attendance marking error: {e}")
                                finally:
                                    db.close()
                            
                            # Log unknown detections
                            elif face.identity == "Unknown" and face.confidence > 0.7:
                                db = SessionLocal()
                                try:
                                    mark_unknown_detection(
                                        db=db,
                                        camera_id=camera_id,
                                        confidence=face.confidence,
                                        liveness_score=face.liveness_score,
                                        bounding_box=list(face.bbox),
                                    )
                                except Exception:
                                    pass
                                finally:
                                    db.close()
                        
                        # Use annotated frame for streaming
                        display_frame = annotated_frame
                        
                    except Exception as e:
                        logger.error(f"Frame processing error: {e}")
                        display_frame = frame
                else:
                    display_frame = frame
                
                # Encode and send frame
                encode_params = [cv2.IMWRITE_JPEG_QUALITY, 65]
                _, buffer = cv2.imencode('.jpg', display_frame, encode_params)
                frame_b64 = base64.b64encode(buffer).decode('utf-8')
                
                message = {
                    "type": "detection_frame",
                    "camera_id": camera_id,
                    "camera_name": camera_name,
                    "frame": frame_b64,
                    "detections": detections_data,
                    "timestamp": datetime.utcnow().isoformat(),
                    "fps": camera_manager.get_camera_status(camera_id).get("fps", 0),
                }
                
                await manager.send_personal(websocket, message)
                
                # Send attendance events separately
                for event in attendance_events:
                    await manager.broadcast("attendance", {
                        "type": "attendance_marked",
                        "camera_id": camera_id,
                        "camera_name": camera_name,
                        **event,
                    })
            else:
                await manager.send_personal(websocket, {
                    "type": "status",
                    "camera_id": camera_id,
                    "connected": False,
                    "message": "Waiting for camera feed...",
                })
            
            await asyncio.sleep(1 / 10)  # 10 FPS processing rate
            
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
                        "timestamp": datetime.utcnow().isoformat(),
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
        "timestamp": datetime.utcnow().isoformat(),
    })

async def broadcast_unknown_detection(camera_id: int, camera_name: str):
    """Broadcast unknown face detection alert."""
    await manager.broadcast("attendance", {
        "type": "unknown_detected",
        "camera_id": camera_id,
        "camera_name": camera_name,
        "timestamp": datetime.utcnow().isoformat(),
    })
