"""Cut the rendered passes into web layers for one view.

    python pack.py <work/view> <out_dir> <view> <live_still.png>

Settings used for frontend/public/art/hero-motion/:
    desktop: SHADOW_SCALE=0.25 DENS='{"2x":1.0,"1x":0.5}' FIG_Q=36 PATCH_Q=42
    phone:   SHADOW_SCALE=0.25 DENS='{"2x":1.0}' FIG_Q=42
The choreography the page plays is frontend/app/(public)/_components/landing/hero-motion.json
(choreography.json here is a copy for reference).

Writes, per view: sprite sheets (figures and their ground shadows) per character set, the
pole occluders, the neem crown, the people/crown patches (the plate where the still shows
people or the crown), the fade mask, and <view>.json with every cell, anchor and the camera.
"""
import glob
import io
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import post  # noqa: E402

WORK, OUT, VIEW, LIVE = sys.argv[1:5]
os.makedirs(OUT, exist_ok=True)
PAPER = np.array([250, 248, 243], np.float32)
PROFILE = "hero" if VIEW == "desktop" else "phone"
P = post.PROFILES[PROFILE]
RAW_H = 1000 if VIEW == "desktop" else 600
CROP_H = round(RAW_H * (1 - P.get("crop_b", 0))) if P.get("crop_b") else RAW_H
FIG_SCALE = float(os.environ.get("FIG_SCALE", "1.0"))
SHADOW_SCALE = float(os.environ.get("SHADOW_SCALE", "0.35"))
FIG_Q = int(os.environ.get("FIG_Q", "52"))
# densities: name -> scale of the figure sheets (the page picks one by devicePixelRatio)
DENS = json.loads(os.environ.get("DENS", '{"2x": 0.85, "1x": 0.5}'))
SKIP = {"standB", "stepB", "wait"}
sizes = {}


def save(im, name, q_webp=80, q_avif=60, lossless_alpha=False, sub="4:2:0"):
    paths = {}
    for fmt, ext, kw in (("WEBP", ".webp", dict(quality=q_webp, method=6, alpha_quality=90 if lossless_alpha else 80)),
                         ("AVIF", ".avif", dict(quality=q_avif, speed=4, subsampling=sub))):
        buf = io.BytesIO()
        im.save(buf, fmt, **kw)
        data = buf.getvalue()
        open(os.path.join(OUT, name + ext), "wb").write(data)
        sizes[name + ext] = len(data)
        paths[ext] = name + ext
    return paths


def load(p):
    return np.asarray(Image.open(p).convert("RGBA")).astype(np.float32) / 255.0


cam = json.load(open(os.path.join(WORK, "camera.json")))

