FROM python:3.12.16-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt gunicorn==27.0.1 packaging==26.2 \
    && groupadd -g 10001 app \
    && useradd -u 10001 -g app -M app
COPY backend/manage.py ./
COPY backend/accounts ./accounts
COPY backend/config ./config
COPY backend/reports ./reports
COPY backend/reference ./reference
# load_reference_areas resolves its default dataset to /data/reference in this layout.
COPY data/reference /data/reference
COPY --chmod=0555 deploy/django-entrypoint.sh /usr/local/bin/electraguard-django
USER 10001:10001
