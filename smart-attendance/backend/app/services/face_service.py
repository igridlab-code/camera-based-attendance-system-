"""
Smart Attendance System - Face Recognition Service
Core AI pipeline: detection -> alignment -> recognition -> matching.
Uses InsightFace (RetinaFace + ArcFace) for state-of-the-art accuracy.
Supports multi-angle registration, incremental updates, and GPU acceleration.
"""

import os
import cv2
import numpy as np
import pickle
import base64
import logging
import time
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass, field
from pathlib import Path

from app.config import settings
from app.services.image_enhancement import enhancer
from app.services.liveness_service import liveness_detector

logger = logging.getLogger(__name__)


@dataclass
class DetectedFace:
    """Represents a detected face with all metadata."""
    bbox: Tuple[int, int, int, int]  # x1, y1, x2, y2
    confidence: float
    landmarks: Optional[np.ndarray] = None
    embedding: Optional[np.ndarray] = None
    aligned_face: Optional[np.ndarray] = None
    face_id: int = 0
    
    # Recognition results
    identity: Optional[str] = None
    user_id: Optional[int] = None
    employee_id: Optional[str] = None
    recognition_confidence: float = 0.0
    
    # Liveness results
    liveness_score: float = 0.0
    is_real: bool = False
    liveness_details: Dict[str, Any] = field(default_factory=dict)


