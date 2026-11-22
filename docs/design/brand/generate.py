"""Build the ElectraGuard monogram files (the chosen mark) from plain geometry.

Usage: NOTO_SANS_DIR=<folder with noto-sans-latin-{400,600}-normal.woff> python generate.py docs/design/brand
(the .woff files come from the npm package @fontsource/noto-sans). Needs fonttools and uharfbuzz.

All transforms are baked into the path data, so no output file uses a transform attribute.
"""
import io, math, os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb

FONTDIR = os.environ["NOTO_SANS_DIR"]
OUT = sys.argv[1]
BLACK, WHITE = "#000", "#fff"


def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


# ---------------------------------------------------------------- path model
# A shape is a list of commands in absolute coordinates:
#   ("M", x, y) · ("L", x, y) · ("A", rx, ry, rot, large, sweep, x, y) · ("Z",)

class Xf:
    """Uniform scale s, rotation deg about origin, then translate (tx, ty)."""
    def __init__(self, s=1.0, deg=0.0, tx=0.0, ty=0.0):
        self.s, self.deg, self.tx, self.ty = s, deg, tx, ty

    def pt(self, x, y):
        a = math.radians(self.deg)
        c, n = math.cos(a), math.sin(a)
        return (self.s * (x * c - y * n) + self.tx, self.s * (x * n + y * c) + self.ty)


def rotate_about(deg, cx, cy):
    a = math.radians(deg)
    c, n = math.cos(a), math.sin(a)
    # rotate about (cx, cy) == rotate about origin, then translate
    return Xf(1, deg, cx - (cx * c - cy * n), cy - (cx * n + cy * c))


def apply(shape, xf):
    out = []
    for cmd in shape:
        if cmd[0] in "ML":
            out.append((cmd[0], *xf.pt(cmd[1], cmd[2])))
        elif cmd[0] == "A":
            _, rx, ry, rot, la, sw, x, y = cmd
            out.append(("A", rx * xf.s, ry * xf.s, rot + xf.deg, la, sw, *xf.pt(x, y)))
        else:
            out.append(cmd)
    return out


def d(shape):
    """Serialise, dropping zero-length segments and using H/V where exact."""
    parts, cur, start = [], None, None
    for cmd in shape:
        k = cmd[0]
        if k == "M":
            cur = start = (round(cmd[1], 3), round(cmd[2], 3))
            parts.append(f"M{f(cur[0])} {f(cur[1])}")
        elif k == "Z":
            parts.append("Z"); cur = start
        else:
            x, y = round(cmd[-2], 3), round(cmd[-1], 3)
            if (x, y) == cur:
                continue
            if k == "L":
                if abs(x - cur[0]) < 1e-3:
                    parts.append(f"V{f(y)}")
                elif abs(y - cur[1]) < 1e-3:
                    parts.append(f"H{f(x)}")
                else:
                    parts.append(f"L{f(x)} {f(y)}")
            else:
                _, rx, ry, rot, la, sw = cmd[:6]
                rot = round(rot % 180, 2)
                parts.append(f"A{f(rx)} {f(ry)} {f(rot)} {la} {sw} {f(x)} {f(y)}")
            cur = (x, y)
    return "".join(parts)


def sample(shape, n=24):
    """Points along a shape's outline, arcs included (SVG endpoint-to-centre conversion)."""
    pts, cur = [], None
    for cmd in shape:
        if cmd[0] in "ML":
            cur = (cmd[1], cmd[2]); pts.append(cur)
        elif cmd[0] == "A":
            _, rx, ry, rot, la, sw, x, y = cmd
            phi = math.radians(rot); c, s_ = math.cos(phi), math.sin(phi)
            dx, dy = (cur[0] - x) / 2, (cur[1] - y) / 2
            x1, y1 = c * dx + s_ * dy, -s_ * dx + c * dy
            lam = (x1 / rx) ** 2 + (y1 / ry) ** 2
            if lam > 1:
                rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
            num = max(rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, 0)
            k = math.sqrt(num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)) * (-1 if la == sw else 1)
            cx1, cy1 = k * rx * y1 / ry, -k * ry * x1 / rx
            cx = c * cx1 - s_ * cy1 + (cur[0] + x) / 2
            cy = s_ * cx1 + c * cy1 + (cur[1] + y) / 2
            t1 = math.atan2((y1 - cy1) / ry, (x1 - cx1) / rx)
            t2 = math.atan2((-y1 - cy1) / ry, (-x1 - cx1) / rx)
            dt = t2 - t1
            if sw and dt < 0: dt += 2 * math.pi
            if not sw and dt > 0: dt -= 2 * math.pi
            for i in range(1, n + 1):
                t = t1 + dt * i / n
                ex, ey = rx * math.cos(t), ry * math.sin(t)
                pts.append((c * ex - s_ * ey + cx, s_ * ex + c * ey + cy))
            cur = (x, y)
    return pts


