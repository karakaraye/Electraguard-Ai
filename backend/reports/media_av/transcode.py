"""Re-encode video and voice notes with all metadata removed.

Video: decode -> (optional per-frame face blur) -> H.264 MP4, at most 1280 x 720 and
30 frames per second, with AAC audio and a JPEG poster frame. Audio: Ogg/Opus 32 kbps.
Every output is written with metadata, chapters and encoder tags stripped.
"""

import subprocess
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from . import faces
from .probe import SAFE_INPUT, MediaInfo

MAX_LONG_SIDE = 1280
MAX_SHORT_SIDE = 720
MAX_FPS = 30
# Faces found in recent frames stay blurred, so a single missed frame does not flash a face.
CARRY_FRAMES = 3
TIMEOUT_SECONDS = 900
STRIP = ["-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact"]


class ProcessingFailed(RuntimeError):
    pass


@dataclass
class VideoResult:
    main: Path
    main_poster: Path
    review: Path | None = None
    review_poster: Path | None = None
    duration_ms: int = 0
    blurred: bool = False
    faces_found: int = 0
    frames: int = 0
    frames_with_faces: int = 0
    timings: dict = field(default_factory=dict)


def output_size(width, height):
    scale = min(1.0, MAX_LONG_SIDE / max(width, height), MAX_SHORT_SIDE / min(width, height))
    return max(2, int(width * scale) // 2 * 2), max(2, int(height * scale) // 2 * 2)


def encoder(source, demuxer, width, height, fps, has_audio, target):
    command = [
        "ffmpeg", "-nostdin", "-v", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", f"{fps}", "-i", "pipe:0",
    ]
    if has_audio:
        command += [*SAFE_INPUT, "-f", demuxer, "-i", str(source), "-map", "0:v:0", "-map", "1:a:0"]
    command += [
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
        "-flags:v", "+bitexact", *STRIP, "-movflags", "+faststart",
    ]
    if has_audio:
        command += ["-c:a", "aac", "-b:a", "96k", "-flags:a", "+bitexact", "-shortest"]
    command += ["-f", "mp4", str(target)]
    # Errors go to a file: an unread pipe could fill up and stall the encoder.
    log = open(f"{target}.log", "w+b")
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log)
    process.log = log
    return process


def poster(video, target):
    command = [
        "ffmpeg", "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file", "-f", "mp4", "-i", str(video),
        "-frames:v", "1", "-q:v", "4", *STRIP, "-f", "image2", "-c:v", "mjpeg", str(target),
    ]
    subprocess.run(command, check=True, timeout=120, capture_output=True, stdin=subprocess.DEVNULL)


def finish(process, deadline, name):
    process.stdin.close()
    try:
        process.wait(timeout=max(1, deadline - time.monotonic()))
    except subprocess.TimeoutExpired as exc:
        process.kill()
        raise ProcessingFailed(f"{name} timed out.") from exc
    if process.returncode != 0:
        process.log.seek(0)
        detail = process.log.read().decode(errors="replace")[-500:]
        raise ProcessingFailed(f"{name} failed: {detail}")


def process_video(source, info: MediaInfo, workdir, blur_requested):
    """Write a cleaned video. When blur was not requested, also write a blurred review copy."""
    started = time.monotonic()
    deadline = started + TIMEOUT_SECONDS
    workdir = Path(workdir)
    width, height = output_size(info.width, info.height)
    fps = round(min(info.fps or MAX_FPS, MAX_FPS), 3)
    result = VideoResult(main=workdir / "main.mp4", main_poster=workdir / "main.jpg", blurred=blur_requested)
    if not blur_requested:
        result.review, result.review_poster = workdir / "review.mp4", workdir / "review.jpg"

    decoder = subprocess.Popen(
        [
            "ffmpeg", "-nostdin", "-v", "error", *SAFE_INPUT, "-f", info.demuxer, "-i", str(source),
            "-map", "0:v:0", "-vf", f"fps={fps},scale={width}:{height}:flags=area",
            "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1",
        ],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    outputs = [encoder(source, info.demuxer, width, height, fps, info.has_audio, result.main)]
    if result.review:
        outputs.append(encoder(source, info.demuxer, width, height, fps, info.has_audio, result.review))
    frame_bytes = width * height * 3
    recent = deque(maxlen=CARRY_FRAMES)
    try:
        while True:
            if time.monotonic() > deadline:
                raise ProcessingFailed("Video processing timed out.")
            raw = decoder.stdout.read(frame_bytes)
            if len(raw) < frame_bytes:
                break
            frame = np.frombuffer(raw, np.uint8).reshape(height, width, 3)
            boxes = faces.detect(frame)
            result.frames += 1
            if boxes:
                result.frames_with_faces += 1
                result.faces_found += len(boxes)
            recent.append(boxes)
            blurred = faces.blur_boxes(frame, [box for found in recent for box in found])
            if blur_requested:
                outputs[0].stdin.write(blurred.tobytes())
            else:
                outputs[0].stdin.write(raw)
                outputs[1].stdin.write(blurred.tobytes())
        decoder.wait(timeout=max(1, deadline - time.monotonic()))
        if decoder.returncode != 0 or result.frames == 0:
            raise ProcessingFailed("The video could not be decoded.")
        for process in outputs:
            finish(process, deadline, "Video encoding")
    except BaseException:
        for process in (decoder, *outputs):
            if process.poll() is None:
                process.kill()
        raise
    finally:
        decoder.stdout.close()
        for process in outputs:
            process.log.close()

    poster(result.main, result.main_poster)
    if result.review:
        poster(result.review, result.review_poster)
    result.duration_ms = round(result.frames * 1000 / fps)
    result.timings["seconds"] = round(time.monotonic() - started, 2)
    return result


def process_audio(source, info: MediaInfo, workdir):
    target = Path(workdir) / "voice.ogg"
    command = [
        "ffmpeg", "-nostdin", "-v", "error", "-y", *SAFE_INPUT, "-f", info.demuxer, "-i", str(source),
        "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k",
        "-application", "voip", "-flags:a", "+bitexact", *STRIP, "-f", "ogg", str(target),
    ]
    try:
        subprocess.run(command, check=True, timeout=TIMEOUT_SECONDS, capture_output=True, stdin=subprocess.DEVNULL)
    except subprocess.CalledProcessError as exc:
        raise ProcessingFailed("The voice note could not be decoded.") from exc
    except subprocess.TimeoutExpired as exc:
        raise ProcessingFailed("Voice note processing timed out.") from exc
    return target
