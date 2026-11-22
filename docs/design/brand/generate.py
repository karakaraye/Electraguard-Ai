"""Generate ElectraGuard mark directions as clean SVG geometry."""
import io, math, os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb

FONTDIR = os.environ["NOTO_SANS_DIR"]  # folder with noto-sans-latin-{400,600}-normal.woff (npm @fontsource/noto-sans)
OUT = sys.argv[1]

def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s

# ---------------- type ----------------
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
        """Return (svg path d, advance width) for text at size, origin x0, baseline y."""
        b = hb.Buffer(); b.add_str(text); b.guess_segment_properties()
        hb.shape(self.hbfont, b, {"kern": True, "liga": True})
        s = size / self.upem
        x = 0.0; parts = []
        for info, pos in zip(b.glyph_infos, b.glyph_positions):
            name = self.order[info.codepoint]
            pen = SVGPathPen(self.gs, ntos=f)
            tp = TransformPen(pen, (s, 0, 0, -s, x0 + (x + pos.x_offset) * s, baseline - pos.y_offset * s))
            self.gs[name].draw(tp)
            parts.append(pen.getCommands())
            x += pos.x_advance + tracking * self.upem
        return "".join(parts), (x - tracking * self.upem) * s

SEMI, REG = Face(600), Face(400)

def wordmark(size, x0, baseline):
    """'ElectraGuard' semibold + quiet 'AI' regular. Returns (d, width)."""
    d1, w1 = SEMI.path("ElectraGuard", size, x0, baseline, tracking=-0.012)
    gap = size * 0.30
    d2, w2 = REG.path("AI", size, x0 + w1 + gap, baseline, tracking=0.02)
    return d1 + d2, w1 + gap + w2

# ---------------- marks ----------------
def stone(x, y, w, h, rl, rr, ry, rb):
    return (f"M{f(x)} {f(y+h-rb)}V{f(y+ry)}A{f(rl)} {f(ry)} 0 0 1 {f(x+rl)} {f(y)}"
            f"H{f(x+w-rr)}A{f(rr)} {f(ry)} 0 0 1 {f(x+w)} {f(y+ry)}V{f(y+h-rb)}"
            f"A{f(rb)} {f(rb)} 0 0 1 {f(x+w-rb)} {f(y+h)}H{f(x+rb)}A{f(rb)} {f(rb)} 0 0 1 {f(x)} {f(y+h-rb)}Z")

def stone2(x, y, w, h, rl, rr, ry, rbl, rbr, rby):
    """Resting stone: domed top (radii rl/rr, ry), flatter rounded base (rbl/rbr, rby)."""
    return (f"M{f(x)} {f(y+h-rby)}V{f(y+ry)}A{f(rl)} {f(ry)} 0 0 1 {f(x+rl)} {f(y)}"
            f"H{f(x+w-rr)}A{f(rr)} {f(ry)} 0 0 1 {f(x+w)} {f(y+ry)}V{f(y+h-rby)}"
            f"A{f(rbr)} {f(rby)} 0 0 1 {f(x+w-rbr)} {f(y+h)}H{f(x+rbl)}A{f(rbl)} {f(rby)} 0 0 1 {f(x)} {f(y+h-rby)}Z")

def cairn(grid):
    if grid == 16:
        return [stone2(1, 11, 14, 4, 4.5, 3.5, 2.5, 1.5, 1.5, 1.5),
                stone2(2, 6, 10, 4, 3, 4, 2.25, 1.25, 1.25, 1.25),
                stone2(7, 2, 7, 3, 3, 2.5, 1.75, 1, 1, 1)]
    return [stone2(4, 30, 40, 11, 13, 9, 6.5, 4, 4, 4),
            stone2(7, 18.5, 29, 9, 9, 11, 5.5, 3.5, 3.5, 3.5),
            f'<g transform="rotate(-6 29 12)">' + stone2(20, 8.25, 18, 7.5, 8, 7, 4.75, 3, 3, 2.75) + '</g>']

