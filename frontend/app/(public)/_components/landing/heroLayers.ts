/*
 * The moving hero (landing plan 4.2 and 6). The approved still is the server-rendered first paint;
 * these layers load after the page, and take over only when every picture is decoded and drawn
 * at a frame identical to the still.
 *
 * Layers, all in the render's own pixels (desktop 2200 x 920, phone 780 x 600), scaled with `zoom`
 * so the stage never isolates and the shadows multiply onto the still:
 *   patches   the plate (the scene without people) where the still has people, and under the crown;
 *   crown     the neem crown, swaying on its own;
 *   shadows   each person's ground shadow, multiplied onto the paper;
 *   figures   the people (sprite sheets; one frame shown through a clipped box) and two canopy poles,
 *             stacked by distance from the camera;
 *   drawn     the card reader's light, the ballot, the observer's report, birds, the sun's glow.
 * While it runs only transform and opacity change (a shade class is switched once when someone
 * walks into the canopy's shadow, as the toon render would).
 */
import type { SceneMotion } from "../living-scene/LivingScene";
import choreography from "./hero-motion.json";

type V2 = [number, number];
type Unit = (typeof choreography.units)[number] & { startFrame?: string };
type Choreo = typeof choreography;

type Frame = { name: string; si: number; world: V2; depth: number; dx: number; dy: number };
type SpriteSet = { cell: V2; anchor: V2; scell: V2; sanchor: V2; nshadow: number; densities?: Record<string, number>; frames: Frame[] };
type Pole = { name: string; world: V2; depth: number; box: [number, number, number, number] };
type ViewData = {
  view: "desktop" | "phone";
  w: number;
  h: number;
  raw_h: number;
  sun: [number, number, number];
  birds: [number, number, number, number][];
  tick: V2;
  camera: { w: number; world_to_cam: number[][]; frame: number[][] };
  sets: Record<string, SpriteSet>;
  poles: Pole[];
  crown: { box: [number, number, number, number]; pivot: V2 } | null;
  patches: Record<string, [number, number, number, number]>;
};

export type HeroMotionClasses = Record<
  "patch" | "crown" | "masked" | "shadows" | "figures" | "sprite" | "shade" | "pole" | "over" | "sunglow" | "bird" | "bird1" | "wing",
  string
>;

const BASE = "/art/hero-motion/";
const FALLBACK: Record<string, string> = { standB: "standF", stepB: "stepF", wait: "reach", arrive: "walk0" };

// ---------- geometry ----------
function projector(cam: ViewData["camera"], rawH: number) {
  const M = cam.world_to_cam, tr = cam.frame[0], bl = cam.frame[2], fz = -tr[2];
  return (x: number, y: number, z = 0): [number, number, number] => {
    const cx = M[0][0] * x + M[0][1] * y + M[0][2] * z + M[0][3];
    const cy = M[1][0] * x + M[1][1] * y + M[1][2] * z + M[1][3];
    const cz = M[2][0] * x + M[2][1] * y + M[2][2] * z + M[2][3];
    const s = fz / -cz;
    const u = (cx * s - bl[0]) / (tr[0] - bl[0]);
    const v = (cy * s - bl[1]) / (tr[1] - bl[1]);
    return [u * cam.w, (1 - v) * rawH, -cz];
  };
}

