import os
import shutil
from functools import partial
from pathlib import Path, PurePosixPath
from tempfile import NamedTemporaryFile

from django.conf import settings
from django.db import transaction

from .models import MediaBlobDeletion


class LocalPrivateStorage:
    def __init__(self, root):
        self.root = Path(root).resolve()

    def path(self, key):
        relative = PurePosixPath(key)
        path = (self.root / relative).resolve()
        if not path.is_relative_to(self.root) or path == self.root:
            raise ValueError("Invalid private storage path.")
        return path

    def read(self, key):
        return self.path(key).open("rb")

    def write(self, key, content):
        path = self.path(key)
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        (self.root / PurePosixPath(key).parts[0]).mkdir(mode=0o700, exist_ok=True)
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        staged_path = None
        try:
            with NamedTemporaryFile(dir=path.parent, delete=False) as staging:
                staged_path = Path(staging.name)
                staging.write(content)
                staging.flush()
                os.fsync(staging.fileno())
            staged_path.replace(path)
        finally:
            if staged_path is not None:
                staged_path.unlink(missing_ok=True)

    def append(self, key, offset, content):
        # Replace atomically. A failed DB commit can leave a tail, which the
        # next write discards using the database's committed offset.
        prefix = b""
        if offset:
            with self.read(key) as staged:
                prefix = staged.read(offset)
            if len(prefix) != offset:
                raise OSError("Private staging data is incomplete.")
        self.write(key, prefix + content)

    def write_file(self, key, source):
        """Copy a local file into storage without holding it in memory."""
        path = self.path(key)
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        (self.root / PurePosixPath(key).parts[0]).mkdir(mode=0o700, exist_ok=True)
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        staged_path = None
        try:
            with NamedTemporaryFile(dir=path.parent, delete=False) as staging, open(source, "rb") as incoming:
                staged_path = Path(staging.name)
                shutil.copyfileobj(incoming, staging, 1024 * 1024)
                staging.flush()
                os.fsync(staging.fileno())
            staged_path.replace(path)
        finally:
            if staged_path is not None:
                staged_path.unlink(missing_ok=True)

    def size(self, key):
        return self.path(key).stat().st_size

    def delete(self, key):
        self.path(key).unlink(missing_ok=True)


def storage():
    return LocalPrivateStorage(settings.PRIVATE_MEDIA_ROOT)


def staging_key(upload):
    return f"{upload.organisation_id}/uploads/{upload.staging_id}.part"


def photo_key(organisation_id, media_id):
    return f"{organisation_id}/photos/{media_id}.jpg"


FOLDERS = {"photo": ("photos", "jpg"), "video": ("videos", "mp4"), "audio": ("audio", "ogg")}


def media_key(organisation_id, media_id, kind):
    """The cleaned file the observer sees; for blurred media also the reviewer's copy."""
    folder, extension = FOLDERS[kind]
    return f"{organisation_id}/{folder}/{media_id}.{extension}"


def review_key(organisation_id, media_id, kind):
    """A face-blurred copy for reviewers when the cleaned file itself is unblurred."""
    folder, extension = FOLDERS[kind]
    return f"{organisation_id}/{folder}/{media_id}.review.{extension}"


def poster_key(organisation_id, media_id, review=False):
    return f"{organisation_id}/videos/{media_id}.{'review-poster' if review else 'poster'}.jpg"


def original_key(organisation_id, media_id):
    """The verified upload, kept only until processing finishes."""
    return f"{organisation_id}/originals/{media_id}.bin"


def all_keys(organisation_id, media_id):
    keys = [original_key(organisation_id, media_id)]
    for kind in FOLDERS:
        keys += [media_key(organisation_id, media_id, kind), review_key(organisation_id, media_id, kind)]
    return keys + [poster_key(organisation_id, media_id), poster_key(organisation_id, media_id, review=True)]


def flush_deletion(pk):
    deletion = MediaBlobDeletion.objects.filter(pk=pk).first()
    if deletion:
        try:
            storage().delete(deletion.path)
        except OSError:
            return
        deletion.delete()


def schedule_delete(organisation_id, key):
    job, _ = MediaBlobDeletion.objects.get_or_create(path=key, defaults={"organisation_id": organisation_id})
    transaction.on_commit(partial(flush_deletion, job.pk), robust=True)