def rrect_hole(x, y, w, h, r):
    # counter-clockwise rounded rect (hole under nonzero)
    return (f"M{f(x+r)} {f(y)}A{f(r)} {f(r)} 0 0 0 {f(x)} {f(y+r)}V{f(y+h-r)}A{f(r)} {f(r)} 0 0 0 {f(x+r)} {f(y+h)}"
            f"H{f(x+w-r)}A{f(r)} {f(r)} 0 0 0 {f(x+w)} {f(y+h-r)}V{f(y+r)}A{f(r)} {f(r)} 0 0 0 {f(x+w-r)} {f(y)}Z")

def stub(grid):
    if grid == 16:
        X0, X1, Y0, Y1, R, cy, nr, yb, ys, s, hr = 4, 12, 1, 15, 1.25, 10.5, 1.5, 10, 11, 1.5, .25
    else:
        X0, X1, Y0, Y1, R, cy, nr, yb, ys, s, hr = 13, 35, 4, 44, 3.5, 31.5, 3, 30.5, 32.5, 3, 1
    dx_b = math.sqrt(nr**2 - (cy - yb)**2)
    dx_s = math.sqrt(nr**2 - (ys - cy)**2)
    body = (f"M{f(X0+R)} {f(Y0)}H{f(X1-R)}A{f(R)} {f(R)} 0 0 1 {f(X1)} {f(Y0+R)}V{f(cy-nr)}"
            f"A{f(nr)} {f(nr)} 0 0 0 {f(X1-dx_b)} {f(yb)}H{f(X0+dx_b)}"
            f"A{f(nr)} {f(nr)} 0 0 0 {f(X0)} {f(cy-nr)}V{f(Y0+R)}A{f(R)} {f(R)} 0 0 1 {f(X0+R)} {f(Y0)}Z")
    hole = rrect_hole(X0 + s, Y0 + s, (X1 - X0) - 2*s, (yb - s) - (Y0 + s), hr)
    tail = (f"M{f(X0)} {f(cy+nr)}A{f(nr)} {f(nr)} 0 0 0 {f(X0+dx_s)} {f(ys)}H{f(X1-dx_s)}"
            f"A{f(nr)} {f(nr)} 0 0 0 {f(X1)} {f(cy+nr)}V{f(Y1-R)}A{f(R)} {f(R)} 0 0 1 {f(X1-R)} {f(Y1)}"
            f"H{f(X0+R)}A{f(R)} {f(R)} 0 0 1 {f(X0)} {f(Y1-R)}Z")
    if grid == 16:
        lines = f"M6.5 4.5H9.5V6H6.5Z"
    else:
        lines = (f"M19 11.5H29A1.25 1.25 0 0 1 29 14H19A1.25 1.25 0 0 1 19 11.5Z"
                 f"M19 17.5H25A1.25 1.25 0 0 1 25 20H19A1.25 1.25 0 0 1 19 17.5Z")
    return [body + hole, lines, tail]

def circle(cx, cy, r, ccw=False):
    sw = 0 if ccw else 1
    return (f"M{f(cx-r)} {f(cy)}A{f(r)} {f(r)} 0 1 {sw} {f(cx+r)} {f(cy)}A{f(r)} {f(r)} 0 1 {sw} {f(cx-r)} {f(cy)}Z")

def trail(grid):
    if grid == 16:
        r, s, pts = 2.5, 1.25, [(3.5, 12.5), (8, 8), (12.5, 3.5)]
    else:
        r, s, pts = 7.5, 3, [(11, 37), (24, 24), (37, 11)]
    (ax, ay), (bx, by), (cx, cy) = pts
    ring = circle(ax, ay, r) + circle(ax, ay, r - s, ccw=True)
    # ring plus a filled lower half: the upper inner half is cut out as a counter-clockwise hole
    half = circle(bx, by, r) + f"M{f(bx+r-s)} {f(by)}A{f(r-s)} {f(r-s)} 0 0 0 {f(bx-r+s)} {f(by)}Z"
    full = circle(cx, cy, r)
    return [ring, half, full]