class FaceRecognitionService:
    """
    Production-grade face recognition pipeline.
    Handles detection, recognition, and anti-spoofing in real-time.
    """

    def __init__(self):
        self.detector = None
        self.recognizer = None
        self._initialized = False
        self._model_loading = False
        
        # In-memory embedding index for fast lookup
        self._embeddings: np.ndarray = np.zeros((0, settings.FACE_EMBEDDING_DIM), dtype=np.float32)
        self._user_ids: List[int] = []
        self._sample_ids: List[int] = []
        self._employee_ids: List[str] = []
        self._full_names: List[str] = []
        
        # Face tracker for multi-frame tracking
        self._face_tracker: Dict[int, Dict] = {}
        self._next_face_id = 1
        self._tracker_ttl = 30  # frames
        
        logger.info("FaceRecognitionService created, models will load on first use")

    def _load_models(self):
        """Lazy-load AI models to avoid slowing down startup."""
        if self._initialized or self._model_loading:
            return
        
        self._model_loading = True
        try:
            logger.info("Loading face detection and recognition models...")
            
            # Try InsightFace first (best accuracy)
            try:
                import insightface
                from insightface.app import FaceAnalysis
                
                providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if settings.ENABLE_GPU else ['CPUExecutionProvider']
                
                self.detector = FaceAnalysis(
                    name='buffalo_l',
                    root=str(settings.FACE_MODELS_PATH),
                    providers=providers
                )
                self.detector.prepare(ctx_id=0 if settings.ENABLE_GPU else -1, det_size=(640, 640))
                
                logger.info("InsightFace models loaded successfully (RetinaFace + ArcFace)")
                self._initialized = True
                
            except ImportError:
                logger.warning("InsightFace not available, falling back to OpenCV DNN detector")
                self._init_opencv_fallback()
            except Exception as e:
                logger.error(f"Failed to load InsightFace: {e}, using fallback")
                self._init_opencv_fallback()
                
        except Exception as e:
            logger.error(f"Critical error loading face models: {e}")
            raise
        finally:
            self._model_loading = False

    def _init_opencv_fallback(self):
        """Initialize OpenCV DNN face detector as fallback."""
        try:
            # Use YuNet (lightweight, good accuracy)
            model_path = str(settings.FACE_MODELS_PATH / "yunet.onnx")
            
            if not os.path.exists(model_path):
                # Download YuNet if not present
                logger.info("Downloading YuNet face detector...")
                import urllib.request
                os.makedirs(settings.FACE_MODELS_PATH, exist_ok=True)
                urllib.request.urlretrieve(
                    "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
                    model_path
                )
            
            self.detector = cv2.FaceDetectorYN_create(model_path, "", (320, 320))
            logger.info("OpenCV YuNet face detector loaded")
            
        except Exception as e:
            logger.error(f"Failed to load fallback detector: {e}")
            # Ultimate fallback: Haar cascade
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            self.detector = cv2.CascadeClassifier(cascade_path)
            logger.info("Haar cascade loaded as ultimate fallback")
        
        self._initialized = True

    def detect_faces(self, frame: np.ndarray) -> List[DetectedFace]:
        """
        Detect all faces in a frame.
        
        Returns:
            List of DetectedFace objects with bboxes, landmarks, and confidence.
        """
        self._load_models()
        
        if frame is None or frame.size == 0:
            return []
        
        h, w = frame.shape[:2]
        detected_faces: List[DetectedFace] = []
        
        try:
            # InsightFace detection
            if hasattr(self.detector, 'get'):
                faces = self.detector.get(frame)
                
                for face in faces:
                    bbox = face.bbox.astype(int)
                    x1, y1, x2, y2 = bbox
                    conf = float(face.det_score) if hasattr(face, 'det_score') else 0.9
                    
                    # Ensure valid bbox
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(w, x2), min(h, y2)
                    
                    if x2 <= x1 or y2 <= y1 or conf < 0.3:
                        continue
                    
                    landmarks = face.kps if hasattr(face, 'kps') else None
                    embedding = face.embedding if hasattr(face, 'embedding') else None
                    
                    # Align face for recognition
                    aligned = enhancer.align_face(frame, (x1, y1, x2, y2), landmarks)
                    
                    df = DetectedFace(
                        bbox=(x1, y1, x2, y2),
                        confidence=conf,
                        landmarks=landmarks,
                        embedding=embedding,
                        aligned_face=aligned,
                    )
                    detected_faces.append(df)
            
            # OpenCV YuNet detection
            elif hasattr(self.detector, 'detect'):
                self.detector.setInputSize((w, h))
                _, faces = self.detector.detect(frame)
                
                if faces is not None:
                    for face in faces:
                        x, y, fw, fh, conf = face[:5]
                        x1, y1 = int(x), int(y)
                        x2, y2 = int(x + fw), int(y + fh)
                        
                        if conf < 0.5 or x2 <= x1 or y2 <= y1:
                            continue
                        
                        # Extract landmarks if available (YuNet provides 5 landmarks)
                        landmarks = None
                        if len(face) >= 15:
                            landmarks = np.array([
                                [face[8], face[9]],    # right eye
                                [face[6], face[7]],    # left eye
                                [face[10], face[11]],  # nose tip
                                [face[14], face[15]],  # right mouth corner
                                [face[12], face[13]],  # left mouth corner
                            ])
                        
                        aligned = enhancer.align_face(frame, (x1, y1, x2, y2), landmarks)
                        
                        df = DetectedFace(
                            bbox=(x1, y1, x2, y2),
                            confidence=float(conf),
                            landmarks=landmarks,
                            aligned_face=aligned,
                        )
                        detected_faces.append(df)
            
            # Haar cascade fallback
            elif hasattr(self.detector, 'detectMultiScale'):
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = self.detector.detectMultiScale(gray, 1.1, 5, minSize=(80, 80))
                
                for (x, y, fw, fh) in faces:
                    x1, y1, x2, y2 = x, y, x + fw, y + fh
                    aligned = enhancer.align_face(frame, (x1, y1, x2, y2))
                    
                    df = DetectedFace(
                        bbox=(x1, y1, x2, y2),
                        confidence=0.7,
                        aligned_face=aligned,
                    )
                    detected_faces.append(df)
            
        except Exception as e:
            logger.error(f"Face detection error: {e}")
        
        return detected_faces

    def extract_embedding(self, face_image: np.ndarray) -> Optional[np.ndarray]:
        """Extract 512-d ArcFace embedding from aligned face image."""
        self._load_models()
        
        if face_image is None or face_image.size == 0:
            return None
        
        try:
            # InsightFace direct embedding extraction
            if hasattr(self.detector, 'get'):
                # Need to pass through detector to get embedding
                faces = self.detector.get(face_image)
                if len(faces) > 0:
                    embedding = faces[0].embedding
                    if embedding is not None:
                        # Normalize
                        norm = np.linalg.norm(embedding)
                        if norm > 0:
                            return embedding / norm
                        return embedding
            
            # Fallback: compute a simple embedding using feature extraction
            return self._compute_simple_embedding(face_image)
            
        except Exception as e:
            logger.error(f"Embedding extraction error: {e}")
            return None

    def _compute_simple_embedding(self, face_image: np.ndarray) -> np.ndarray:
        """Compute a simple feature embedding as fallback."""
        gray = cv2.cvtColor(face_image, cv2.COLOR_BGR2GRAY) if len(face_image.shape) == 3 else face_image
        gray = cv2.resize(gray, (112, 112))
        
        # Use HOG-like features
        features = []
        
        # Grid-based histograms
        grid_size = 4
        h_step = gray.shape[0] // grid_size
        w_step = gray.shape[1] // grid_size
        
        for i in range(grid_size):
            for j in range(grid_size):
                patch = gray[i*h_step:(i+1)*h_step, j*w_step:(j+1)*w_step]
                hist = cv2.calcHist([patch], [0], None, [16], [0, 256]).flatten()
                hist = hist / (hist.sum() + 1e-10)
                features.extend(hist)
        
        # Global features
        features.append(gray.mean() / 255.0)
        features.append(gray.std() / 128.0)
        
        # Pad or truncate to 512 dimensions
        features = np.array(features, dtype=np.float32)
        if len(features) < 512:
            features = np.pad(features, (0, 512 - len(features)), mode='constant')
        else:
            features = features[:512]
        
        # Normalize
        norm = np.linalg.norm(features)
        if norm > 0:
            features = features / norm
        
        return features

    def recognize_faces(
        self,
        detected_faces: List[DetectedFace],
        threshold: Optional[float] = None
    ) -> List[DetectedFace]:
        """
        Match detected faces against registered users.
        
        Args:
            detected_faces: Faces from detect_faces()
            threshold: Similarity threshold (default from settings)
        
        Returns:
            Faces with identity information filled in.
        """
        if threshold is None:
            threshold = settings.FACE_RECOGNITION_THRESHOLD
        
        if len(self._embeddings) == 0:
            # No registered users
            for face in detected_faces:
                face.identity = "Unknown"
            return detected_faces
        
        for face in detected_faces:
            if face.embedding is None and face.aligned_face is not None:
                face.embedding = self.extract_embedding(face.aligned_face)
            
            if face.embedding is None:
                face.identity = "Unknown"
                continue
            
            # Cosine similarity with all registered embeddings
            similarities = self._embeddings @ face.embedding  # dot product of normalized vectors
            
            if len(similarities) == 0:
                face.identity = "Unknown"
                continue
            
            # Get top-K matches
            top_k = min(settings.FACE_SIMILARITY_TOP_K, len(similarities))
            top_indices = np.argpartition(similarities, -top_k)[-top_k:]
            top_indices = top_indices[np.argsort(similarities[top_indices])[::-1]]
            
            best_idx = top_indices[0]
            best_score = float(similarities[best_idx])
            
            # Check if above threshold
            if best_score >= threshold:
                face.identity = self._full_names[best_idx]
                face.user_id = self._user_ids[best_idx]
                face.employee_id = self._employee_ids[best_idx]
                face.recognition_confidence = best_score
            else:
                face.identity = "Unknown"
                face.recognition_confidence = best_score
        
        return detected_faces

    def check_liveness(
        self,
        frame: np.ndarray,
        detected_faces: List[DetectedFace]
    ) -> List[DetectedFace]:
        """
        Run liveness detection on all detected faces.
        
        Args:
            frame: Original frame
            detected_faces: Faces to check
        
        Returns:
            Faces with liveness information filled in.
        """
        for i, face in enumerate(detected_faces):
            # Assign/track face ID
            face_id = self._track_face(face.bbox, i)
            face.face_id = face_id
            
            landmarks = face.landmarks
            
            # Run liveness analysis
            result = liveness_detector.analyze(
                frame=frame,
                face_id=face_id,
                bbox=face.bbox,
                landmarks=landmarks,
            )
            
            face.liveness_score = result["score"]
            face.is_real = result["is_real"]
            face.liveness_details = result
        
        # Clean up old tracks
        self._cleanup_tracks()
        
        return detected_faces

    def _track_face(self, bbox: Tuple[int, ...], idx: int) -> int:
        """Simple IOU-based face tracking across frames."""
        x1, y1, x2, y2 = bbox
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        
        best_id = None
        best_dist = float('inf')
        
        for fid, track in self._face_tracker.items():
            tcx, tcy = track['center']
            dist = np.sqrt((cx - tcx)**2 + (cy - tcy)**2)
            if dist < best_dist and dist < 250:  # 250 pixel threshold for fast movement
                best_dist = dist
                best_id = fid
        
        if best_id is not None:
            self._face_tracker[best_id]['center'] = (cx, cy)
            self._face_tracker[best_id]['bbox'] = bbox
            self._face_tracker[best_id]['ttl'] = self._tracker_ttl
            return best_id
        
        # New face
        new_id = self._next_face_id
        self._next_face_id += 1
        self._face_tracker[new_id] = {
            'center': (cx, cy),
            'bbox': bbox,
            'ttl': self._tracker_ttl,
        }
        return new_id

    def _cleanup_tracks(self):
        """Remove expired face tracks."""
        expired = []
        for fid, track in self._face_tracker.items():
            track['ttl'] -= 1
            if track['ttl'] <= 0:
                expired.append(fid)
                liveness_detector.reset_face(fid)
        
        for fid in expired:
            del self._face_tracker[fid]

    def process_frame(
        self,
        frame: np.ndarray,
        recognize: bool = True,
        liveness: bool = True,
        enhance: bool = True
    ) -> Tuple[np.ndarray, List[DetectedFace]]:
        """
        Process a single frame through the full pipeline.
        
        Pipeline: enhance -> detect -> (extract embeddings) -> recognize -> liveness
        
        Returns:
            (annotated_frame, list of DetectedFace with all metadata)
        """
        start_time = time.time()
        
        # Step 1: Enhance image quality
        if enhance:
            quality = enhancer.analyze_quality(frame)
            if quality.get("needs_enhancement", False):
                frame = enhancer.enhance(frame, quality)
        
        # Step 2: Detect faces
        detected_faces = self.detect_faces(frame)
        
        if len(detected_faces) == 0:
            return frame, []
        
        # Step 3: Extract embeddings for all faces
        for face in detected_faces:
            if face.embedding is None and face.aligned_face is not None:
                face.embedding = self.extract_embedding(face.aligned_face)
        
        # Step 4: Recognize faces
        if recognize:
            detected_faces = self.recognize_faces(detected_faces)
        
        # Step 5: Liveness detection
        if liveness:
            detected_faces = self.check_liveness(frame, detected_faces)
        
        # Step 6: Draw annotations
        annotated = self._draw_annotations(frame.copy(), detected_faces)
        
        elapsed = time.time() - start_time
        logger.debug(f"Frame processed in {elapsed*1000:.1f}ms, {len(detected_faces)} faces")
        
        return annotated, detected_faces

    def _draw_annotations(
        self,
        frame: np.ndarray,
        faces: List[DetectedFace]
    ) -> np.ndarray:
        """Draw bounding boxes, labels, and status on frame."""
        for face in faces:
            x1, y1, x2, y2 = face.bbox
            
            # Determine color based on status
            if face.identity and face.identity != "Unknown":
                if face.is_real:
                    color = (0, 255, 0)  # Green: recognized + real
                    status = f"{face.identity} ({face.recognition_confidence:.2f})"
                else:
                    color = (0, 165, 255)  # Orange: recognized but spoof suspected
                    status = f"{face.identity} [SPOOF?]"
            else:
                if face.is_real:
                    color = (0, 255, 255)  # Yellow: unknown but real
                    status = "Unknown"
                else:
                    color = (0, 0, 255)  # Red: unknown + spoof
                    status = "SPOOF DETECTED"
            
            # Draw bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            
            # Draw filled rectangle for text background
            label_size = cv2.getTextSize(status, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
            cv2.rectangle(
                frame,
                (x1, y1 - label_size[1] - 10),
                (x1 + label_size[0] + 10, y1),
                color,
                -1
            )
            cv2.putText(
                frame, status,
                (x1 + 5, y1 - 5),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2
            )
            
            # Draw landmarks if available
            if face.landmarks is not None:
                for (lx, ly) in face.landmarks.astype(int):
                    cv2.circle(frame, (lx, ly), 2, (0, 255, 0), -1)
            
            # Draw liveness score bar
            bar_x = x1
            bar_y = y2 + 15
            bar_width = x2 - x1
            bar_height = 6
            
            filled_width = int(bar_width * face.liveness_score)
            bar_color = (
                int(255 * (1 - face.liveness_score)),
                int(255 * face.liveness_score),
                0
            )
            
            cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_width, bar_y + bar_height), (50, 50, 50), -1)
            cv2.rectangle(frame, (bar_x, bar_y), (bar_x + filled_width, bar_y + bar_height), bar_color, -1)
        
        return frame

    # ─── Embedding Index Management ─────────────────────────────────

    def rebuild_index(self, db_session):
        """Rebuild the in-memory embedding index from database."""
        from app import models
        
        logger.info("Rebuilding face embedding index...")
        
        embeddings = []
        user_ids = []
        sample_ids = []
        employee_ids = []
        full_names = []
        
        samples = db_session.query(
            models.FaceEmbedding,
            models.User
        ).join(models.User).filter(models.User.is_active == True).all()
        
        for emb, user in samples:
            try:
                embedding = pickle.loads(emb.embedding)
                if embedding is not None and len(embedding) == settings.FACE_EMBEDDING_DIM:
                    # Normalize
                    norm = np.linalg.norm(embedding)
                    if norm > 0:
                        embedding = embedding / norm
                    
                    embeddings.append(embedding)
                    user_ids.append(user.id)
                    sample_ids.append(emb.id)
                    employee_ids.append(user.employee_id)
                    full_names.append(user.full_name)
            except Exception as e:
                logger.warning(f"Failed to load embedding {emb.id}: {e}")
        
        if embeddings:
            self._embeddings = np.array(embeddings, dtype=np.float32)
            self._user_ids = user_ids
            self._sample_ids = sample_ids
            self._employee_ids = employee_ids
            self._full_names = full_names
        else:
            self._embeddings = np.zeros((0, settings.FACE_EMBEDDING_DIM), dtype=np.float32)
            self._user_ids = []
            self._sample_ids = []
            self._employee_ids = []
            self._full_names = []
        
        logger.info(f"Index rebuilt with {len(embeddings)} embeddings from {len(set(user_ids))} users")

    def add_embedding_to_index(self, embedding: np.ndarray, user_id: int, sample_id: int, 
                               employee_id: str, full_name: str):
        """Add a single embedding to the live index."""
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        
        self._embeddings = np.vstack([self._embeddings, embedding.reshape(1, -1)])
        self._user_ids.append(user_id)
        self._sample_ids.append(sample_id)
        self._employee_ids.append(employee_id)
        self._full_names.append(full_name)

    def remove_user_from_index(self, user_id: int):
        """Remove all embeddings for a user."""
        mask = np.array([uid != user_id for uid in self._user_ids])
        self._embeddings = self._embeddings[mask]
        self._user_ids = [uid for uid, m in zip(self._user_ids, mask) if m]
        self._sample_ids = [sid for sid, m in zip(self._sample_ids, mask) if m]
        self._employee_ids = [eid for eid, m in zip(self._employee_ids, mask) if m]
        self._full_names = [fn for fn, m in zip(self._full_names, mask) if m]

    # ─── Quality Assessment ────────────────────────────────────────

    def assess_face_quality(self, face_image: np.ndarray) -> Dict[str, Any]:
        """Assess face image quality for registration."""
        if face_image is None or face_image.size == 0:
            return {"valid": False, "overall_score": 0.0, "message": "Empty image"}
        
        quality = enhancer.analyze_quality(face_image)
        
        # Additional face-specific checks
        gray = cv2.cvtColor(face_image, cv2.COLOR_BGR2GRAY) if len(face_image.shape) == 3 else face_image
        
        # Face size check
        min_size = 80
        h, w = gray.shape
        size_ok = h >= min_size and w >= min_size
        
        # Check if face is actually detected
        faces = self.detect_faces(face_image)
        face_detected = len(faces) > 0
        face_count = len(faces)
        
        # Alignment score (face should be roughly centered and frontal)
        alignment_score = 0.8  # Default
        if face_detected and faces[0].landmarks is not None:
            landmarks = faces[0].landmarks
            if len(landmarks) >= 5:
                # Check eye horizontal alignment
                left_eye = landmarks[0] if len(landmarks) > 0 else None
                right_eye = landmarks[1] if len(landmarks) > 1 else None
                if left_eye is not None and right_eye is not None:
                    eye_level_diff = abs(left_eye[1] - right_eye[1])
                    alignment_score = max(0, 1.0 - eye_level_diff / (h * 0.1))
        
        overall = np.mean([
            quality.get("blur_score", 0),
            quality.get("brightness_score", 0),
            quality.get("contrast_score", 0),
            alignment_score,
            1.0 if face_detected else 0.0,
        ])
        
        recommendations = []
        if quality.get("blur_score", 1) < 0.4:
            recommendations.append("Image is blurry - please hold still")
        if quality.get("brightness_score", 1) < 0.3:
            recommendations.append("Too dark - please improve lighting")
        if quality.get("brightness_score", 1) > 0.9:
            recommendations.append("Too bright - please reduce lighting")
        if not face_detected:
            recommendations.append("No face detected - please center your face")
        if face_count > 1:
            recommendations.append("Multiple faces detected - please ensure only your face is visible")
        if alignment_score < 0.6:
            recommendations.append("Face not aligned - please look directly at camera")
        
        return {
            "valid": overall >= 0.5 and face_detected and size_ok,
            "overall_score": round(float(overall), 3),
            "blur_score": quality.get("blur_score", 0),
            "brightness_score": quality.get("brightness_score", 0),
            "contrast_score": quality.get("contrast_score", 0),
            "alignment_score": round(float(alignment_score), 3),
            "face_detected": face_detected,
            "face_count": face_count,
            "recommendations": recommendations,
        }


# Global service instance
face_service = FaceRecognitionService()