def poly(*pts):
    return [("M", *pts[0])] + [("L", *p) for p in pts[1:]] + [("Z",)]


# ---------------------------------------------------------------- type
class Face:
    def __init__(self, weight):
        tt = TTFont(os.path.join(FONTDIR, f"noto-sans-latin-{weight}-normal.woff"))
        tt.flavor = None
        buf = io.BytesIO(); tt.save(buf)
        self.tt = TTFont(io.BytesIO(buf.getvalue()))
        self.hbfont = hb.Font(hb.Face(buf.getvalue()))
        self.upem = self.tt["head"].unitsPerEm
        self.cap = self.tt["OS/2"].sCapHeight
        self.gs = self.tt.getGlyphSet()
        self.order = self.tt.getGlyphOrder()

    def path(self, text, size, x0, baseline, tracking=0.0):
        b = hb.Buffer(); b.add_str(text); b.guess_segment_properties()
        hb.shape(self.hbfont, b, {"kern": True, "liga": True})
        s = size / self.upem
        x, parts = 0.0, []
        for info, pos in zip(b.glyph_infos, b.glyph_positions):
            pen = SVGPathPen(self.gs, ntos=f)
            self.gs[self.order[info.codepoint]].draw(
                TransformPen(pen, (s, 0, 0, -s, x0 + (x + pos.x_offset) * s, baseline - pos.y_offset * s)))
            parts.append(pen.getCommands())
            x += pos.x_advance + tracking * self.upem
        return "".join(parts), (x - tracking * self.upem) * s


SEMI, REG = Face(600), Face(400)


def wordmark(size, x0, baseline):
    """'ElectraGuard' SemiBold plus a quiet 'AI' in Regular."""
    d1, w1 = SEMI.path("ElectraGuard", size, x0, baseline, tracking=-0.012)
    gap = size * 0.30
    d2, w2 = REG.path("AI", size, x0 + w1 + gap, baseline, tracking=0.02)
    return d1 + d2, w1 + gap + w2


def cap_of(size):
    return size * SEMI.cap / SEMI.upem


# ---------------------------------------------------------------- Monogram (E and G), the chosen mark
def monogram48():
    # one outline: curved spine shared by E and G, three arms, and the G's spur rising on the right
    R, r = 14, 6
    return [[("M", 38, 6), ("A", 4, 4, 0, 0, 1, 42, 10), ("L", 42, 14), ("L", 20, 14),
             ("A", r, r, 0, 0, 0, 14, 20), ("L", 29, 20), ("L", 29, 28), ("L", 14, 28),
             ("A", r, r, 0, 0, 0, 20, 34), ("L", 34, 34), ("L", 34, 24), ("L", 42, 24),
             ("L", 42, 38), ("A", 4, 4, 0, 0, 1, 38, 42), ("L", 20, 42),
             ("A", R, R, 0, 0, 1, 6, 28), ("L", 6, 20), ("A", R, R, 0, 0, 1, 20, 6), ("Z",)]]


def monogram16():
    return [poly((4, 2), (14, 2), (14, 5), (5, 5), (5, 7), (10, 7), (10, 9), (5, 9), (5, 11),
                 (11, 11), (11, 8), (14, 8), (14, 14), (4, 14), (2, 12), (2, 4))]


# name: (48-grid builder, 16-grid builder, artwork bounds on the 48 grid, optical lift for the app icon)
MARKS = {
    "monogram": (monogram48, monogram16, (6, 6, 42, 42), 0.0),
}


# ---------------------------------------------------------------- output
def svg(w, h, inner, vb=None):
    vb = vb or f"0 0 {f(w)} {f(h)}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{f(w)}" height="{f(h)}" '
            f'role="img" aria-label="ElectraGuard AI"><title>ElectraGuard AI</title>{inner}</svg>\n')


def paths(shapes, fill, xf=None):
    return "".join(f'<path fill="{fill}" d="{d(apply(s, xf) if xf else s)}"/>' for s in shapes)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


STACK_K = 1.1        # symbol scale in the stacked lockup, relative to the horizontal lockup
STACK_TYPE = 0.80    # wordmark size in the stacked lockup, relative to the horizontal lockup
ICON_ART = 0.52      # artwork's longer side as a share of the 512 icon canvas
ICON_SAFE = 0.66     # every point of the art stays inside a centred circle of this diameter

