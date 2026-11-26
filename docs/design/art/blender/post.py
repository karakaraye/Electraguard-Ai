"""Blend a render into the page: lift the paper out as transparency, fade the edges, and
write <out>.png (composited on the page paper #faf8f3) and <out>-transparent.png (RGBA).

    python post.py <raw.png> <out.png> <profile> [<width>]

profile: hero, phone, footer, plain (see PROFILES). An optional width resizes the result.

Paper is removed with a colour-to-alpha step against #faf8f3: every pixel becomes the least
opaque colour that, laid over the paper, gives back the rendered pixel. On the page paper
the result is pixel-identical to the render; on a slightly different paper the sky and the
lit ground disappear instead of showing as a rectangle. Edge fades then multiply the alpha.
"""
import sys

import numpy as np
from PIL import Image

PAPER = np.array([0xFA, 0xF8, 0xF3], dtype=np.float32) / 255.0


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# Fractions of width/height. l0..l1: the left fade (0 before l0, full after l1); r, t, b: width
# of the right, top and bottom fades. ellipse: an extra radial fade so corners round off.
# crop_b: fraction of empty ground trimmed off the bottom before fading.
PROFILES = {
    "hero": dict(l0=0.29, l1=0.37, lpow=1.8, r=0.10, t=0.08, b=0.16, ellipse=(0.64, 0.50, 0.70, 0.70), crop_b=0.08),
    "phone": dict(l0=0.0, l1=0.16, lpow=1.0, r=0.16, t=0.16, b=0.20, ellipse=(0.5, 0.5, 0.72, 0.70)),
    "footer": dict(l0=0.0, l1=0.20, lpow=1.0, r=0.16, t=0.22, b=0.30, ellipse=(0.5, 0.5, 0.74, 0.80)),
    "plain": dict(l0=0.0, l1=0.04, lpow=1.0, r=0.04, t=0.06, b=0.06, ellipse=None),
}


def colour_to_alpha(rgb):
    """rgb in 0..1 on paper -> (fg, alpha) with fg over PAPER at alpha == rgb."""
    up = np.where(rgb > PAPER, (rgb - PAPER) / (1.0 - PAPER + 1e-6), 0.0)
    down = np.where(rgb < PAPER, (PAPER - rgb) / (PAPER + 1e-6), 0.0)
    a = np.max(np.maximum(up, down), axis=-1)
    a = np.clip(a, 0.0, 1.0)
    safe = np.maximum(a, 1e-4)[..., None]
    fg = (rgb - (1.0 - a[..., None]) * PAPER) / safe
    return np.clip(fg, 0.0, 1.0), a


def mask_for(h, w, p):
    u = (np.arange(w, dtype=np.float32) + 0.5) / w
    v = (np.arange(h, dtype=np.float32) + 0.5) / h  # 0 = top
    ml = smooth(p["l0"], p["l1"], u) ** p["lpow"]
    mr = smooth(0.0, p["r"], 1 - u)
    mt = smooth(0.0, p["t"], v)
    mb = smooth(0.0, p["b"], 1 - v)
    m = (mt[:, None] * mb[:, None]) * (ml[None, :] * mr[None, :])
    if p.get("ellipse"):
        cx, cy, rx, ry = p["ellipse"]
        d = np.sqrt(((u[None, :] - cx) / rx) ** 2 + ((v[:, None] - cy) / ry) ** 2)
        m = m * (1.0 - smooth(0.82, 1.0, d))
    return m


def process(raw, out, profile, width=None):
    src = Image.open(raw).convert("RGBA")
    if width and width != src.width:
        hgt = round(src.height * width / src.width)
        # resize premultiplied so transparent edges stay clean
        arr = np.asarray(src).astype(np.float32) / 255.0
        pm = np.dstack([arr[..., :3] * arr[..., 3:4], arr[..., 3:4]])
        chans = [Image.fromarray(pm[..., i], "F").resize((width, hgt), Image.LANCZOS) for i in range(4)]
        pm = np.dstack([np.asarray(c) for c in chans]).clip(0, 1)
        a = pm[..., 3:4]
        arr = np.dstack([np.where(a > 1e-4, pm[..., :3] / np.maximum(a, 1e-4), 0.0), a])
    else:
        arr = np.asarray(src).astype(np.float32) / 255.0
    p = PROFILES[profile]
    if p.get("crop_b"):
        arr = arr[: round(arr.shape[0] * (1 - p["crop_b"]))]
    h, w = arr.shape[:2]
    on_paper = arr[..., :3] * arr[..., 3:4] + PAPER * (1 - arr[..., 3:4])
    fg, a = colour_to_alpha(on_paper)
    a = a * mask_for(h, w, p)
    a8 = np.round(a * 255.0)
    fg8 = np.where(a8[..., None] > 0, np.round(fg * 255.0), 0)
    trans = np.dstack([fg8, a8]).clip(0, 255).astype(np.uint8)
    Image.fromarray(trans, "RGBA").save(out[:-4] + "-transparent.png", optimize=True)
    al = a8[..., None] / 255.0
    comp = fg8 * al + PAPER * 255.0 * (1 - al)
    Image.fromarray(comp.round().clip(0, 255).astype(np.uint8), "RGB").save(out, optimize=True)
    edge = max(a8[0].max(), a8[-1].max(), a8[:, 0].max(), a8[:, -1].max())
    print("POST", out, f"{w}x{h}", "max edge alpha", int(edge))


if __name__ == "__main__":
    process(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else None)
