"""
Smart Attendance System - Camera Streaming Service
Manages multiple camera streams with threading for non-blocking capture.
Supports USB webcams, IP cameras (RTSP), and video files.
"""

import cv2
import numpy as np
import threading
import time
import logging
import base64
import sys
from typing import Dict, Optional, Callable, Any
from dataclasses import dataclass, field
from collections import deque

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class CameraStream:
    """Represents an active camera stream."""
    camera_id: int
    name: str
    source_url: str
    cap: Optional[cv2.VideoCapture] = None
    thread: Optional[threading.Thread] = None
    is_running: bool = False
    is_connected: bool = False
    current_frame: Optional[np.ndarray] = None
    fps: float = 0.0
    frame_count: int = 0
    error_count: int = 0
    last_frame_time: float = 0.0
    resolution: str = "640x480"
    buffer: deque = field(default_factory=lambda: deque(maxlen=settings.CAMERA_BUFFER_SIZE))
    callbacks: list = field(default_factory=list)


class CameraManager:
    """
    Manages multiple camera streams concurrently.
    Each camera runs in its own thread for non-blocking capture.
    """

    def __init__(self):
        self._streams: Dict[int, CameraStream] = {}
        self._lock = threading.RLock()
        self._next_id = 1
        self._watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True, name="CameraWatchdog")
        self._watchdog_thread.start()

    def _watchdog_loop(self):
        while True:
            time.sleep(5)
            with self._lock:
                now = time.time()
                for cid, stream in list(self._streams.items()):
                    if stream.is_running:
                        # If more than 5 seconds since last frame and we have received at least one frame
                        if stream.last_frame_time > 0 and (now - stream.last_frame_time) > 5.0:
                            logger.error(f"Camera {cid} WATCHDOG TRIGGERED: frozen for {now - stream.last_frame_time:.1f}s. Restarting...")
                            stream.is_connected = False
                            stream.is_running = False
                            
                            # Force release in separate thread as it might block
                            def _force_release(cap):
                                try:
                                    if cap: cap.release()
                                except: pass
                            
                            threading.Thread(target=_force_release, args=(stream.cap,), daemon=True).start()
                            
                            # Re-add camera
                            # We must not block the watchdog, so spawn a quick thread to re-add
                            def _re_add(c_id, s_name, s_url, s_res):
                                time.sleep(2)
                                self.add_camera(camera_id=c_id, name=s_name, source_url=s_url, resolution=s_res)
                                
                            threading.Thread(target=_re_add, args=(cid, stream.name, stream.source_url, stream.resolution), daemon=True).start()

    def add_camera(
        self,
        camera_id: int,
        name: str,
        source_url: str,
        resolution: str = "640x480",
        fps: int = 30,
        flip_horizontal: bool = False,
        callback: Optional[Callable] = None
    ) -> CameraStream:
        """
        Add and start a new camera stream.
        
        Args:
            camera_id: Database camera ID
            name: Human-readable name
            source_url: Camera source (0, 1 for webcam; rtsp:// for IP; file path)
            resolution: Target resolution string "WxH"
            fps: Target FPS
            flip_horizontal: Mirror the video
            callback: Optional callback(frame, camera_id) for each frame
        
        Returns:
            CameraStream object
        """
        with self._lock:
            # Stop existing if same ID
            if camera_id in self._streams:
                self.remove_camera(camera_id)
                
            # Check if source_url is already in use by another active camera
            for existing_id, existing_stream in self._streams.items():
                if str(existing_stream.source_url) == str(source_url) and existing_stream.is_running:
                    logger.warning(f"Camera source {source_url} is already in use by Camera {existing_id}. Cannot start Camera {camera_id}.")
                    return CameraStream(
                        camera_id=camera_id,
                        name=name,
                        source_url=source_url,
                        resolution=resolution,
                        is_running=False,
                        is_connected=False
                    )
            
            stream = CameraStream(
                camera_id=camera_id,
                name=name,
                source_url=source_url,
                resolution=resolution,
            )
            
            if callback:
                stream.callbacks.append(callback)
            
            self._streams[camera_id] = stream
            
            # Start capture thread
            stream.thread = threading.Thread(
                target=self._capture_loop,
                args=(camera_id, resolution, fps, flip_horizontal),
                daemon=True,
                name=f"Camera-{camera_id}"
            )
            stream.is_running = True
            stream.thread.start()
            
            logger.info(f"Camera {camera_id} ({name}) started from {source_url}")
            return stream

    def _capture_loop(
        self,
        camera_id: int,
        resolution: str,
        fps: int,
        flip_horizontal: bool
    ):
        """Capture loop running in separate thread."""
        stream = self._streams.get(camera_id)
        if stream is None:
            return
        
        # Parse source URL
        source = self._parse_source(stream.source_url)
        
        # Open capture
        if isinstance(source, int) and sys.platform.startswith('win'):
            cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
        else:
            cap = cv2.VideoCapture(source)
        
        if isinstance(source, int):
            # USB webcam settings
            w, h = map(int, resolution.split('x'))
            try:
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
                cap.set(cv2.CAP_PROP_FPS, fps)
            except Exception as e:
                logger.warning(f"Could not set camera properties: {e}")
        
        # Set buffer size to reduce latency
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        stream.cap = cap
        
        # Frame interval tracking for reference
        last_capture = time.time()
        
        while stream.is_running:
            try:
                ret, frame = cap.read()
                
                if not ret or frame is None:
                    stream.error_count += 1
                    if stream.error_count > 30:
                        logger.error(f"Camera {camera_id} too many errors, reconnecting...")
                        cap.release()
                        time.sleep(1)
                        if isinstance(source, int) and sys.platform.startswith('win'):
                            cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
                        else:
                            cap = cv2.VideoCapture(source)
                        if isinstance(source, int):
                            w, h = map(int, resolution.split('x'))
                            try:
                                cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
                                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
                                cap.set(cv2.CAP_PROP_FPS, fps)
                            except Exception as e:
                                logger.warning(f"Could not set camera properties on reconnect: {e}")
                        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                        
                        stream.cap = cap
                        stream.error_count = 0
                    time.sleep(0.1)
                    continue
                
                stream.error_count = 0
                stream.is_connected = True
                stream.frame_count += 1
                
                # Apply transformations
                if flip_horizontal:
                    frame = cv2.flip(frame, 1)
                
                # Update current frame
                stream.current_frame = frame.copy()
                stream.buffer.append(frame.copy())
                
                # Calculate FPS
                now = time.time()
                if now - stream.last_frame_time >= 1.0:
                    stream.fps = stream.frame_count / (now - stream.last_frame_time)
                    stream.frame_count = 0
                    stream.last_frame_time = now
                
                # Execute callbacks
                for callback in stream.callbacks:
                    try:
                        callback(frame, camera_id)
                    except Exception as e:
                        logger.error(f"Camera {camera_id} callback error: {e}")
                
                # Removed explicit time.sleep() frame rate limiting because cap.read() 
                # already blocks to the hardware refresh rate. Sleeping causes internal 
                # buffer overflows, dropped frames, and eventual thread deadlock.
                
            except Exception as e:
                logger.error(f"Camera {camera_id} capture error: {e}")
                time.sleep(0.5)
        
        cap.release()
        stream.is_connected = False
        logger.info(f"Camera {camera_id} capture stopped")

    def _parse_source(self, source_url: str):
        """Parse source URL to OpenCV-compatible source."""
        # USB webcam index
        if source_url.isdigit():
            return int(source_url)
        
        # Direct integer (already parsed)
        try:
            return int(source_url)
        except ValueError:
            pass
        
        # RTSP / HTTP stream
        if source_url.startswith(('rtsp://', 'http://', 'https://')):
            return source_url
        
        # Video file
        return source_url

    def remove_camera(self, camera_id: int):
        """Stop and remove a camera stream."""
        with self._lock:
            stream = self._streams.pop(camera_id, None)
            if stream:
                stream.is_running = False
                if stream.cap:
                    stream.cap.release()
                # Thread will exit on next iteration
                logger.info(f"Camera {camera_id} removed")

    def get_frame(self, camera_id: int) -> Optional[np.ndarray]:
        """Get the latest frame from a camera."""
        stream = self._streams.get(camera_id)
        if stream and stream.current_frame is not None:
            return stream.current_frame.copy()
        return None

    def get_frame_base64(self, camera_id: int, quality: int = 75) -> Optional[str]:
        """Get the latest frame as base64 JPEG string."""
        frame = self.get_frame(camera_id)
        if frame is None:
            return None
        
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
        _, buffer = cv2.imencode('.jpg', frame, encode_params)
        return base64.b64encode(buffer).decode('utf-8')

    def get_all_frames(self) -> Dict[int, np.ndarray]:
        """Get latest frames from all active cameras."""
        frames = {}
        for cid, stream in self._streams.items():
            if stream.current_frame is not None:
                frames[cid] = stream.current_frame.copy()
        return frames

    def get_camera_status(self, camera_id: int) -> Dict[str, Any]:
        """Get status of a camera."""
        stream = self._streams.get(camera_id)
        if not stream:
            return {"connected": False, "fps": 0, "error": "Camera not found"}
        
        return {
            "connected": stream.is_connected,
            "fps": round(stream.fps, 1),
            "frame_count": stream.frame_count,
            "error_count": stream.error_count,
            "is_running": stream.is_running,
            "name": stream.name,
            "source": stream.source_url,
        }

    def get_all_status(self) -> Dict[int, Dict[str, Any]]:
        """Get status of all cameras."""
        return {cid: self.get_camera_status(cid) for cid in self._streams}

    def test_camera(self, source_url: str, timeout: int = 5) -> Dict[str, Any]:
        """Test if a camera source is accessible."""
        source = self._parse_source(source_url)
        if isinstance(source, int) and sys.platform.startswith('win'):
            cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
        else:
            cap = cv2.VideoCapture(source)
        
        result = {
            "success": False,
            "message": "",
            "frame_width": 0,
            "frame_height": 0,
            "fps": 0.0,
        }
        
        if not cap.isOpened():
            result["message"] = "Failed to open camera source"
            return result
        
        # Try to read a frame with timeout
        start = time.time()
        frame_read = False
        
        while time.time() - start < timeout:
            ret, frame = cap.read()
            if ret and frame is not None:
                frame_read = True
                result["frame_width"] = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                result["frame_height"] = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                result["fps"] = cap.get(cv2.CAP_PROP_FPS)
                break
            time.sleep(0.1)
        
        cap.release()
        
        if frame_read:
            result["success"] = True
            result["message"] = f"Camera connected successfully at {result['frame_width']}x{result['frame_height']}"
        else:
            result["message"] = f"Camera opened but no frames received within {timeout}s"
        
        return result

    def add_callback(self, camera_id: int, callback: Callable):
        """Add a callback to an existing camera stream."""
        stream = self._streams.get(camera_id)
        if stream:
            stream.callbacks.append(callback)

    def remove_callback(self, camera_id: int, callback: Callable):
        """Remove a callback from a camera stream."""
        stream = self._streams.get(camera_id)
        if stream and callback in stream.callbacks:
            stream.callbacks.remove(callback)

    def stop_all(self):
        """Stop all camera streams."""
        with self._lock:
            for cid in list(self._streams.keys()):
                self.remove_camera(cid)
            logger.info("All camera streams stopped")

    @property
    def active_count(self) -> int:
        """Number of active camera streams."""
        return sum(1 for s in self._streams.values() if s.is_running and s.is_connected)

    @property
    def total_count(self) -> int:
        """Total number of camera streams."""
        return len(self._streams)


# Global camera manager
camera_manager = CameraManager()
