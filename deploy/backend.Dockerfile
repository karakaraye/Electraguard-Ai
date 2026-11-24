FROM python:3.12.16-slim-bookworm

# onnxruntime (used by Whisper's speech detection) otherwise starts Microsoft telemetry uploads.
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 ORT_DISABLE_TELEMETRY=1
WORKDIR /app
# ffmpeg re-encodes video and voice notes (C12).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt gunicorn==27.0.1 packaging==26.2 \
    && groupadd -g 10001 app \
    && useradd -u 10001 -g app -M app \
    && install -d -m 0700 -o 10001 -g 10001 /var/lib/electraguard/media
COPY backend/manage.py ./
COPY backend/accounts ./accounts
COPY backend/config ./config
COPY backend/reports ./reports
COPY backend/reference ./reference
COPY backend/intelligence ./intelligence
COPY backend/phone_channels ./phone_channels
COPY backend/approved_answers ./approved_answers
COPY backend/discussions ./discussions
COPY backend/ops ./ops
COPY backend/publicdata ./publicdata
COPY backend/rumours ./rumours
COPY backend/security ./security
COPY backend/staff ./staff
COPY data/synthetic /data/synthetic
# load_reference_areas resolves its default dataset to /data/reference in this layout.
COPY data/reference /data/reference
COPY --chmod=0555 deploy/django-entrypoint.sh /usr/local/bin/electraguard-django
# The local Whisper model for voice-note transcripts is baked in, so the stack also runs
# offline. Build with --build-arg WHISPER_MODEL= to leave it out; transcripts are then
# reported as unavailable and voice notes still work.
ARG WHISPER_MODEL=Systran/faster-whisper-small
ARG WHISPER_REVISION=536b0662742c02347bc0e980a01041f333bce120
RUN if [ -n "$WHISPER_MODEL" ]; then \
      python -c "import sys; from huggingface_hub import snapshot_download; snapshot_download(sys.argv[1], revision=sys.argv[2], local_dir='/opt/electraguard/whisper', allow_patterns=['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.*'])" "$WHISPER_MODEL" "$WHISPER_REVISION" \
      && printf '%s\n' "$WHISPER_MODEL" > /opt/electraguard/whisper/MODEL_NAME \
      && chmod -R a+rX /opt/electraguard; \
    fi
ENV TRANSCRIPTION_MODEL=${WHISPER_MODEL:+/opt/electraguard/whisper}
USER 10001:10001