CREDIT_TEXT = "by Cairn"
CREDIT_SCALE = 0.62  # credit type size relative to the wordmark size

LOCKUP_METRICS = {}

for name, (b48, b16, (bx0, by0, bx1, by1), lift) in MARKS.items():
    folder = os.path.join(OUT, name)
    big, small = b48(), b16()
    MH, MW = by1 - by0, bx1 - bx0
    size = (MH * 0.46) / (SEMI.cap / SEMI.upem)   # horizontal lockup: cap height = 46% of symbol height
    gap = MH * 0.40

    for suffix, fill in (("", BLACK), ("-white", WHITE)):
        write(f"{folder}/mark{suffix}.svg", svg(48, 48, paths(big, fill)))
        write(f"{folder}/favicon{suffix}.svg", svg(16, 16, paths(small, fill)))

        # horizontal lockup, tight viewBox (clear space is a usage rule, not baked in)
        baseline = MH / 2 + cap_of(size) / 2
        wd, ww = wordmark(size, MW + gap, baseline)
        W = MW + gap + ww
        inner = paths(big, fill, Xf(1, 0, -bx0, -by0)) + f'<path fill="{fill}" d="{wd}"/>'
        write(f"{folder}/lockup-horizontal{suffix}.svg", svg(W, MH, inner))
        LOCKUP_METRICS.setdefault(name, {})["h_cap_ratio"] = cap_of(size) / MH

        # horizontal lockup with the credit line "by Cairn" under the wordmark (plain text, no Cairn symbol)
        csize = size * CREDIT_SCALE
        ccap = cap_of(csize)
        cgap = cap_of(size) * 0.45
        block = cap_of(size) + cgap + ccap
        top = MH / 2 - block / 2
        wbase = top + cap_of(size)
        cbase = wbase + cgap + ccap
        wd3, ww3 = wordmark(size, MW + gap, wbase)
        cd, cw = REG.path(CREDIT_TEXT, csize, MW + gap, cbase, tracking=0.01)
        W2 = MW + gap + max(ww3, cw)
        inner = (paths(big, fill, Xf(1, 0, -bx0, -by0)) + f'<path fill="{fill}" d="{wd3}"/>' +
                 f'<path fill="{fill}" d="{cd}"/>')
        # the ascender of "l" and the descender of "y" reach past the symbol, so the box grows to hold them
        ymin = min(0, wbase - 0.76 * size - 0.2)
        ymax = max(MH, cbase + 0.25 * csize + 0.2)
        write(f"{folder}/lockup-credit{suffix}.svg", svg(W2, ymax - ymin, inner, vb=f"0 {f(ymin)} {f(W2)} {f(ymax - ymin)}"))
        LOCKUP_METRICS[name]["credit_size_ratio"] = csize / (ymax - ymin)

        # stacked lockup
        ssize = size * STACK_TYPE
        scap = cap_of(ssize)
        _, sw = wordmark(ssize, 0, 0)
        mw, mh = MW * STACK_K, MH * STACK_K
        sgap = scap * 1.2
        SW, SH = max(sw, mw), mh + sgap + scap
        wd2, _ = wordmark(ssize, (SW - sw) / 2, SH)
        inner = (paths(big, fill, Xf(STACK_K, 0, (SW - mw) / 2 - bx0 * STACK_K, -by0 * STACK_K)) +
                 f'<path fill="{fill}" d="{wd2}"/>')
        write(f"{folder}/lockup-stacked{suffix}.svg", svg(SW, SH, inner))
        LOCKUP_METRICS[name]["s_cap_ratio"] = scap / SH

    # maskable Android icon
    pts = [p for sh in big for p in sample(sh)]
    cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
    k = ICON_ART * 512 / max(MW, MH)
    far = max(math.hypot(x - cx, y - cy) for x, y in pts)
    k = min(k, ICON_SAFE * 512 / 2 / far)
    oy = -lift * 512
    xf = Xf(k, 0, 256 - cx * k, 256 - cy * k + oy)
    inner = '<rect width="512" height="512" fill="#000"/>' + paths(big, WHITE, xf)
    write(f"{folder}/app-icon-maskable.svg", svg(512, 512, inner))
    LOCKUP_METRICS[name]["icon_share"] = k * max(MW, MH) / 512

for n, m in LOCKUP_METRICS.items():
    print(n, {k: round(v, 3) for k, v in m.items()})
