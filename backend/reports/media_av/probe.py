"""Identify uploaded video and audio by their contents, not their names.

ffprobe and ffmpeg can follow playlists, concat lists and network URLs. Every call
here pins the demuxer to a short allow-list and the protocol to local files, so a
crafted upload cannot make the server read other files or reach the network.
"""

import json
import subprocess
from dataclasses import dataclass

VIDEO_LIMIT_MS = 60_000
AUDIO_LIMIT_MS = 120_000
# Container timestamps are often a few frames longer than the phone's own count.
DURATION_TOLERANCE_MS = 1_000
PROBE_TIMEOUT = 30

# Declared type -> (ffprobe format names it may sniff as, demuxer to pin for decoding).
CONTAINERS = {
    "video/mp4": ({"mov", "mp4", "m4a", "3gp", "3g2", "mj2"}, "mp4"),
    "video/webm": ({"matroska", "webm"}, "matroska"),
    "audio/mp4": ({"mov", "mp4", "m4a", "3gp", "3g2", "mj2"}, "mp4"),
    "audio/webm": ({"matroska", "webm"}, "matroska"),
    "audio/ogg": ({"ogg"}, "ogg"),
    "audio/mpeg": ({"mp3"}, "mp3"),
}
VIDEO_CODECS = {"video/mp4": {"h264"}, "video/webm": {"vp8", "vp9"}}
AUDIO_CODECS = {
    "video/mp4": {"aac"}, "video/webm": {"opus", "vorbis"},
    "audio/mp4": {"aac"}, "audio/webm": {"opus"}, "audio/ogg": {"opus"}, "audio/mpeg": {"mp3"},
}
FORMAT_WHITELIST = "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,ogg,mp3"
SAFE_INPUT = ["-protocol_whitelist", "file", "-format_whitelist", FORMAT_WHITELIST]


class UnsupportedMedia(ValueError):
    """The contents are not one of the accepted container and codec pairs."""


class UnreadableMedia(ValueError):
    """The contents could not be decoded."""


@dataclass(frozen=True)
class MediaInfo:
    content_type: str
    demuxer: str
    duration_ms: int
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    has_audio: bool = False


def run_ffprobe(path):
    command = [
        "ffprobe", "-v", "error", *SAFE_INPUT, "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ]
    try:
        result = subprocess.run(command, capture_output=True, timeout=PROBE_TIMEOUT, check=False, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired as exc:
        raise UnreadableMedia("Probing timed out.") from exc
    if result.returncode != 0:
        raise UnsupportedMedia("The container is not an accepted format.")
    try:
        return json.loads(result.stdout)
    except ValueError as exc:
        raise UnreadableMedia("Probe output was unreadable.") from exc


def rotation(stream):
    for side in stream.get("side_data_list") or ():
        if "rotation" in side:
            return int(float(side["rotation"])) % 360
    return int(stream.get("tags", {}).get("rotate", 0) or 0) % 360


def frame_rate(stream):
    for key in ("avg_frame_rate", "r_frame_rate"):
        numerator, _, denominator = str(stream.get(key, "0/0")).partition("/")
        try:
            value = float(numerator) / float(denominator or 1)
        except (ValueError, ZeroDivisionError):
            continue
        if 0 < value <= 240:
            return value
    return None


def probe(path, kind, content_type):
    """Return MediaInfo when the file is the declared kind and type, else raise."""
    if content_type not in CONTAINERS or (kind == "video") != content_type.startswith("video/"):
        raise UnsupportedMedia("Undeclared container.")
    formats, demuxer = CONTAINERS[content_type]
    data = run_ffprobe(path)
    sniffed = set(data.get("format", {}).get("format_name", "").split(","))
    if not sniffed & formats:
        raise UnsupportedMedia("The contents do not match the declared type.")

    streams = data.get("streams") or []
    videos = [s for s in streams if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")]
    audios = [s for s in streams if s.get("codec_type") == "audio"]
    if any(s.get("codec_name") not in AUDIO_CODECS[content_type] for s in audios[:1]):
        raise UnsupportedMedia("The audio codec is not accepted.")

    try:
        duration_ms = round(float(data["format"]["duration"]) * 1000)
    except (KeyError, TypeError, ValueError) as exc:
        raise UnreadableMedia("The duration is unknown.") from exc
    if duration_ms <= 0:
        raise UnreadableMedia("The file has no playable content.")

    if kind == "audio":
        if not audios:
            raise UnreadableMedia("There is no audio stream.")
        return MediaInfo(content_type, demuxer, duration_ms, has_audio=True)

    if not videos:
        raise UnreadableMedia("There is no video stream.")
    stream = videos[0]
    if stream.get("codec_name") not in VIDEO_CODECS[content_type]:
        raise UnsupportedMedia("The video codec is not accepted.")
    width, height = stream.get("width"), stream.get("height")
    if not isinstance(width, int) or not isinstance(height, int) or width < 16 or height < 16:
        raise UnreadableMedia("The frame size is unknown.")
    if width * height > 4096 * 2160:
        raise UnsupportedMedia("The frame size is too large.")
    if rotation(stream) in (90, 270):
        width, height = height, width
    return MediaInfo(content_type, demuxer, duration_ms, width, height, frame_rate(stream), bool(audios))


def limit_ms(kind):
    return VIDEO_LIMIT_MS if kind == "video" else AUDIO_LIMIT_MS
