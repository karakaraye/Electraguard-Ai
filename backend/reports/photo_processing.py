from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png"}


class UnsupportedPhoto(ValueError):
    pass


def face_blur(pixels, requested):
    """Blur detected faces when requested. Returns (image, whether blur was applied)."""
    if not requested:
        return pixels, False
    return blurred_pixels(pixels), True


def blurred_pixels(pixels):
    import cv2
    import numpy as np

    from .media_av.faces import blur_faces

    frame = cv2.cvtColor(np.asarray(pixels), cv2.COLOR_RGB2BGR)
    blurred, _ = blur_faces(frame)
    return Image.fromarray(cv2.cvtColor(blurred, cv2.COLOR_BGR2RGB))


def review_copy(cleaned):
    """A face-blurred JPEG of an already cleaned photo, for reviewers."""
    with Image.open(BytesIO(cleaned), formats=["JPEG"]) as image:
        pixels = blurred_pixels(image.convert("RGB"))
    output = BytesIO()
    pixels.save(output, format="JPEG", quality=85)
    return output.getvalue()


def clean_photo(raw, content_type, blur_requested):
    try:
        with Image.open(BytesIO(raw), formats=list(FORMATS)) as image:
            if FORMATS.get(image.format) != content_type:
                raise UnsupportedPhoto
            if image.width * image.height > 16_000_000 or getattr(image, "is_animated", False):
                raise ValueError("Unsupported image dimensions.")
            oriented = ImageOps.exif_transpose(image)
            # Copy pixels into a fresh image so no decoder-provided metadata survives.
            pixels = Image.new("RGB", oriented.size, "white")
            if "A" in oriented.getbands() or "transparency" in oriented.info:
                foreground = oriented.convert("RGBA")
                pixels.paste(foreground, mask=foreground.getchannel("A"))
            else:
                pixels.paste(oriented.convert("RGB"))
    except UnidentifiedImageError as exc:
        raise UnsupportedPhoto from exc
    except (OSError, SyntaxError, Image.DecompressionBombError) as exc:
        raise ValueError("Unreadable image.") from exc

    pixels, blurred = face_blur(pixels, blur_requested)
    cleaned = BytesIO()
    pixels.save(cleaned, format="JPEG", quality=85)
    return cleaned.getvalue(), blurred