const qbez = (p0: V2, p1: V2, p2: V2, t: number): V2 => {
  const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]];
};
const dist = (a: V2, b: V2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lerp = (a: V2, b: V2, t: number): V2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const ease = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
function along(pts: V2[], d: number): V2 {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const L = dist(pts[i], pts[i + 1]);
    if (acc + L >= d) return lerp(pts[i], pts[i + 1], (d - acc) / L);
    acc += L;
  }
  return [pts[pts.length - 1][0], pts[pts.length - 1][1]];
}
function pathLength(pts: V2[]) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += dist(pts[i], pts[i + 1]);
  return L;
}
function inPoly(p: V2, poly: V2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- the story: a pure function of time ----------
type UnitState = { u: number; visible: boolean; pos: V2; frame: string; drop?: number; shade?: boolean };
type StoryState = { units: UnitState[]; ev: { led: boolean; paper: number; report: number } };

function story(ch: Choreo) {
  const units = ch.units as Unit[];
  const N = units.length, T = ch.timing, q = ch.queueCurve;
  const p0 = q.p0 as V2, p1 = q.p1 as V2, p2 = q.p2 as V2;
  const tl = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const tan: V2 = [(p2[0] - p1[0]) / tl, (p2[1] - p1[1]) / tl];
  const entry = ch.entry as V2[], exit = ch.exit as V2[], shade = ch.shade as V2[];
  const box = ch.box as V2, arriving = ch.arriving as V2;
  const stillSlots = ch.stillSlots as Record<string, number>;

  const slotPoint = (s: number): V2 => (s <= q.n ? qbez(p0, p1, p2, s / q.n) : [p2[0] + tan[0] * q.spacing * (s - q.n), p2[1] + tan[1] * q.spacing * (s - q.n)]);
  const role = (u: number, n: number) => (((u - n) % N) + N) % N; // 0 voter, 1..8 queue, 9 newcomer, 10 resting
  const unitAt = (n: number, r: number) => (((n + r) % N) + N) % N;
  function slotsOf(n: number, lo: number, hi: number) {
    const out: Record<number, number> = {};
    let s = 1;
    for (let r = lo; r <= hi; r++) {
      const u = unitAt(n, r);
      out[u] = s;
      s += units[u].size;
    }
    return out;
  }
  const readerOf = (u: number) => (units[u].kind === "roll" ? ch.wheelReader : ch.reader) as V2;
  const walkFrame = (u: number, d: number) => {
    const k = units[u].kind === "roll" ? 3 : 6;
    return "walk" + (Math.floor((d / units[u].cycle) * k) % k);
  };
  const shuffleSpeed = (u: number) => T.shuffleSpeed * ((units[u].speed / 0.95) * 0.4 + 0.6);
  function shuffle(u: number, from: V2, to: V2, t0: number, tau: number) {
    const dur = Math.max(0.6, dist(from, to) / shuffleSpeed(u)), e = (tau - t0) / dur;
    if (e <= 0) return null;
    if (e >= 1) return { pos: to, frame: "standF" };
    const stepOn = Math.floor((tau - t0) / T.shuffleStep) % 2 === 0;
    return { pos: lerp(from, to, ease(e) * 0.15 + e * 0.85), frame: units[u].kind === "roll" || !stepOn ? "standF" : "stepF" };
  }
  const voterTimes = (u: number) => {
    const v = units[u].speed, L1 = dist(readerOf(u), box), t2 = T.leaveReader + L1 / v;
    return { L1, t2, t3: t2 + T.dropHold };
  };

  function voter(u: number, n: number, tau: number): UnitState | null {
    const unit = units[u], v = unit.speed, R = readerOf(u), { L1, t2, t3 } = voterTimes(u);
    if (tau < T.reach) return { u, visible: true, pos: R, frame: n === 0 || unit.kind === "roll" ? "still" : "reach" };
    if (tau < T.leaveReader) return { u, visible: true, pos: R, frame: "reach" };
    if (tau < t2) {
      const d = (tau - T.leaveReader) * v;
      return { u, visible: true, pos: lerp(R, box, d / L1), frame: walkFrame(u, d) };
    }
    if (tau < t3) return { u, visible: true, pos: box, frame: "drop", drop: tau - t2 };
    const path = [box, ...exit], d2 = (tau - t3) * v;
    if (d2 >= pathLength(path)) return null;
    return { u, visible: true, pos: along(path, d2), frame: walkFrame(u, d2 + L1) };
  }

  // The newcomer reaches the back only after the voter walking off has passed it.
  function newcomer(u: number, n: number, tau: number, after: Record<number, number>): UnitState | null {
    const unit = units[u], v = unit.speed, first = n === 0, lead = Boolean(unit.startFrame) && first;
    const path = [...(lead ? [arriving, ...entry.slice(2)] : entry), slotPoint(after[u])];
    const L = pathLength(path), NC = T.newcomer;
    let t0 = first ? T.firstWalkerStart : T.walkerStart;
    if (!first) {
      const w = unitAt(n, 0), pass = voterTimes(w).t3 + NC.passDistance / units[w].speed;
      t0 = Math.max(t0, pass + NC.gap - (L - NC.zone) / v, NC.slotFree - L / v);
    }
    if (tau < t0) return { u, visible: lead, pos: path[0], frame: lead ? (unit.startFrame as string) : "walk0" };
    const d = (tau - t0) * v;
    if (d >= L) return null;
    return { u, visible: true, pos: along(path, d), frame: walkFrame(u, d) };
  }

  return function state(t: number): StoryState {
    const n = Math.floor(t / ch.beat), tau = t - n * ch.beat, out: UnitState[] = [];
    const before = slotsOf(n, 1, 8), after = slotsOf(n, 2, 9), prevAfter = slotsOf(n - 1, 2, 9);
    for (let u = 0; u < N; u++) {
      const unit = units[u], r = role(u, n);
      let st: UnitState;
      if (r === 0) {
        st = voter(u, n, tau) ?? { u, visible: false, pos: exit[exit.length - 1], frame: "walk0" };
      } else if (r <= 8) {
        const s0 = before[u], P0 = slotPoint(s0);
        st = { u, visible: true, pos: P0, frame: n === 0 && stillSlots[unit.id] === s0 ? "still" : "standF" };
        if (r === 8 && n > 0) st = newcomer(u, n - 1, tau + ch.beat, prevAfter) ?? st; // a slow newcomer still on the way
        if (r === 1) {
          const R = readerOf(u), m = shuffle(u, P0, R, T.nextStepsUp, tau);
          if (m) st = { u, visible: true, ...m };
          // at the table: holds the voter card out to the officials
          if (tau >= T.nextStepsUp + Math.max(0.6, dist(P0, R) / shuffleSpeed(u))) st.frame = unit.kind === "roll" ? "still" : "reach";
        } else {
          const m = shuffle(u, P0, slotPoint(after[u]), T.ripple + T.rippleGap * (r - 2), tau);
          if (m) st = { u, visible: true, ...m };
        }
      } else if (r === 9) {
        st = newcomer(u, n, tau, after) ?? { u, visible: true, pos: slotPoint(after[u]), frame: "standF" };
      } else {
        // resting off-stage, or still walking off from the beat before
        st = (n > 0 ? voter(u, n - 1, tau + ch.beat) : null) ?? { u, visible: false, pos: entry[0], frame: "walk0" };
      }
      st.shade = st.visible && inPoly(st.pos, shade);
      out.push(st);
    }
    const vs = out[unitAt(n, 0)];
    const blink = T.blink.some((b) => tau >= b && tau < b + 0.22);
    return { units: out, ev: { led: blink, paper: vs.drop ?? -1, report: n % 2 === 1 ? tau : -1 } };
  };
}

// ---------- the layers ----------
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: Element): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
}

