from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png"}


class UnsupportedPhoto(ValueError):
    pass


def face_blur(pixels, requested):
    """Integration point for a future verified server-side face detector."""
    return pixels, False


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
