from io import BytesIO

from PIL import Image, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

MAX_FILE_SIZE = 2 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000
CONTENT_TYPES = {"JPEG": "image/jpeg", "PNG": "image/png"}


def read_evidence(upload):
    if not upload or not 0 < upload.size <= MAX_FILE_SIZE:
        raise ValidationError({"file": "Choose a JPEG or PNG image up to 2 MiB."})

    content = upload.read(MAX_FILE_SIZE + 1)
    try:
        with Image.open(BytesIO(content), formats=list(CONTENT_TYPES)) as image:
            if (
                len(content) > MAX_FILE_SIZE
                or image.width * image.height > MAX_IMAGE_PIXELS
                or getattr(image, "is_animated", False)
            ):
                raise ValidationError({"file": "Use a still image of at most 16 megapixels and 2 MiB."})
            content_type = CONTENT_TYPES[image.format]
            image.verify()
        with Image.open(BytesIO(content), formats=list(CONTENT_TYPES)) as image:
            image.load()
    except (OSError, SyntaxError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise ValidationError({"file": "Choose a valid JPEG or PNG image."}) from exc
    return content, content_type