const NS = "http://www.w3.org/2000/svg";
function svgEl(tag: string, attrs: Record<string, string | number>, parent: Element) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent.appendChild(e);
  return e;
}

function supportsAvif(): Promise<boolean> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i.width > 0);
    i.onerror = () => res(false);
    i.src =
      "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=";
  });
}

/** Decodes a picture before it is shown, so nothing pops in half-drawn. */
function into(img: HTMLImageElement, src: string): Promise<void> {
  img.alt = "";
  img.decoding = "async";
  img.src = src;
  return img.decode ? img.decode() : new Promise((r) => (img.onload = () => r()));
}

export type HeroMotionHandle = { destroy: () => void; seek: (t: number) => void; time: () => number };

/**
 * Builds the layers inside `stage` (which sits in the same masked wrapper as the still) and runs
 * them. `root` is the wrapper: its width sets the scale and its visibility pauses the clock.
 * Resolves with a handle once the layers are live; resolves with null if they never are.
 */
export function mountHeroMotion(stage: HTMLElement, root: HTMLElement, level: SceneMotion, cls: HeroMotionClasses, opts: { frozen?: boolean; onLive?: () => void } = {}): HeroMotionHandle {
  let destroyed = false;
  let t = 0;
  let raf = 0;
  let last = 0;
  let running = false;
  let ready = false;
  let visible = true;
  let draw: (t: number) => void = () => {};
  const cleanups: (() => void)[] = [];
  const view: ViewData["view"] = window.matchMedia("(max-width: 767px)").matches ? "phone" : "desktop";
  const base = `${BASE}${view}/`;
  stage.setAttribute("data-motion", level);

  const loop = (now: number) => {
    raf = 0;
    if (!running) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    t += dt;
    draw(t);
    raf = requestAnimationFrame(loop);
  };
  const sync = () => {
    const run = ready && visible && !document.hidden && !opts.frozen && !destroyed;
    stage.toggleAttribute("data-paused", !run);
    if (run && !running) {
      running = true;
      last = 0;
      if (!raf) raf = requestAnimationFrame(loop);
    }
    if (!run) running = false;
  };
  const io = new IntersectionObserver((es) => {
    visible = es.some((e) => e.isIntersecting);
    sync();
  });
  io.observe(root);
  document.addEventListener("visibilitychange", sync);
  cleanups.push(() => {
    io.disconnect();
    document.removeEventListener("visibilitychange", sync);
    if (raf) cancelAnimationFrame(raf);
  });

  void Promise.all([fetch(`${base}${view}.json`).then((r) => r.json() as Promise<ViewData>), supportsAvif()]).then(async ([V, avif]) => {
    if (destroyed) return;
    const ext = avif ? ".avif" : ".webp";
    const ch = choreography as Choreo;
    const units = ch.units as Unit[];
    const project = projector(V.camera, V.raw_h);
    const state = story(ch);
    stage.style.width = `${V.w}px`;
    stage.style.height = `${V.h}px`;
    const fit = () => {
      // zoom, not a transform: a transform would isolate the stage, and the shadows must multiply onto the still
      stage.style.zoom = String(root.getBoundingClientRect().width / V.w);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    cleanups.push(() => ro.disconnect());

    // sheet density: sharp on high-density screens, half the bytes on the rest
    const anySet = Object.values(V.sets)[0];
    const dens = anySet?.densities?.["1x"] && (window.devicePixelRatio || 1) * (root.getBoundingClientRect().width / V.w) < 0.6 ? "1x" : "2x";
    const loads: Promise<void>[] = [];
    const px = (n: number) => `${n}px`;

    (["crown", "people"] as const).forEach((key) => {
      const b = V.patches[key];
      if (!b || (key === "people" && level !== "full")) return;
      const im = el("img", cls.patch, stage);
      Object.assign(im.style, { left: px(b[0]), top: px(b[1]), width: px(b[2] - b[0]), height: px(b[3] - b[1]) });
      loads.push(into(im, `${base}patch-${key}${ext}`));
    });
    if (V.crown) {
      const b = V.crown.box, cw = el("div", cls.crown, stage), ci = el("img", "", cw);
      Object.assign(cw.style, { left: px(b[0]), top: px(b[1]), width: px(b[2] - b[0]), height: px(b[3] - b[1]), transformOrigin: `${V.crown.pivot[0] - b[0]}px ${V.crown.pivot[1] - b[1]}px` });
      loads.push(into(ci, `${base}crown${ext}`));
    }
    const shadowLayer = el("div", `${cls.masked} ${cls.shadows}`, stage);
    const figLayer = el("div", `${cls.masked} ${cls.figures}`, stage);
    for (const m of [shadowLayer, figLayer]) {
      m.style.maskImage = `url(${base}fade-mask.webp)`;
      m.style.setProperty("-webkit-mask-image", `url(${base}fade-mask.webp)`);
    }
    const over = el("div", cls.over, stage);

    type Sprite = { S: SpriteSet; idx: Record<string, number>; fig: HTMLDivElement; fimg: HTMLImageElement; sh: HTMLDivElement; simg: HTMLImageElement; last: { vis?: boolean; i?: number; z?: string; shade?: boolean } };
    const sprites: Sprite[] = [];
    const zOf = (depth: number) => String(Math.round(10000 - depth * 400));
    if (level === "full") {
      for (const unit of units) {
        const S = V.sets[unit.set];
        const idx: Record<string, number> = {};
        S.frames.forEach((f, i) => (idx[f.name] = i));
        const fig = el("div", cls.sprite, figLayer), fimg = el("img", "", fig);
        const sh = el("div", cls.sprite, shadowLayer), simg = el("img", "", sh);
        Object.assign(fig.style, { width: px(S.cell[0]), height: px(S.cell[1]), opacity: "0" });
        Object.assign(fimg.style, { width: px(S.cell[0] * S.frames.length), height: px(S.cell[1]) });
        Object.assign(sh.style, { width: px(S.scell[0]), height: px(S.scell[1]), opacity: "0" });
        Object.assign(simg.style, { width: px(S.scell[0] * S.nshadow), height: px(S.scell[1]) });
        loads.push(into(fimg, `${base}${unit.set}-fig@${dens}${ext}`), into(simg, `${base}${unit.set}-shadow${ext}`));
        sprites.push({ S, idx, fig, fimg, sh, simg, last: {} });
      }
      // the two front canopy poles can stand in front of people
      for (const p of V.poles) {
        const e = el("img", cls.pole, figLayer);
        Object.assign(e.style, { left: px(p.box[0]), top: px(p.box[1]), width: px(p.box[2] - p.box[0]), height: px(p.box[3] - p.box[1]), zIndex: zOf(p.depth) });
        loads.push(into(e, `${base}${p.name}${ext}`));
      }
    }

    // ---------- drawn details ----------
    const svg = svgEl("svg", { viewBox: `0 0 ${V.w} ${V.h}`, width: V.w, height: V.h }, over);
    const k1 = V.w < 1000 ? 0.8 : V.w / 2200;
    const defs = svgEl("defs", {}, svg);
    const rg = svgEl("radialGradient", { id: `hm-glow-${view}` }, defs);
    svgEl("stop", { offset: 0, "stop-color": "#f6e7c6", "stop-opacity": 0.9 }, rg);
    svgEl("stop", { offset: 0.45, "stop-color": "#fbf4e4", "stop-opacity": 0.55 }, rg);
    svgEl("stop", { offset: 1, "stop-color": "#faf8f3", "stop-opacity": 0 }, rg);
    svgEl("circle", { cx: V.sun[0], cy: V.sun[1], r: V.sun[2], class: cls.sunglow, fill: `url(#hm-glow-${view})` }, svg);
    V.birds.forEach((b, i) => {
      const g = svgEl("g", { class: `${cls.bird} ${i ? cls.bird1 : ""}`, style: `--bx0:${b[0]}px;--by0:${b[1]}px;--bx1:${b[2]}px;--by1:${b[3]}px` }, svg);
      const w = svgEl("g", { class: cls.wing }, g);
      svgEl("path", { d: "M-9 0 Q-4.5 -5 0 0 Q4.5 -5 9 0", fill: "none", stroke: "#7d6f5c", "stroke-width": 1.8 * k1 * 1.4, "stroke-linecap": "round", transform: `scale(${k1 * 1.6})` }, w);
    });

    let led: SVGElement | null = null;
    let paper: SVGElement | null = null;
    let report: { dots: (SVGElement & { _o?: number })[]; card: SVGElement; tick: SVGElement; tin: SVGElement; path: (t: number) => V2 } | null = null;
    let obs: { img: HTMLImageElement; w: number; cur: number } | null = null;
    const u2 = k1 * 2;
    if (level === "full") {
      const lp = project(...(ch.readerLed as [number, number, number]));
      led = svgEl("circle", { cx: lp[0], cy: lp[1], r: 3.4 * u2, fill: "#3f9a4a", opacity: 0 }, svg);
      const bp = project(...(ch.boxSlot as [number, number, number]));
      paper = svgEl("g", { opacity: 0 }, svg);
      svgEl("rect", { x: bp[0] - 9 * u2, y: bp[1] - 26 * u2, width: 18 * u2, height: 12 * u2, rx: 1.5, fill: "#faf8f3", stroke: "#7d6f5c", "stroke-width": 1.6 * u2 }, paper);
      // the observer's report: from her phone, along a dotted line, into a reviewed tick
      const ph = project(...(ch.observerPhone as [number, number, number])), tk = V.tick;
      const start: V2 = [ph[0], ph[1] - 20 * k1];
      const c1: V2 = [ph[0] - (tk[0] - ph[0]) * 0.55 - 40 * k1, (ph[1] + tk[1]) / 2 + 30 * k1];
      const path = (tt: number) => qbez(start, c1, tk, tt);
      const dots = Array.from({ length: 11 }, (_, i) => {
        const p = path((i + 1) / 12);
        return svgEl("circle", { cx: p[0], cy: p[1], r: 2.6 * u2, fill: "#c98f2e", opacity: 0 }, svg);
      });
      const card = svgEl("g", { opacity: 0 }, svg);
      const cwid = 22 * u2, chei = 28 * u2;
      svgEl("rect", { x: -cwid / 2, y: -chei / 2, width: cwid, height: chei, rx: 2.5 * u2, fill: "#ffffff", stroke: "#7d6f5c", "stroke-width": 1.7 * u2 }, card);
      for (let j = 0; j < 3; j++) {
        const y = -chei / 2 + (8 + j * 6) * u2;
        svgEl("line", { x1: -cwid / 2 + 5 * u2, x2: cwid / 2 - (j === 2 ? 10 : 5) * u2, y1: y, y2: y, stroke: "#b9ad99", "stroke-width": 1.6 * u2, "stroke-linecap": "round" }, card);
      }
      const tick = svgEl("g", { opacity: 0, transform: `translate(${tk[0]} ${tk[1]})` }, svg);
      const tin = svgEl("g", {}, tick);
      svgEl("circle", { r: 19 * u2, fill: "#e7f3e8", stroke: "#1b5e20", "stroke-width": 2.4 * u2 }, tin);
      svgEl("path", { d: `M${-8 * u2} 0 L${-2.5 * u2} ${6 * u2} L${9 * u2} ${-6.5 * u2}`, fill: "none", stroke: "#1b5e20", "stroke-width": 3.2 * u2, "stroke-linecap": "round", "stroke-linejoin": "round" }, tin);
      report = { dots, card, tick, tin, path };

      // the observer stays in her place: phone down, or looking up at the tick
      const OS = V.sets.observer;
      if (OS) {
        const of = el("div", cls.sprite, figLayer), oi = el("img", "", of);
        const f0 = OS.frames[0], pp = project(f0.world[0], f0.world[1], 0);
        Object.assign(of.style, { width: px(OS.cell[0]), height: px(OS.cell[1]), transform: `translate(${pp[0] - OS.anchor[0] - f0.dx}px,${pp[1] - OS.anchor[1] - f0.dy}px)`, zIndex: zOf(f0.depth) });
        Object.assign(oi.style, { width: px(OS.cell[0] * OS.frames.length), height: px(OS.cell[1]) });
        loads.push(into(oi, `${base}observer-fig@${dens}${ext}`));
        obs = { img: oi, w: OS.cell[0], cur: 0 };
      }
    }

    const place = (sp: Sprite, st: UnitState) => {
      const S = sp.S;
      const i = sp.idx[st.frame] ?? sp.idx[FALLBACK[st.frame]] ?? sp.idx.standF;
      const f = S.frames[i], P = project(st.pos[0], st.pos[1], 0), sc = f.depth / P[2];
      if (sp.last.vis !== st.visible) {
        sp.fig.style.opacity = sp.sh.style.opacity = st.visible ? "1" : "0";
        sp.last.vis = st.visible;
      }
      if (!st.visible) return;
      const ax = S.anchor[0] + f.dx, ay = S.anchor[1] + f.dy, sx = S.sanchor[0] + f.dx, sy = S.sanchor[1] + f.dy;
      sp.fig.style.transform = `translate(${(P[0] - ax * sc).toFixed(2)}px,${(P[1] - ay * sc).toFixed(2)}px) scale(${sc.toFixed(4)})`;
      sp.sh.style.transform = `translate(${(P[0] - sx * sc).toFixed(2)}px,${(P[1] - sy * sc).toFixed(2)}px) scale(${sc.toFixed(4)})`;
      if (sp.last.i !== i) {
        sp.fimg.style.transform = `translateX(${-i * S.cell[0]}px)`;
        sp.simg.style.transform = `translateX(${-f.si * S.scell[0]}px)`;
        sp.last.i = i;
      }
      const z = zOf(P[2]);
      if (sp.last.z !== z) {
        sp.fig.style.zIndex = z;
        sp.last.z = z;
      }
      if (sp.last.shade !== st.shade) {
        sp.fig.classList.toggle(cls.shade, Boolean(st.shade));
        sp.last.shade = st.shade;
      }
    };

    draw = (time: number) => {
      if (level !== "full" || !report || !led || !paper) return;
      const S = state(time);
      S.units.forEach((st, i) => place(sprites[i], st));
      led.setAttribute("opacity", S.ev.led ? "1" : "0");
      // the ballot slides into the slot and is gone
      const pd = S.ev.paper - ch.timing.paperDelay, pf = ch.timing.paperFall;
      if (S.ev.paper >= 0 && pd >= 0 && pd < pf) {
        const e = pd / pf;
        paper.setAttribute("opacity", String(e < 0.15 ? e / 0.15 : 1 - ease((e - 0.55) / 0.45)));
        paper.setAttribute("transform", `translate(0 ${(ease(e) * 22 * u2).toFixed(2)})`);
      } else paper.setAttribute("opacity", "0");
      // the observer's report, once per loop
      const R = ch.timing.report, rt = S.ev.report - R.card;
      if (obs) {
        const look = S.ev.report >= R.lookUp[0] && S.ev.report < R.lookUp[1] ? 1 : 0;
        if (obs.cur !== look) {
          obs.img.style.transform = `translateX(${-look * obs.w}px)`;
          obs.cur = look;
        }
      }
      let dotsOn = 0, cardO = 0, cardP = report.path(0), tickO = 0, tickS = 0.6;
      if (S.ev.report >= 0 && rt >= 0) {
        const et = rt / R.travel;
        if (et < 1) {
          cardO = Math.min(1, rt / 0.25);
          cardP = report.path(ease(et));
          dotsOn = Math.floor(et * (report.dots.length + 1));
        } else {
          const a = rt - R.travel;
          dotsOn = report.dots.length;
          cardO = Math.max(0, 1 - a / 0.25);
          cardP = report.path(1);
          tickO = a < R.tickHold ? Math.min(1, a / 0.3) : Math.max(0, 1 - (a - R.tickHold) / 0.6);
          tickS = 0.6 + 0.4 * ease(a / 0.35);
          if (a > R.tickHold) dotsOn = Math.max(0, report.dots.length - Math.floor((a - R.tickHold) / 0.06));
        }
      }
      report.dots.forEach((d, i) => {
        const o = i < dotsOn ? 1 : 0;
        if (d._o !== o) {
          d.setAttribute("opacity", String(o));
          d._o = o;
        }
      });
      report.card.setAttribute("opacity", cardO.toFixed(3));
      report.card.setAttribute("transform", `translate(${cardP[0].toFixed(1)} ${cardP[1].toFixed(1)})`);
      report.tick.setAttribute("opacity", tickO.toFixed(3));
      report.tin.setAttribute("transform", `scale(${tickS.toFixed(3)})`);
    };

    try {
      await Promise.all(loads);
    } catch {
      return; // a layer failed to load: the still simply stays
    }
    if (destroyed) return;
    draw(t);
    requestAnimationFrame(() => {
      if (destroyed) return;
      stage.setAttribute("data-live", "");
      ready = true;
      sync();
      opts.onLive?.();
    });
  });

  return {
    time: () => t,
    seek: (time: number) => {
      t = time;
      draw(time);
      stage.getAnimations({ subtree: true }).forEach((a) => {
        a.pause();
        a.currentTime = time * 1000;
      });
    },
    destroy: () => {
      destroyed = true;
      running = false;
      cleanups.forEach((c) => c());
      stage.replaceChildren();
      stage.removeAttribute("data-live");
      stage.removeAttribute("data-paused");
    },
  };
}
