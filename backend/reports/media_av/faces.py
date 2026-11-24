"""Automatic face blur (plan A12) with the bundled YuNet detector.

Detection runs on a fixed 640 x 640 letterboxed canvas, so the fixed-shape model works
for any photo or frame size. The threshold leans towards recall: blurring a face-like
patch that is not a face costs little, while a missed face exposes a person.
Every blur is reported as automatic. Missed faces are possible and are measured.
"""

import threading
from pathlib import Path

import cv2
import numpy as np
from django.conf import settings

CANVAS = 640
SCORE_THRESHOLD = 0.5
METHOD = "yunet-2023mar"
_local = threading.local()


class FaceDetectionUnavailable(RuntimeError):
    pass


def model_path():
    configured = getattr(settings, "FACE_DETECTOR_MODEL", "")
    return Path(configured) if configured else Path(__file__).with_name("models") / "face_detection_yunet_2023mar.onnx"


def detector():
    # OpenCV detectors are not safe to share between threads.
    cached = getattr(_local, "detector", None)
    if cached is None:
        path = model_path()
        if not path.is_file():
            raise FaceDetectionUnavailable(f"Face detector model is missing: {path}")
        try:
            cached = cv2.FaceDetectorYN.create(str(path), "", (CANVAS, CANVAS), SCORE_THRESHOLD, 0.3, 5000)
        except cv2.error as exc:
            raise FaceDetectionUnavailable("Face detector could not load.") from exc
        _local.detector = cached
    return cached


def detect(frame):
    """Return face boxes as (x, y, width, height) integers in the frame's pixels."""
    height, width = frame.shape[:2]
    scale = CANVAS / max(height, width)
    resized = cv2.resize(frame, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((CANVAS, CANVAS, 3), np.uint8)
    canvas[:resized.shape[0], :resized.shape[1]] = resized
    _, faces = detector().detect(canvas)
    if faces is None:
        return []
    return [tuple(int(round(value / scale)) for value in face[:4]) for face in faces]


def cover(box, width, height):
    """Grow a face box to cover hair, ears and chin, clipped to the frame."""
    x, y, w, h = box
    grow_x, grow_top, grow_bottom = w * 0.3, h * 0.45, h * 0.25
    left, top = max(0, int(x - grow_x)), max(0, int(y - grow_top))
    right, bottom = min(width, int(x + w + grow_x)), min(height, int(y + h + grow_bottom))
    return left, top, right, bottom


def blur_boxes(frame, boxes):
    """Pixelate then smooth each region so the face cannot be recovered. Returns a copy."""
    output = frame.copy()
    height, width = frame.shape[:2]
    for box in boxes:
        left, top, right, bottom = cover(box, width, height)
        if right - left < 2 or bottom - top < 2:
            continue
        region = output[top:bottom, left:right]
        blocks = cv2.resize(region, (6, max(1, round(6 * (bottom - top) / (right - left)))), interpolation=cv2.INTER_AREA)
        coarse = cv2.resize(blocks, (right - left, bottom - top), interpolation=cv2.INTER_NEAREST)
        kernel = max(3, ((right - left) // 4) | 1)
        output[top:bottom, left:right] = cv2.GaussianBlur(coarse, (kernel, kernel), 0)
    return output


def blur_faces(frame):
    """Detect and blur. Returns (blurred copy, number of faces found)."""
    boxes = detect(frame)
    return blur_boxes(frame, boxes), len(boxes)
