#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 3 ]]; then
  printf 'Usage: %s DATABASE RECIPIENT_FINGERPRINT DESTINATION\n' "$0" >&2
  exit 2
fi

database=$1
fingerprint=$2
destination=$3

if [[ ! $database =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ || ! $fingerprint =~ ^([0-9A-Fa-f]{40}|[0-9A-Fa-f]{64})$ ]]; then
  printf 'Provide a database name and the approved full OpenPGP fingerprint.\n' >&2
  exit 2
fi

if [[ -e $destination || -L $destination ]]; then
  printf 'The destination already exists. Use a new archive path.\n' >&2
  exit 2
fi

directory=$(dirname -- "$destination")
temporary=$(mktemp -- "$directory/.electraguard-backup.XXXXXXXX")
trap 'rm -f -- "$temporary"' EXIT

pg_dump --dbname="$database" --no-password --format=custom --no-owner --no-privileges |
  gpg --batch --no-tty --yes --encrypt --recipient "$fingerprint" --output "$temporary"

# Publish only after both sides finish. A hard link makes concurrent destinations non-overwriting.
ln -T -- "$temporary" "$destination"
printf 'Encrypted backup created. Verify a separate restore before using it for recovery.\n'
