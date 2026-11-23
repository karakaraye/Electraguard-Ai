#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -lt 3 || $# -gt 4 ]]; then
  printf 'Usage: %s DATABASE RECIPIENT_FINGERPRINT DESTINATION [PRIVATE_MEDIA_ROOT]\n' "$0" >&2
  exit 2
fi

database=$1
fingerprint=$2
destination=$3
media_root=${4:-${PRIVATE_MEDIA_ROOT:-}}
scratch=

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
cleanup() {
  rm -f -- "$temporary"
  if [[ -n $scratch ]]; then
    rm -rf -- "$scratch"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

dump=(pg_dump --dbname="$database" --no-password --format=custom --no-owner --no-privileges)
encrypt=(gpg --batch --no-tty --yes --encrypt --recipient "$fingerprint" --output "$temporary")

if [[ -n $media_root ]]; then
  : "${ELECTRAGUARD_BACKUP_SCRATCH:?Set ELECTRAGUARD_BACKUP_SCRATCH to approved encrypted scratch storage}"
  media_root=$(realpath -e -- "$media_root")
  scratch_root=$(realpath -e -- "$ELECTRAGUARD_BACKUP_SCRATCH")
  destination_root=$(realpath -e -- "$directory")
  if [[ ! -d $media_root || ! -r $media_root || ! -x $media_root || ! -d $scratch_root ]]; then
    printf 'Private media and encrypted scratch must be readable directories.\n' >&2
    exit 2
  fi
  if [[ $media_root == / || $scratch_root/ == "$media_root/"* || $destination_root/ == "$media_root/"* ]]; then
    printf 'Scratch storage and backup destination must be outside the private media directory.\n' >&2
    exit 2
  fi
  if [[ -n $(find "$media_root" ! -type f ! -type d -print -quit) ]]; then
    printf 'The private media tree must contain only regular files and directories.\n' >&2
    exit 2
  fi
  scratch=$(mktemp -d -- "$scratch_root/.electraguard-plaintext.XXXXXXXX")
  "${dump[@]}" > "$scratch/database.pgdump"
  # The database dump is staged on encrypted scratch. Media streams straight into encryption.
  tar --create --file=- --hard-dereference --transform='flags=r;s,^\.$,private-media,;s,^\./,private-media/,' \
    -C "$scratch" database.pgdump -C "$media_root" . | "${encrypt[@]}"
else
  "${dump[@]}" | "${encrypt[@]}"
fi

# Publish only once the producers and encryption succeeded.
ln -T -- "$temporary" "$destination"
printf 'Encrypted backup created. Verify a separate restore before using it for recovery.\n'