# ---------- the fade mask (post.py's, as an alpha image) ----------
mask = post.mask_for(CROP_H, cam["w"], P)
m8 = Image.fromarray((mask * 255).round().astype(np.uint8), "L").resize((cam["w"] // 4, CROP_H // 4), Image.LANCZOS)
mimg = Image.new("RGBA", m8.size, (0, 0, 0, 0))
mimg.putalpha(m8)
mimg.save(os.path.join(OUT, "fade-mask.webp"), lossless=True, method=6)
sizes["fade-mask.webp"] = os.path.getsize(os.path.join(OUT, "fade-mask.webp"))


# ---------- sprites ----------
def shadow_colour():
    vals = []
    for f in glob.glob(os.path.join(WORK, "*-A.png"))[:6]:
        a4 = np.asarray(Image.open(f).convert("RGBA")).astype(np.float32)
        a = a4[..., :3]
        lum = a.mean(-1)
        sel = (lum < 245) & (lum > 180) & (np.abs(a[..., 0] - a[..., 2]) < 40) & (a4[..., 3] > 250)
        if sel.any():
            vals.append(np.median(a[sel], axis=0))
    return np.median(np.array(vals), axis=0)


SH = shadow_colour()
MUL = np.clip(SH / PAPER * 255.0, 0, 255)
print("shadow colour", SH, "multiply", MUL)


def cut(name):
    A4 = np.asarray(Image.open(os.path.join(WORK, name + "-A.png")).convert("RGBA")).astype(np.float32)
    A, A_alpha = A4[..., :3], A4[..., 3] / 255.0
    B = load(os.path.join(WORK, name + "-B.png"))
    af = B[..., 3]
    # the ground shadow: how far each pixel goes from paper toward the shadow colour
    t = ((PAPER - A) * (PAPER - SH)).sum(-1) / ((PAPER - SH) ** 2).sum()
    sh = np.clip(t, 0, 1) * (1 - af) * (A_alpha > 0.99)
    sh[sh < 0.04] = 0
    return B, sh


meta_all = {}
for mf in sorted(glob.glob(os.path.join(WORK, "meta-*.json"))):
    setname = os.path.basename(mf)[5:-5]
    if setname == "poles":
        continue
    frames = [f for f in json.load(open(mf)) if f["name"] not in SKIP]
    cuts = []
    for fr in frames:
        B, sh = cut(f"{setname}-{fr['name']}")
        ys, xs = np.nonzero(B[..., 3] > 0.004)
        sy, sx = np.nonzero(sh > 0)
        cuts.append((fr, B, sh, (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1), (sx.min(), sy.min(), sx.max() + 1, sy.max() + 1) if len(sx) else None))
    # common cell: every frame's anchor lands on the same spot in its cell
    def cell(boxes):
        l = max(fr["anchor_px"][0] - b[0] for fr, b in boxes)
        t = max(fr["anchor_px"][1] - b[1] for fr, b in boxes)
        r = max(b[2] - fr["anchor_px"][0] for fr, b in boxes)
        bt = max(b[3] - fr["anchor_px"][1] for fr, b in boxes)
        return int(np.ceil(l)) + 1, int(np.ceil(t)) + 1, int(np.ceil(r)) + 1, int(np.ceil(bt)) + 1
    fl, ft, fr_, fb = cell([(c[0], c[3]) for c in cuts])
    sl, st, sr, sb = cell([(c[0], c[4]) for c in cuts if c[4]])
    cw, ch = fl + fr_, ft + fb
    scw, sch = sl + sr, st + sb
    fig = np.zeros((ch, cw * len(cuts), 4), np.float32)
    names = [c[0]["name"] for c in cuts]

    def shadow_src(nm):  # shadows are soft ground tone: three shapes per set are enough
        if nm in ("still", "arrive"):
            return nm
        if nm.startswith("walk"):
            return "walk0"
        return "standF" if "standF" in names else names[0]
    srcs = []
    for nm in names:
        if shadow_src(nm) not in srcs:
            srcs.append(shadow_src(nm))
    shd = np.zeros((sch, scw * len(srcs)), np.float32)
    out = []
    for i, (fr, B, sh, fb_, sb_) in enumerate(cuts):
        ax, ay = fr["anchor_px"]
        ox, oy = int(round(ax)) - fl, int(round(ay)) - ft
        src = B[max(0, oy):oy + ch, max(0, ox):ox + cw]
        fig[(max(0, oy) - oy):(max(0, oy) - oy) + src.shape[0], i * cw + (max(0, ox) - ox):i * cw + (max(0, ox) - ox) + src.shape[1]] = src
        si = srcs.index(shadow_src(fr["name"]))
        if shadow_src(fr["name"]) == fr["name"]:
            ox2, oy2 = int(round(ax)) - sl, int(round(ay)) - st
            s2 = sh[max(0, oy2):oy2 + sch, max(0, ox2):ox2 + scw]
            shd[(max(0, oy2) - oy2):(max(0, oy2) - oy2) + s2.shape[0], si * scw + (max(0, ox2) - ox2):si * scw + (max(0, ox2) - ox2) + s2.shape[1]] = s2
        out.append(dict(name=fr["name"], si=si, world=fr["anchor_world"], depth=fr["depth"],
                        dx=float(ax - round(ax)), dy=float(ay - round(ay))))
    full = Image.fromarray((fig * 255).round().clip(0, 255).astype(np.uint8), "RGBA")
    for dname, sc in DENS.items():
        figim = full if sc == 1.0 else full.resize((round(full.width * sc), round(full.height * sc)), Image.LANCZOS)
        fa = np.asarray(figim).copy()
        fa[fa[..., 3] < 3] = 0
        save(Image.fromarray(fa, "RGBA"), f"{setname}-fig@{dname}", q_webp=78, q_avif=FIG_Q, sub="4:4:4")
    # drawn with multiply over the still: paper becomes exactly the rendered ground shadow
    s_im = Image.new("RGBA", (shd.shape[1], shd.shape[0]), tuple(int(round(v)) for v in MUL) + (0,))
    s_im.putalpha(Image.fromarray((shd * 255).round().astype(np.uint8), "L"))
    s_im = s_im.resize((max(1, round(s_im.width * SHADOW_SCALE)), max(1, round(s_im.height * SHADOW_SCALE))), Image.LANCZOS)
    save(s_im, f"{setname}-shadow", q_webp=50, q_avif=28)
    meta_all[setname] = dict(cell=[cw, ch], anchor=[fl, ft], scell=[scw, sch], sanchor=[sl, st], densities=DENS,
                             shadow_scale=SHADOW_SCALE, nshadow=len(srcs), frames=out)
    print(setname, len(out), "frames", "cell", cw, ch)

# ---------- poles ----------
pm = os.path.join(WORK, "meta-poles.json")
poles = []
if os.path.exists(pm):
    for fr in json.load(open(pm)):
        B = load(os.path.join(WORK, fr["name"] + "-B.png"))
        ys, xs = np.nonzero(B[..., 3] > 0.004)
        box = (xs.min() - 1, ys.min() - 1, xs.max() + 2, ys.max() + 2)
        im = Image.fromarray((B * 255).round().astype(np.uint8), "RGBA").crop(box)
        save(im, fr["name"], q_webp=85, q_avif=70)
        poles.append(dict(name=fr["name"], world=fr["anchor_world"], depth=fr["depth"], box=[int(v) for v in box]))

# ---------- crown and patches ----------
live = Image.open(LIVE).convert("RGBA")
bg = Image.new("RGBA", live.size, tuple(PAPER.astype(int)) + (255,))
bg.alpha_composite(live)
still = np.asarray(bg.convert("RGB")).astype(np.float32)
post.process(os.path.join(WORK, "plate.png"), os.path.join(WORK, "plate-post.png"), PROFILE)
plate = np.asarray(Image.open(os.path.join(WORK, "plate-post.png")).convert("RGB")).astype(np.float32)
diff = np.abs(plate - still).max(-1) > 10
dimg = Image.fromarray((diff * 255).astype(np.uint8), "L")
dimg = dimg.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))  # drop thin line wobble
dimg = dimg.filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.GaussianBlur(1.5))
dm = np.asarray(dimg).astype(np.float32) / 255.0

