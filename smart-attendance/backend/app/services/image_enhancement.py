"""
Smart Attendance System - Image Enhancement Service
Handles poor lighting, noise, blur, and exposure correction for
optimal face recognition in challenging conditions.
"""

import cv2
import numpy as np
import logging
from typing import Tuple, Optional, Dict, Any

logger = logging.getLogger(__name__)


class ImageEnhancer:
    """Production-grade image enhancement for face recognition pipelines."""

    def __init__(self):
        self.clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        self._cache = {}

    def analyze_quality(self, frame: np.ndarray) -> Dict[str, float]:
        """Analyze image quality metrics before processing."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Blur detection (Laplacian variance)
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        blur_score = min(laplacian.var() / 500.0, 1.0)
        
        # Brightness analysis
        mean_brightness = np.mean(gray)
        brightness_score = 1.0 - abs(mean_brightness - 128) / 128.0
        
        # Contrast analysis
        contrast = gray.std()
        contrast_score = min(contrast / 64.0, 1.0)
        
        # Noise estimation
        noise = self._estimate_noise(gray)
        noise_score = max(0.0, 1.0 - noise / 30.0)
        
        # Exposure analysis
        underexposed = np.sum(gray < 30) / gray.size
        overexposed = np.sum(gray > 225) / gray.size
        exposure_score = 1.0 - max(underexposed, overexposed) * 2
        
        overall = np.mean([blur_score, brightness_score, contrast_score, noise_score, exposure_score])
        
        return {
            "blur_score": round(float(blur_score), 3),
            "brightness_score": round(float(brightness_score), 3),
            "contrast_score": round(float(contrast_score), 3),
            "noise_score": round(float(noise_score), 3),
            "exposure_score": round(float(exposure_score), 3),
            "overall_score": round(float(overall), 3),
            "mean_brightness": round(float(mean_brightness), 1),
            "needs_enhancement": overall < 0.5 or brightness_score < 0.3 or blur_score < 0.3,
        }

    def _estimate_noise(self, gray: np.ndarray) -> float:
        """Estimate Gaussian noise using median absolute deviation."""
        h, w = gray.shape
        sample = gray[h//4:3*h//4, w//4:3*w//4]
        median = cv2.medianBlur(sample, 5)
        diff = cv2.absdiff(sample.astype(np.float32), median.astype(np.float32))
        return float(np.median(diff) / 0.6745)

    def enhance(self, frame: np.ndarray, quality: Optional[Dict[str, float]] = None) -> np.ndarray:
        """Full enhancement pipeline for poor quality frames."""
        if quality is None:
            quality = self.analyze_quality(frame)
        
        if not quality["needs_enhancement"]:
            return frame
        
        enhanced = frame.copy()
        
        # Apply enhancements based on quality analysis
        if quality["brightness_score"] < 0.4:
            enhanced = self._correct_low_light(enhanced)
        
        if quality["contrast_score"] < 0.4:
            enhanced = self._apply_clahe(enhanced)
        
        if quality["noise_score"] < 0.4:
            enhanced = self._reduce_noise(enhanced)
        
        if quality["blur_score"] < 0.4:
            enhanced = self._sharpen(enhanced)
        
        if quality["exposure_score"] < 0.4:
            enhanced = self._correct_exposure(enhanced)
        
        return enhanced

    def _correct_low_light(self, frame: np.ndarray) -> np.ndarray:
        """Enhance dark images using gamma correction and brightness adjustment."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mean_brightness = np.mean(gray)
        
        # Adaptive gamma based on brightness
        if mean_brightness < 40:
            gamma = 0.4
        elif mean_brightness < 80:
            gamma = 0.6
        else:
            gamma = 0.8
        
        inv_gamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype("uint8")
        enhanced = cv2.LUT(frame, table)
        
        # Additional brightness boost for very dark images
        if mean_brightness < 50:
            enhanced = cv2.convertScaleAbs(enhanced, alpha=1.2, beta=15)
        
        return enhanced

    def _apply_clahe(self, frame: np.ndarray) -> np.ndarray:
        """Apply CLAHE for local contrast enhancement."""
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l = self.clahe.apply(l)
        lab = cv2.merge([l, a, b])
        return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    def _reduce_noise(self, frame: np.ndarray) -> np.ndarray:
        """Apply bilateral filter to reduce noise while preserving edges."""
        return cv2.bilateralFilter(frame, 9, 75, 75)

    def _sharpen(self, frame: np.ndarray) -> np.ndarray:
        """Apply unsharp masking for sharpening."""
        gaussian = cv2.GaussianBlur(frame, (0, 0), 3)
        return cv2.addWeighted(frame, 1.5, gaussian, -0.5, 0)

    def _correct_exposure(self, frame: np.ndarray) -> np.ndarray:
        """Correct over/under exposed regions."""
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        
        # Histogram equalization for L channel
        l = cv2.equalizeHist(l)
        
        lab = cv2.merge([l, a, b])
        return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    def align_face(
        self,
        frame: np.ndarray,
        bbox: Tuple[int, int, int, int],
        landmarks: Optional[np.ndarray] = None,
        target_size: Tuple[int, int] = (112, 112)
    ) -> np.ndarray:
        """Extract and align face region for recognition."""
        x1, y1, x2, y2 = map(int, bbox)
        
        # Add margin
        h, w = frame.shape[:2]
        margin_x = int((x2 - x1) * 0.2)
        margin_y = int((y2 - y1) * 0.2)
        
        x1 = max(0, x1 - margin_x)
        y1 = max(0, y1 - margin_y)
        x2 = min(w, x2 + margin_x)
        y2 = min(h, y2 + margin_y)
        
        face_crop = frame[y1:y2, x1:x2]
        
        if face_crop.size == 0:
            return np.zeros((*target_size, 3), dtype=np.uint8)
        
        # Resize to target
        aligned = cv2.resize(face_crop, target_size, interpolation=cv2.INTER_AREA)
        
        return aligned

    def preprocess_for_recognition(
        self,
        face_image: np.ndarray,
        normalize: bool = True
    ) -> np.ndarray:
        """Final preprocessing before feeding to recognition model."""
        # Ensure RGB format
        if len(face_image.shape) == 2:
            face_image = cv2.cvtColor(face_image, cv2.COLOR_GRAY2RGB)
        elif face_image.shape[2] == 4:
            face_image = cv2.cvtColor(face_image, cv2.COLOR_BGRA2RGB)
        elif face_image.shape[2] == 3:
            face_image = cv2.cvtColor(face_image, cv2.COLOR_BGR2RGB)
        
        if normalize:
            face_image = face_image.astype(np.float32) / 255.0
            # Apply ImageNet normalization
            mean = np.array([0.5, 0.5, 0.5])
            std = np.array([0.5, 0.5, 0.5])
            face_image = (face_image - mean) / std
        
        return face_image


# Global enhancer instance
enhancer = ImageEnhancer()