MARKS = {
    "cairn": (cairn, (4, 6.5, 44, 41)),
    "stub": (stub, (13, 4, 35, 44)),
    "trail": (trail, (3.5, 3.5, 44.5, 44.5)),
}

def svg(w, h, body, title, fill, vb=None):
    vb = vb or f"0 0 {f(w)} {f(h)}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{f(w)}" height="{f(h)}" '
            f'role="img" aria-label="{title}"><title>{title}</title><g fill="{fill}">{body}</g></svg>\n')

def paths(ds):
    out = []
    for d in ds:
        if d.startswith("<g"):
            head, rest = d.split(">", 1)
            out.append(f'{head}><path d="{rest[:-4]}"/></g>')
        else:
            out.append(f'<path d="{d}"/>')
    return "".join(out)

def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)

for name, (fn, (bx0, by0, bx1, by1)) in MARKS.items():
    d = os.path.join(OUT, name)
    big, small = fn(48), fn(16)
    for suffix, fill in (("", "#000"), ("-white", "#fff")):
        write(f"{d}/mark{suffix}.svg", svg(48, 48, paths(big), "ElectraGuard AI", fill))
        write(f"{d}/favicon{suffix}.svg", svg(16, 16, paths(small), "ElectraGuard AI", fill))

        # horizontal lockup: mark height MH, wordmark cap height = 0.5 * MH, optically centred
        MH = by1 - by0
        size = (MH * 0.46) / (SEMI.cap / SEMI.upem)
        capH = size * SEMI.cap / SEMI.upem
        gap = MH * 0.40
        mark_w = bx1 - bx0
        baseline = by0 + MH / 2 + capH / 2
        wd, ww = wordmark(size, bx1 + gap, baseline)
        W = mark_w + gap + ww
        body = f'<g>{paths(big)}</g><path d="{wd}"/>'
        write(f"{d}/lockup-horizontal{suffix}.svg",
              svg(W, MH, body, "ElectraGuard AI", fill, vb=f"{f(bx0)} {f(by0)} {f(W)} {f(MH)}"))

        # stacked lockup: mark (scaled 1.5x) above, wordmark centred below
        K = 1.5
        ssize = size * 0.62
        scap = ssize * SEMI.cap / SEMI.upem
        _, sw = wordmark(ssize, 0, 0)
        sgap = scap * 1.3
        mw, mh = mark_w * K, MH * K
        SW = max(sw, mw)
        SH = mh + sgap + scap
        mx = (SW - mw) / 2 - bx0 * K
        wd2, _ = wordmark(ssize, (SW - sw) / 2, mh + sgap + scap)
        body = f'<g transform="translate({f(mx)} {f(-by0 * K)}) scale({f(K)})">{paths(big)}</g><path d="{wd2}"/>'
        write(f"{d}/lockup-stacked{suffix}.svg", svg(SW, SH, body, "ElectraGuard AI", fill))

    # maskable Android icon: full-bleed black, white mark inside the 80% safe circle
    k = 512 * 0.50 / 48  # mark artwork about 50% of the canvas, well inside the safe zone
    cxm, cym = (bx0 + bx1) / 2, (by0 + by1) / 2
    tx, ty = 256 - cxm * k, 256 - cym * k
    body = (f'<rect width="512" height="512" fill="#000"/>'
            f'<g fill="#fff" transform="translate({f(tx)} {f(ty)}) scale({f(k)})">{paths(big)}</g>')
    write(f"{d}/app-icon-maskable.svg",
          f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" '
          f'aria-label="ElectraGuard AI"><title>ElectraGuard AI</title>{body}</svg>\n')

print("ok")