crown_meta = None
cj = os.path.join(WORK, "crown.json")
if os.path.exists(cj):
    cjm = json.load(open(cj))
    C = load(os.path.join(WORK, "crown.png"))[:CROP_H]
    C[..., 3] *= mask
    ys, xs = np.nonzero(C[..., 3] > 0.004)
    box = (xs.min() - 2, ys.min() - 2, xs.max() + 3, ys.max() + 3)
    im = Image.fromarray((C * 255).round().clip(0, 255).astype(np.uint8), "RGBA").crop(box)
    save(im, "crown", q_webp=78, q_avif=55)
    crown_meta = dict(box=[int(v) for v in box], pivot=cjm["pivot"][:2])
    cb = box
else:
    cb = None

regions = {"people": np.ones_like(dm, bool)}
if cb:
    cr = np.zeros_like(dm, bool)
    cr[max(0, cb[1] - 20):cb[3] + 20, max(0, cb[0] - 20):cb[2] + 20] = True
    regions = {"people": ~cr, "crown": cr}
patches = {}
for key, reg in regions.items():
    a = dm * reg
    if a.max() == 0:
        continue
    ys, xs = np.nonzero(a > 0.01)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    rgba = np.dstack([plate, a[..., None] * 255]).astype(np.uint8)
    im = Image.fromarray(rgba, "RGBA").crop(box)
    save(im, f"patch-{key}", q_webp=78, q_avif=int(os.environ.get("PATCH_Q", "52")))
    patches[key] = [int(v) for v in box]

# drawn details in raw pixels: the sun's glow (x, y, r), the birds' crossings, where the report's tick settles
DRAWN = {
    "desktop": dict(sun=[1320, 95, 150], birds=[[2240, 150, 1180, 60], [2200, 190, 1250, 105]], tick=[1545, 118]),
    "phone": dict(sun=[156, 72, 96], birds=[[820, 120, 330, 30], [800, 150, 380, 62]], tick=[452, 70]),
}[VIEW]
doc = dict(view=VIEW, **DRAWN, w=cam["w"], h=CROP_H, raw_h=RAW_H, camera=cam, shadow_rgb=[int(v) for v in SH],
           sets=meta_all, poles=poles, crown=crown_meta, patches=patches)
json.dump(json.loads(json.dumps(doc), parse_float=lambda v: round(float(v), 4)), open(os.path.join(OUT, f"{VIEW}.json"), "w"), separators=(",", ":"))
tot = 0
for k, v in sorted(sizes.items()):
    print("%-28s %6.1f KB" % (k, v / 1024))
    tot += v
for d in DENS:
    print("TOTAL avif", d, sum(v for k, v in sizes.items() if k.endswith(".avif") and ("-fig@" not in k or ("@" + d + ".") in k)) / 1024)
print("TOTAL avif all", sum(v for k, v in sizes.items() if k.endswith(".avif")) / 1024, "webp", sum(v for k, v in sizes.items() if k.endswith(".webp")) / 1024)
