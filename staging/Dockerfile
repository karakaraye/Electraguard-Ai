FROM python:3.13-slim-bookworm

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY requirements.txt /app/requirements.txt
COPY staging/requirements.txt /app/staging-requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt -r staging-requirements.txt \
    && groupadd --system track5 \
    && useradd --system --gid track5 --home-dir /app track5 \
    && install -d -o track5 -g track5 /app/staticfiles

COPY manage.py /app/manage.py
COPY config /app/config
COPY reports /app/reports
USER track5
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--worker-tmp-dir", "/tmp", "config.wsgi:application"]
