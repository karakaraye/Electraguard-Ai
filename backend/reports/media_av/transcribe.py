"""Voice-note transcripts (plan A11) with a local Whisper model.

Transcripts are a reviewer aid only. The original voice note always stays available,
and a missing model or an unsupported language never blocks a report.
"""

import os
import subprocess
import threading
from pathlib import Path

import numpy as np
from django.conf import settings
from django.utils.module_loading import import_string

from .probe import PROBE_TIMEOUT

MAX_CHARACTERS = 10_000
# Report language -> Whisper language. Whisper has no Igbo, and Naija Pidgin is
# transcribed with the English model and labelled as such.
LANGUAGES = {"en": "en", "pcm": "en", "ha": "ha", "yo": "yo"}
_lock = threading.Lock()
_model = None


class Transcript(dict):
    """status, text, language, method."""


def unavailable(status, method=""):
    return Transcript(status=status, text=None, language="", method=method)


def pcm16k(path):
    command = [
        "ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file", "-f", "ogg", "-i", str(path),
        "-f", "s16le", "-ac", "1", "-ar", "16000", "-",
    ]
    result = subprocess.run(command, capture_output=True, timeout=PROBE_TIMEOUT * 4, check=True, stdin=subprocess.DEVNULL)
    return np.frombuffer(result.stdout, np.int16).astype(np.float32) / 32768


def whisper():
    global _model
    with _lock:
        if _model is None:
            # onnxruntime, used for speech detection, starts Microsoft usage telemetry
            # unless this is set before it loads.
            os.environ.setdefault("ORT_DISABLE_TELEMETRY", "1")
            from faster_whisper import WhisperModel

            _model = WhisperModel(str(settings.TRANSCRIPTION_MODEL), device="cpu", compute_type="int8")
        return _model


def method_name():
    folder = Path(str(settings.TRANSCRIPTION_MODEL))
    # The image build records the model's name next to the model files.
    try:
        name = (folder / "MODEL_NAME").read_text().strip()[:40]
    except OSError:
        name = folder.name
    return f"whisper-local:{name}"


def whisper_transcribe(path, report_language):
    """Transcribe a cleaned Ogg/Opus voice note. Never raises for a missing model."""
    if not getattr(settings, "TRANSCRIPTION_MODEL", ""):
        return unavailable("unavailable")
    language = LANGUAGES.get(report_language)
    if language is None:
        return unavailable("unsupported_language", method_name())
    segments, _ = whisper().transcribe(pcm16k(path), language=language, vad_filter=True, beam_size=5)
    text = " ".join(segment.text.strip() for segment in segments).strip()[:MAX_CHARACTERS]
    if not text:
        return unavailable("no_speech", method_name())
    return Transcript(status="ready", text=text, language=language, method=method_name())


def transcribe(path, report_language):
    """Entry point. TRANSCRIBER may name another callable, for example in tests."""
    configured = getattr(settings, "TRANSCRIBER", "")
    function = import_string(configured) if configured else whisper_transcribe
    return function(path, report_language)
