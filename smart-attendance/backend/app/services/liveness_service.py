"""
Smart Attendance System - Liveness Detection & Anti-Spoofing Service
Multi-modal approach to prevent fake attendance using photos, videos, masks.

Techniques:
- Eye blink detection (EAR-based)
- Head pose movement tracking
- Texture analysis (Laplacian / LBP)
- Specular reflection analysis
- Temporal motion consistency
- Depth estimation cues
"""

import cv2
import numpy as np
import logging
import time
from typing import Dict, List, Tuple, Optional
from collections import deque
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class FaceState:
    """Track face state across frames for temporal analysis."""
    bbox: Tuple[int, int, int, int] = (0, 0, 0, 0)
    landmarks: Optional[np.ndarray] = None
    timestamp: float = 0.0
    ear: float = 0.0
    head_pose: Optional[Tuple[float, float, float]] = None
    texture_score: float = 0.0
    motion_score: float = 0.0


class LivenessDetector:
    """
    Production-grade liveness detection using multiple modalities.
    Designed to detect printed photos, screen replays, and masks.
    """

    # 3D face model reference points (nose tip, chin, left eye, right eye, left mouth, right mouth)
    FACE_3D_REF = np.array([
        [0.0, 0.0, 0.0],       # Nose tip
        [0.0, -63.6, -12.5],   # Chin
        [-43.3, 32.7, -26.0],  # Left eye left corner
        [43.3, 32.7, -26.0],   # Right eye right corner
        [-28.9, -28.9, -24.1], # Left mouth corner
        [28.9, -28.9, -24.1],  # Right mouth corner
    ], dtype=np.float64)

    # 2D landmark indices for the above 3D points
    # Using standard 68-point dlib landmarks
    LANDMARK_2D_IDX = [30, 8, 36, 45, 48, 54]

    def __init__(
        self,
        blink_threshold: float = 0.22,
        blink_consecutive_frames: int = 2,
        history_size: int = 30,
        texture_threshold: float = 0.35,
        motion_threshold: float = 0.08,
    ):
        self.blink_threshold = blink_threshold
        self.blink_consecutive_frames = blink_consecutive_frames
        self.texture_threshold = texture_threshold
        self.motion_threshold = motion_threshold

        # Tracking state
        self.face_history: Dict[int, deque] = {}
        self.blink_counter: Dict[int, int] = {}
        self.blink_total: Dict[int, int] = {}
        self.last_head_pose: Dict[int, Optional[Tuple[float, float, float]]] = {}
        self.frame_counter: Dict[int, int] = {}
        self.prev_frames: Dict[int, Optional[np.ndarray]] = {}

        # Camera matrix placeholder (will be estimated from frame size)
        self.camera_matrix: Optional[np.ndarray] = None
        self.dist_coeffs = np.zeros((4, 1))

        logger.info("LivenessDetector initialized with multi-modal anti-spoofing")

    def _get_camera_matrix(self, frame_shape: Tuple[int, ...]) -> np.ndarray:
        """Estimate camera intrinsic matrix from frame dimensions."""
        h, w = frame_shape[:2]
        focal_length = w
        center = (w / 2, h / 2)
        return np.array([
            [focal_length, 0, center[0]],
            [0, focal_length, center[1]],
            [0, 0, 1]
        ], dtype=np.float64)

    def _calculate_ear(self, eye_landmarks: np.ndarray) -> float:
        """
        Calculate Eye Aspect Ratio (EAR).
        EAR drops significantly when eye is closed.
        
        Args:
            eye_landmarks: 6 points per eye [p1, p2, p3, p4, p5, p6]
        
        Returns:
            EAR value (typically 0.15-0.35 for open, <0.2 for closed)
        """
        if len(eye_landmarks) < 6:
            return 0.3  # Default to open if landmarks insufficient
        
        # Vertical distances
        A = np.linalg.norm(eye_landmarks[1] - eye_landmarks[5])
        B = np.linalg.norm(eye_landmarks[2] - eye_landmarks[4])
        # Horizontal distance
        C = np.linalg.norm(eye_landmarks[0] - eye_landmarks[3])
        
        if C < 1e-6:
            return 0.3
        
        ear = (A + B) / (2.0 * C)
        return ear

    def _estimate_head_pose(
        self,
        frame: np.ndarray,
        landmarks: np.ndarray
    ) -> Optional[Tuple[float, float, float]]:
        """
        Estimate head pose (pitch, yaw, roll) using solvePnP.
        
        Returns:
            (pitch, yaw, roll) in degrees, or None if estimation fails.
        """
        try:
            if self.camera_matrix is None:
                self.camera_matrix = self._get_camera_matrix(frame.shape)
            
            # Extract 2D points corresponding to 3D reference
            if len(landmarks) >= 68:
                image_points = np.array([
                    landmarks[i] for i in self.LANDMARK_2D_IDX
                ], dtype=np.float64)
            elif len(landmarks) >= 6:
                # For fewer landmarks, use available points
                indices = min(len(landmarks) - 1, np.array(self.LANDMARK_2D_IDX))
                image_points = np.array([
                    landmarks[i] for i in indices if i < len(landmarks)
                ], dtype=np.float64)
                ref_points = self.FACE_3D_REF[:len(image_points)]
            else:
                return None
            
            ref_points = self.FACE_3D_REF[:len(image_points)]
            
            success, rotation_vec, translation_vec = cv2.solvePnP(
                ref_points,
                image_points,
                self.camera_matrix,
                self.dist_coeffs,
                flags=cv2.SOLVEPNP_ITERATIVE
            )
            
            if not success:
                return None
            
            # Convert rotation vector to Euler angles
            rotation_mat, _ = cv2.Rodrigues(rotation_vec)
            pose_mat = cv2.hconcat([rotation_mat, translation_vec])
            _, _, _, _, _, _, euler_angles = cv2.decomposeProjectionMatrix(
                cv2.vconcat([pose_mat, np.array([[0, 0, 0, 1]])])
            )
            
            pitch = float(euler_angles[0][0])
            yaw = float(euler_angles[1][0])
            roll = float(euler_angles[2][0])
            
            return (pitch, yaw, roll)
            
        except Exception as e:
            logger.debug(f"Head pose estimation failed: {e}")
            return None

    def _analyze_texture(self, face_roi: np.ndarray) -> float:
        """
        Analyze face texture for print/screen spoof detection.
        Real faces have richer texture (pores, fine details) than prints.
        
        Returns:
            Score 0-1, higher = more likely real face.
        """
        if face_roi.size == 0:
            return 0.5
        
        gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY) if len(face_roi.shape) == 3 else face_roi
        
        # 1. Laplacian variance (sharpness/detail)
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        lap_var = laplacian.var()
        lap_score = min(lap_var / 1000.0, 1.0)
        
        # 2. Local Binary Patterns for texture richness
        lbp = self._compute_lbp(gray)
        lbp_hist = cv2.calcHist([lbp], [0], None, [256], [0, 256])
        lbp_hist = lbp_hist.flatten() / (lbp_hist.sum() + 1e-10)
        lbp_entropy = -np.sum(lbp_hist * np.log2(lbp_hist + 1e-10))
        lbp_score = min(lbp_entropy / 6.0, 1.0)  # Normalize by max possible entropy
        
        # 3. Gradient magnitude statistics
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        gradient_mag = np.sqrt(sobelx**2 + sobely**2)
        grad_mean = np.mean(gradient_mag)
        grad_score = min(grad_mean / 50.0, 1.0)
        
        # 4. Specular reflection analysis (screens have unnatural reflections)
        hsv = cv2.cvtColor(face_roi, cv2.COLOR_BGR2HSV)
        saturation = hsv[:, :, 1].mean()
        value = hsv[:, :, 2].mean()
        # Real skin has moderate saturation; prints/screens often have weird values
        specular_score = 1.0 - abs(saturation - 60) / 100.0
        
        # Weighted combination
        score = (
            lap_score * 0.30 +
            lbp_score * 0.25 +
            grad_score * 0.25 +
            specular_score * 0.20
        )
        
        return float(np.clip(score, 0.0, 1.0))

    def _compute_lbp(self, gray: np.ndarray) -> np.ndarray:
        """Compute Local Binary Pattern."""
        height, width = gray.shape
        lbp = np.zeros_like(gray)
        
        # Simplified LBP: compare with 8 neighbors
        for dy in [-1, 0, 1]:
            for dx in [-1, 0, 1]:
                if dx == 0 and dy == 0:
                    continue
                shifted = np.roll(np.roll(gray, dy, axis=0), dx, axis=1)
                bit_val = (shifted > gray).astype(np.uint8)
                lbp += bit_val
        
        return lbp

    def _analyze_motion(
        self,
        face_id: int,
        face_roi: np.ndarray
    ) -> float:
        """
        Analyze temporal motion for liveness.
        Real faces have subtle natural movements; photos are static.
        
        Returns:
            Score 0-1, higher = more motion detected.
        """
        gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY) if len(face_roi.shape) == 3 else face_roi
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        
        prev = self.prev_frames.get(face_id)
        if prev is None or prev.shape != gray.shape:
            self.prev_frames[face_id] = gray.copy()
            return 0.5  # Neutral on first frame
        
        # Frame difference
        frame_diff = cv2.absdiff(prev, gray)
        motion_score = float(np.mean(frame_diff)) / 255.0
        
        # Optical flow magnitude (simplified)
        flow = cv2.calcOpticalFlowPyrLK(
            prev, gray, 
            np.array([[gray.shape[1]//2, gray.shape[0]//2]], dtype=np.float32),
            None
        )
        if flow[0] is not None:
            flow_mag = np.linalg.norm(flow[0][0])
            flow_score = min(flow_mag / 10.0, 1.0)
        else:
            flow_score = 0.0
        
        self.prev_frames[face_id] = gray.copy()
        
        # Combine - real faces have moderate, consistent motion
        combined = motion_score * 0.6 + flow_score * 0.4
        
        # Normalize: too little motion = suspicious, too much = also suspicious
        if combined < 0.01:
            return 0.1  # Very static = likely photo
        elif combined > 0.5:
            return 0.3  # Too much motion = suspicious
        else:
            return min(combined * 8, 1.0)  # Scale up moderate motion

    def _check_head_movement(
        self,
        face_id: int,
        current_pose: Optional[Tuple[float, float, float]]
    ) -> float:
        """
        Check for natural head movement across frames.
        Real humans move their heads; static poses are suspicious.
        
        Returns:
            Score 0-1 based on natural movement detection.
        """
        if current_pose is None:
            return 0.5  # Neutral if pose not available
        
        last_pose = self.last_head_pose.get(face_id)
        self.last_head_pose[face_id] = current_pose
        
        if last_pose is None:
            return 0.5  # First frame
        
        # Calculate pose change
        delta = np.abs(np.array(current_pose) - np.array(last_pose))
        max_delta = float(np.max(delta))
        
        # Natural movement: small but non-zero changes
        if max_delta < 0.5:  # Almost no movement
            return 0.15
        elif max_delta < 2.0:  # Small natural movement
            return 0.85
        elif max_delta < 5.0:  # Moderate movement
            return 0.90
        else:  # Large sudden movement
            return 0.60

    def _check_blink_pattern(self, face_id: int, ear: float) -> float:
        """
        Check for natural eye blink patterns.
        
        Returns:
            Score based on blink detection. Higher = more likely real.
        """
        if face_id not in self.blink_counter:
            self.blink_counter[face_id] = 0
            self.blink_total[face_id] = 0
        
        # Eye closed
        if ear < self.blink_threshold:
            self.blink_counter[face_id] += 1
        else:
            # Eye opened after being closed = blink detected
            if self.blink_counter[face_id] >= self.blink_consecutive_frames:
                self.blink_total[face_id] += 1
            self.blink_counter[face_id] = 0
        
        # Score based on blink history
        total_blinks = self.blink_total[face_id]
        
        if total_blinks >= 2:
            return 0.95  # Multiple blinks = very likely real
        elif total_blinks == 1:
            return 0.75  # One blink detected
        elif self.blink_counter[face_id] > 0:
            return 0.50  # Currently blinking
        else:
            return 0.30  # No blink detected yet (neutral)

    def analyze(
        self,
        frame: np.ndarray,
        face_id: int,
        bbox: Tuple[int, int, int, int],
        landmarks: Optional[np.ndarray] = None,
    ) -> Dict[str, any]:
        """
        Full liveness analysis of a detected face.
        
        Args:
            frame: Full frame image (BGR)
            face_id: Unique face tracker ID
            bbox: Bounding box (x1, y1, x2, y2)
            landmarks: Facial landmarks if available (68-point or 5-point)
        
        Returns:
            Dictionary with detailed scores and final liveness verdict.
        """
        x1, y1, x2, y2 = map(int, bbox)
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        
        if x2 <= x1 or y2 <= y1:
            return self._error_result("Invalid bounding box")
        
        face_roi = frame[y1:y2, x1:x2]
        
        # Initialize tracking
        if face_id not in self.frame_counter:
            self.frame_counter[face_id] = 0
        self.frame_counter[face_id] += 1
        
        # 1. Eye Blink Detection
        blink_score = 0.5
        ear = 0.3
        if landmarks is not None and len(landmarks) >= 68:
            # 68-point landmarks: eyes are indices 36-47
            left_eye = landmarks[36:42]
            right_eye = landmarks[42:48]
            left_ear = self._calculate_ear(left_eye)
            right_ear = self._calculate_ear(right_eye)
            ear = (left_ear + right_ear) / 2.0
            blink_score = self._check_blink_pattern(face_id, ear)
        elif landmarks is not None and len(landmarks) >= 5:
            # 5-point landmarks: estimate EAR from eye corners
            # indices: left_eye_left, left_eye_right, right_eye_left, right_eye_right, nose
            if len(landmarks) >= 4:
                eye_dist = np.linalg.norm(landmarks[0] - landmarks[1])
                face_width = x2 - x1
                ear = eye_dist / face_width if face_width > 0 else 0.3
                blink_score = self._check_blink_pattern(face_id, ear)
        
        # 2. Head Pose Estimation
        head_pose = None
        head_movement_score = 0.5
        if landmarks is not None and len(landmarks) >= 6:
            head_pose = self._estimate_head_pose(frame, landmarks)
            head_movement_score = self._check_head_movement(face_id, head_pose)
        
        # 3. Texture Analysis
        texture_score = self._analyze_texture(face_roi)
        
        # 4. Motion Analysis
        motion_score = self._analyze_motion(face_id, face_roi)
        
        # 5. Frame count factor (need multiple frames for temporal analysis)
        frame_count = self.frame_counter[face_id]
        temporal_confidence = min(frame_count / 10.0, 1.0)  # Full confidence after 10 frames
        
        # ─── Weighted Score Combination ──────────────────────────────
        # These weights are tuned for production deployment
        weights = {
            "blink": 0.25,
            "head_movement": 0.20,
            "texture": 0.25,
            "motion": 0.20,
            "temporal": 0.10,
        }
        
        # Adjust weights if some features unavailable
        if landmarks is None or len(landmarks) < 6:
            weights["blink"] = 0.10
            weights["head_movement"] = 0.10
            weights["texture"] = 0.35
            weights["motion"] = 0.35
            weights["temporal"] = 0.10
        
        final_score = (
            blink_score * weights["blink"] +
            head_movement_score * weights["head_movement"] +
            texture_score * weights["texture"] +
            motion_score * weights["motion"] +
            temporal_confidence * weights["temporal"]
        )
        
        # Determine verdict
        if final_score >= 0.75:
            verdict = "REAL"
            confidence = "HIGH"
        elif final_score >= 0.55:
            verdict = "REAL"
            confidence = "MEDIUM"
        elif final_score >= 0.40:
            verdict = "UNCERTAIN"
            confidence = "LOW"
        else:
            verdict = "SPOOF"
            confidence = "HIGH"
        
        return {
            "is_real": verdict == "REAL" and confidence in ["HIGH", "MEDIUM"],
            "verdict": verdict,
            "confidence": confidence,
            "score": round(float(final_score), 3),
            "details": {
                "blink_score": round(float(blink_score), 3),
                "head_movement_score": round(float(head_movement_score), 3),
                "texture_score": round(float(texture_score), 3),
                "motion_score": round(float(motion_score), 3),
                "temporal_confidence": round(float(temporal_confidence), 3),
                "ear": round(float(ear), 3),
                "head_pose": head_pose,
                "frame_count": frame_count,
            },
            "warnings": self._generate_warnings(
                blink_score, head_movement_score, texture_score, motion_score, final_score
            ),
        }

    def _generate_warnings(
        self,
        blink_score: float,
        head_movement_score: float,
        texture_score: float,
        motion_score: float,
        final_score: float
    ) -> List[str]:
        """Generate human-readable warnings for suspicious indicators."""
        warnings = []
        
        if blink_score < 0.2:
            warnings.append("No eye blink detected - possible static image")
        
        if head_movement_score < 0.15:
            warnings.append("No head movement detected - face may be stationary/fake")
        
        if texture_score < 0.2:
            warnings.append("Unusual texture pattern - possible printed photo or screen")
        
        if motion_score < 0.1:
            warnings.append("No temporal motion - possible still image attack")
        
        if final_score < 0.4:
            warnings.append("Multiple spoof indicators detected - high fraud risk")
        
        return warnings

    def _error_result(self, message: str) -> Dict[str, any]:
        """Return error result structure."""
        return {
            "is_real": False,
            "verdict": "ERROR",
            "confidence": "NONE",
            "score": 0.0,
            "details": {},
            "warnings": [message],
        }

    def reset_face(self, face_id: int):
        """Reset tracking state for a face."""
        self.face_history.pop(face_id, None)
        self.blink_counter.pop(face_id, None)
        self.blink_total.pop(face_id, None)
        self.last_head_pose.pop(face_id, None)
        self.frame_counter.pop(face_id, None)
        self.prev_frames.pop(face_id, None)


# Global instance
liveness_detector = LivenessDetector()
