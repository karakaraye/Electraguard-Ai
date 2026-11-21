#!/bin/sh
set -eu

DJANGO_SECRET_KEY=$(cat /run/secrets/django_secret)
POSTGRES_PASSWORD=$(cat /run/secrets/database_password)
export DJANGO_SECRET_KEY POSTGRES_PASSWORD

exec "$@"
