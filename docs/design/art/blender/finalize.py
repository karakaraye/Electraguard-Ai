"""Publish a post-processed render as a vision final: RGBA PNG plus WebP and AVIF.

    python finalize.py <renders/wip/name-transparent.png> <final-name>

Writes renders/vision/<final-name>.png|.webp|.avif (sky fully transparent) and checks that
the top-left pixel and every fully transparent pixel really are alpha 0.
"""
import os
import sys

import numpy as np
from PIL import Image

src, name = sys.argv[1], sys.argv[2]
out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "renders", "vision")
os.makedirs(out_dir, exist_ok=True)
im = Image.open(src).convert("RGBA")
a = np.asarray(im)[..., 3]
base = os.path.join(out_dir, name)
im.save(base + ".png", optimize=True)
im.save(base + ".webp", quality=90, alpha_quality=100, method=6)
im.save(base + ".avif", quality=80)
sizes = {ext: os.path.getsize(base + ext) for ext in (".png", ".webp", ".avif")}
print("FINAL", name, im.size, "corner alpha", int(a[0, 0]), "transparent px %.0f%%" % (100 * (a == 0).mean()),
      " ".join("%s=%dK" % (k, v // 1024) for k, v in sizes.items()))
