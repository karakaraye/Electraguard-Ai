// Source for the polling-day artwork (frontend/public/art/polling-day-{light,dark}.svg).
// Run from the repository root:  node docs/design/art/v2/polling-day.mjs
//
// The scene is drawn here as plain SVG shapes, one function per element, so the two theme
// versions share the same drawing and differ only in their palette block.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const W = 1600;
const H = 560;
const GROUND = 432;

/* ---------- Palettes: one role per class, light and dark ---------- */

const ROLES = {
  //      light      dark
  h1: ["#faf3e8", "#181614"], // outer halo
  h0: ["#f6e9d2", "#1f1b16"], // middle halo
  h2: ["#f2e0be", "#2a231a"], // inner halo
  sn: ["#e3bd80", "#b08850"], // sun (the one warm tone)
  rm: ["#e7c48c", "#b48c54"], // warm rim light on the sun side of figures
  f1: ["#efeeea", "#18181a"], // far tree line
  f2: ["#e4e2dd", "#1d1d1f"], // distant roofs and trees
  t1: ["#cfcdc7", "#2c2c2f"], // neem canopy
  t2: ["#bdbbb5", "#252528"], // neem canopy, shade
  t3: ["#d8d6d0", "#323236"], // neem canopy, sunlit
  t4: ["#adaba5", "#1f1f22"], // neem canopy, deepest shade
  tk: ["#8f8d88", "#3d3d41"], // trunks
  pf: ["#a9a7a1", "#2f2f33"], // palm fronds
  wl: ["#dedcd6", "#2e2e32"], // school wall under the veranda
  ws: ["#eeece7", "#3a3a3f"], // school wall in sun
  rf: ["#a3a19b", "#232326"], // roof
  rr: ["#bab8b2", "#2e2e32"], // roof ridges
  cl: ["#f5f3ee", "#3f3f44"], // columns
  bb: ["#c4c2bc", "#1f1f22"], // breeze blocks, window openings
  dr: ["#97958f", "#18181a"], // doors
  vs: ["#cfcdc7", "#1c1c1f"], // veranda shadow
  cn: ["#e2e0da", "#3b3b3f"], // canopy roof
  cs: ["#cac8c2", "#2f2f33"], // canopy roof, shaded slope
  cv: ["#b3b1ab", "#46464b"], // canopy valance
  pl: ["#8c8a85", "#56565b"], // poles, table legs
  gd: ["#f1efe9", "#161618"], // ground
  g2: ["#e9e6df", "#1a1a1c"], // ground, nearer band
  rd: ["#f8f6f1", "#1f1f22"], // road
  re: ["#dedbd3", "#252528"], // road edge
  sh: ["#dcd8cf", "#0c0c0d"], // cast shadows
  tf: ["#c9c6be", "#2c2c30"], // grass tufts
  sk: ["#5b5651", "#86807a"], // skin
  hr: ["#2b2a29", "#4a4846"], // hair
  c1: ["#33322f", "#4c4b49"], // darkest cloth
  c2: ["#6f6d69", "#6e6d6a"], // dark cloth
  c3: ["#9c9a95", "#94928e"], // mid cloth
  c4: ["#c6c4be", "#b6b4af"], // light cloth
  c5: ["#ecebe6", "#d6d4cf"], // white cloth
  wh: ["#7d7b77", "#8a8885"], // wheelchair
  hd: ["#a3a19b", "#1a1a1c"], // halftone dots in shade
};

function style(theme) {
  const i = theme === "dark" ? 1 : 0;
  return Object.entries(ROLES)
    .map(([k, v]) => `.${k}{fill:${v[i]}}`)
    .join("");
}

/* ---------- Helpers ---------- */

const n = (v) => Math.round(v * 10) / 10;
const p = (cls, d) => `<path class="${cls}" d="${d}"/>`;
const e = (cls, cx, cy, rx, ry) => `<ellipse class="${cls}" cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry ?? rx)}"/>`;
const c = (cls, cx, cy, r) => `<circle class="${cls}" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`;
const r = (cls, x, y, w, h, rx = 0) =>
  `<rect class="${cls}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${rx ? ` rx="${rx}"` : ""}/>`;
const g = (x, y, s, body, flip = false) =>
  `<g transform="translate(${n(x)} ${n(y)}) scale(${flip ? -s : s} ${s})">${body}</g>`;

// Deterministic randomness so every build draws the same scene
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/* ---------- Figures (local units: feet at 0,0, about 150 tall, facing right) ---------- */

const head = (x = 2, y = -137) => e("sk", x, y, 9.5, 11.5);
const neck = () => r("sk", -3, -128, 8, 10);
const rim = (x = 2, y = -137) =>
  `<path class="rm" d="M${x - 9.4},${y + 1} A9.5,11.5 0 0 1 ${x - 1},${y - 11.4} A9.5,11.5 0 0 0 ${x - 7.6},${y + 1} Z"/>`;
const shoe = (x, cls = "c1") => e(cls, x, -2, 6.5, 2.6);
const hand = (x, y) => e("sk", x, y, 3.8, 4.4);

// Trousered legs, standing
const legs = (cls, spread = 0) =>
  p(cls, `M-12,-68 L-11,-3 L-3,-3 L1,-52 L4,-3 L12,-3 L14,-68 Z`) + shoe(-6 - spread) + shoe(9 + spread);

// Walking legs (stride)
const stride = (cls) =>
  p(cls, `M-11,-68 L-19,-4 L-11,-3 L1,-48 L10,-3 L18,-5 L13,-68 Z`) + shoe(-15) + shoe(15);

const torso = (cls, top = -121, bottom = -64) =>
  p(cls, `M-16,${top + 8} Q-17,${top} -9,${top} L12,${top} Q19,${top} 18,${top + 8} L15,${bottom} L-13,${bottom} Z`);

// Arm hanging at the side (front arm)
const armDown = (cls, sleeve = 24) =>
  p(cls, `M7,-119 Q18,-119 18,-108 L17,-${118 - sleeve - 10} L8,-${118 - sleeve - 10} L8,-110 Z`) +
  p("sk", `M8,-${118 - sleeve - 10} L17,-${118 - sleeve - 10} L16,-72 Q12,-66 9,-72 Z`) +
  hand(12.5, -68);

function youngMan() {
  // T-shirt, jeans, short hair, phone held low
  return (
    legs("c1") +
    torso("c4", -121, -62) +
    neck() +
    head() +
    p("hr", "M-7.5,-142 Q-6,-150 3,-149.5 Q11,-149 11.5,-141 Q8,-145 1,-145 Q-5,-145 -7.5,-142 Z") +
    rim() +
    armDown("c4", 14) +
    r("c1", 12, -79, 6, 10, 1.5)
  );
}

function hijabWoman() {
  // Long dress to the ankles, hijab over head and shoulders
  return (
    p("c3", "M-14,-112 Q-16,-121 -8,-121 L12,-121 Q19,-120 18,-112 L23,-4 L-19,-4 Z") +
    shoe(-8, "c1") +
    shoe(10, "c1") +
    p("c2", "M-12,-130 Q-14,-152 2,-152 Q17,-152 14,-130 Q22,-120 21,-98 Q4,-92 -15,-99 Q-18,-118 -12,-130 Z") +
    e("sk", 5, -135, 6.5, 8.5) +
    p("c2", "M8,-118 Q18,-117 18,-104 L17,-80 L9,-80 Z") +
    hand(13, -77)
  );
}

function elderMan() {
  // Agbada over trousers, fila cap, walking stick, a slight stoop
  return (
    p("c2", "M-9,-40 L-9,-3 L-2,-3 L0,-40 Z M3,-40 L5,-3 L12,-3 L11,-40 Z") +
    shoe(-5) +
    shoe(9) +
    p("c5", "M-14,-114 Q-12,-122 -3,-123 L13,-122 Q21,-120 22,-112 Q34,-90 32,-70 L28,-34 L-22,-34 L-19,-70 Q-22,-96 -14,-114 Z") +
    p("c4", "M-19,-70 L-22,-34 L-8,-34 L-6,-80 Z M22,-108 Q33,-88 32,-70 L24,-66 Z") +
    neck() +
    head(5, -137) +
    p("c3", "M-5,-141 Q-6,-153 6,-154 Q17,-155 21,-148 Q16,-143 14,-141 Z") +
    rim(5, -137) +
    hand(31, -72) +
    p("tk", "M30.5,-74 L33,-2 L35.5,-2 L33,-74 Z")
  );
}

function geleWoman() {
  // Gele head-tie, buba blouse, iro wrapper with a woven stripe, bag in hand
  const stripes = [-58, -44, -30, -16]
    .map((y) => p("c2", `M-15,${y} L19,${y - 1} L19.3,${y + 3} L-15.3,${y + 4} Z`))
    .join("");
  return (
    shoe(-7) +
    shoe(10) +
    p("c1", "M-14,-74 L18,-74 L21,-4 L-17,-4 Z") +
    stripes +
    p("c4", "M-16,-112 Q-17,-121 -9,-121 L12,-121 Q19,-120 18,-112 L20,-70 Q2,-64 -16,-70 Z") +
    neck() +
    head() +
    p("c3", "M-11,-140 Q-20,-150 -12,-160 Q-2,-166 9,-160 Q18,-156 13,-146 Q14,-141 10,-140 Q0,-145 -11,-140 Z") +
    p("c4", "M-12,-158 Q-24,-162 -19,-170 Q-9,-166 -5,-160 Z M-14,-150 Q-25,-148 -24,-140 Q-17,-143 -11,-145 Z") +
    rim() +
    p("c4", "M8,-119 Q18,-118 18,-106 L17,-92 L9,-92 Z") +
    p("sk", "M9,-92 L17,-92 L16,-73 Q12,-68 9,-73 Z") +
    hand(12.5, -70) +
    p("c2", "M7,-69 L19,-69 L21,-52 L5,-52 Z") +
    p("c1", "M9,-69 Q13,-80 17,-69 L15.5,-69 Q13,-76 10.5,-69 Z")
  );
}

function motherBaby() {
  // Wrapper and head-tie, a baby tied on her back in a patterned cloth, holding her son's hand
  return (
    shoe(-7) +
    shoe(10) +
    p("c3", "M-15,-74 L18,-74 L21,-4 L-17,-4 Z") +
    p("c5", "M-15,-50 L19,-51 L19.5,-46 L-15.4,-45 Z") +
    p("c2", "M-16,-112 Q-17,-121 -9,-121 L12,-121 Q19,-120 18,-112 L19,-70 L-15,-70 Z") +
    // baby's head over her shoulder, the wrap around both
    e("sk", -15, -125, 7, 7.5) +
    p("hr", "M-22,-127 Q-21,-134 -15,-133 Q-9,-133 -8.5,-127 Q-13,-130 -22,-127 Z") +
    p("c4", "M-10,-118 Q-30,-118 -30,-96 Q-29,-76 -12,-72 L-6,-84 Z") +
    p("c5", "M-27,-108 Q-20,-104 -9,-106 L-9,-102 Q-21,-99 -28,-103 Z M-29,-92 Q-20,-88 -8,-90 L-8,-86 Q-20,-84 -29,-87 Z") +
    p("c4", "M-12,-104 L18,-100 L18,-94 L-12,-97 Z") +
    neck() +
    head() +
    p("c1", "M-9,-142 Q-10,-154 2,-155 Q14,-155 13,-142 Q6,-147 -9,-142 Z") +
    rim() +
    p("c2", "M8,-119 Q18,-118 18,-106 L20,-92 L11,-91 Z") +
    p("sk", "M11,-91 L20,-92 L23,-56 L16,-56 Z") +
    hand(19.5, -53)
  );
}

function child() {
  // A child of about six, holding a hand up
  return (
    legs("c2") +
    torso("c5", -121, -64) +
    neck() +
    head(2, -137) +
    p("hr", "M-7.5,-141 Q-6,-150 3,-149.5 Q11,-149 11.5,-140 Q6,-145 -7.5,-141 Z") +
    p("c5", "M-14,-119 Q-24,-119 -26,-110 L-30,-104 L-22,-100 L-14,-106 Z") +
    p("sk", "M-30,-104 L-22,-100 L-27,-88 L-34,-92 Z") +
    e("sk", -32, -88, 4, 4.6)
  );
}

function wheelchair() {
  // Seated man in a wheelchair, facing right, one hand on the push rim
  const cx = -4;
  const cy = -28;
  const spokes = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 6 + 0.2;
    const x = Math.cos(a) * 22;
    const y = Math.sin(a) * 22;
    return `M${n(cx - x)},${n(cy - y)} L${n(cx + x)},${n(cy + y)}`;
  }).join(" ");
  return (
    // backrest with push handle, seat, front post and footrest
    p("wh", "M-27,-96 L-15,-96 L-12,-48 L-16,-48 L-18,-91 L-27,-91 Z") +
    p("wh", "M-15,-50 L20,-50 L20,-45 L-15,-45 Z M15,-47 L19,-47 L24,-13 L20,-13 Z M18,-14 L31,-14 L31,-10 L18,-10 Z") +
    // seated body: thighs forward, shins down
    p("c1", "M-12,-62 L19,-60 Q25,-59 25,-52 L28,-15 L20,-15 L17,-49 L-12,-49 Z") +
    e("c1", 27, -12.5, 6.5, 2.8) +
    p("c3", "M-16,-104 Q-17,-114 -8,-115 L8,-115 Q15,-114 14,-104 L13,-56 L-13,-56 Z") +
    r("sk", -4, -122, 8, 9) +
    e("sk", 1, -131, 9.5, 11.5) +
    p("hr", "M-8.5,-135 Q-7,-144 2,-143.5 Q10,-143 10.5,-135 Q5,-139 -8.5,-135 Z") +
    rim(1, -131) +
    p("c3", "M5,-113 Q14,-112 14,-101 L12,-70 L4,-70 Z") +
    p("sk", "M4,-70 L12,-70 L10,-56 L4,-57 Z") +
    hand(7, -54) +
    // wheel over the seat: tyre ring, spokes, hub, front caster
    p("wh", `M${cx},${cy - 27} A27,27 0 1 1 ${cx - 0.1},${cy - 27} Z M${cx},${cy - 23} A23,23 0 1 0 ${cx + 0.1},${cy - 23} Z`) +
    `<path class="whs" d="${spokes}" style="stroke-width:1.3"/>` +
    c("wh", cx, cy, 3.5) +
    c("wh", 26, -5, 5)
  );
}

function youngWoman() {
  // Top bun, blouse, trousers, tote on the shoulder
  return (
    legs("c2") +
    torso("c5", -121, -64) +
    p("c1", "M-16,-114 Q-24,-108 -24,-92 L-21,-78 L-9,-78 L-10,-110 Z") +
    p("c1", "M-13,-120 L-6,-121 L-15,-90 L-17,-91 Z") +
    neck() +
    head() +
    p("hr", "M-7.5,-141 Q-7,-150 3,-150 Q11,-150 11.5,-141 Q5,-146 -7.5,-141 Z") +
    e("hr", -3, -152, 6, 5.5) +
    rim() +
    armDown("c5", 10)
  );
}

function kaftanMan() {
  // Long tunic over trousers, cap
  return (
    legs("c3") +
    p("c4", "M-16,-112 Q-17,-121 -9,-121 L12,-121 Q19,-120 18,-112 L20,-36 L-17,-36 Z") +
    p("c3", "M2,-121 L4,-121 L4,-96 L2,-96 Z") +
    neck() +
    head() +
    r("c1", -8, -153, 20, 10, 3) +
    rim() +
    armDown("c4", 22)
  );
}

function kaftanWalker() {
  return (
    stride("c3") +
    p("c4", "M-16,-112 Q-17,-121 -9,-121 L12,-121 Q19,-120 18,-112 L24,-40 L-21,-40 Z") +
    neck() +
    head() +
    r("c1", -8, -153, 20, 10, 3) +
    rim() +
    p("c4", "M7,-119 Q18,-118 18,-106 L23,-80 L15,-78 L9,-104 Z") +
    hand(20, -76)
  );
}

function geleWalker() {
  return (
    p("c1", "M-14,-74 L18,-74 L24,-4 L-21,-4 Z") +
    p("c3", "M-15,-40 L20,-41 L21,-35 L-16,-34 Z") +
    shoe(-16) +
    shoe(18) +
    p("c3", "M-16,-112 Q-17,-121 -9,-121 L12,-121 Q19,-120 18,-112 L20,-70 Q2,-64 -16,-70 Z") +
    neck() +
    head() +
    p("c2", "M-11,-140 Q-20,-150 -12,-160 Q-2,-166 9,-160 Q18,-156 13,-146 Q14,-141 10,-140 Q0,-145 -11,-140 Z") +
    p("c2", "M-12,-158 Q-24,-162 -19,-170 Q-9,-166 -5,-160 Z") +
    rim() +
    p("c3", "M7,-119 Q18,-118 18,-106 L22,-82 L14,-80 L9,-104 Z") +
    hand(18, -78)
  );
}

function observer() {
  // Observer: plain vest over a shirt, lanyard and card, phone held up to note what they see
  return (
    legs("c1") +
    torso("c3", -121, -62) +
    p("c4", "M-15,-112 L-12,-120 L-3,-120 L0,-100 L4,-120 L12,-120 L16,-112 L14,-64 L-12,-64 Z") +
    neck() +
    head() +
    p("hr", "M-7.5,-142 Q-6,-150 3,-149.5 Q11,-149 11.5,-141 Q8,-145 1,-145 Q-5,-145 -7.5,-141 Z") +
    rim() +
    // lanyard and card
    p("c1", "M-3,-121 L0,-96 L4,-121 L5.5,-121 L1,-93 L-1,-93 L-4.5,-121 Z") +
    r("c5", -5, -95, 11, 14, 1.5) +
    r("c2", -3, -92, 7, 2) +
    // arm raised, holding the phone at chest height
    p("c3", "M8,-119 Q18,-119 18,-108 L17,-94 L28,-98 L30,-91 L14,-86 Q9,-86 9,-92 Z") +
    hand(30, -96) +
    r("c1", 27, -110, 7, 13, 1.5) +
    r("c5", 28.2, -108.5, 4.6, 9, 0.8)
  );
}

function official(cls) {
  // Seated official behind the table (upper body only)
  return torso(cls, -121, -80) + neck() + head() + p("hr", "M-7.5,-141 Q-6,-150 3,-149.5 Q11,-149 11.5,-141 Q5,-146 -7.5,-141 Z");
}

/* ---------- Scene pieces ---------- */

function shadowOf(x, y, s, len = 70, width = 22) {
  const a = x - (width / 2) * s;
  const b = x + (width / 2) * s;
  const dx = len * s;
  const dy = 13 * s;
  return p(
    "sh",
    `M${n(a)},${n(y)} L${n(b)},${n(y)} Q${n(b + dx * 0.6)},${n(y + dy * 0.6)} ${n(b + dx)},${n(y + dy)} Q${n(a + dx + 4 * s)},${n(y + dy + 4 * s)} ${n(a + dx * 0.9)},${n(y + dy + 1)} Z`
  );
}

function sun(theme) {
  const x = 640;
  if (theme === "dark") {
    // First light: the sun just clearing the far trees, a wide low glow along the horizon
    const sx = 712;
    const y = 300;
    return e("h1", sx, y, 300, 130) + e("h0", sx, y, 190, 92) + e("h2", sx, y, 100, 64) + c("sn", sx, y, 38);
  }
  const y = 266;
  return c("h1", x, y, 150) + c("h0", x, y, 112) + c("h2", x, y, 78) + c("sn", x, y, 44);
}

function birds() {
  const one = (x, y, s) =>
    `<path class="tk" d="M${x},${y} q${4 * s},${-4 * s} ${8 * s},0 q${4 * s},${-4 * s} ${8 * s},0 q${-4 * s},${-2 * s} ${-8 * s},${1.4 * s} q${-4 * s},${-3.4 * s} ${-8 * s},${-1.4 * s} Z"/>`;
  return one(720, 168, 1.1) + one(748, 184, 0.8) + one(700, 196, 0.7);
}

function farLine() {
  // Soft bumps of distant trees along the horizon
  let d = `M0,${GROUND} L0,412`;
  let x = 0;
  seed = 11;
  while (x < W) {
    const w = 40 + rnd() * 70;
    const h = 10 + rnd() * 26;
    d += ` Q${n(x + w / 2)},${n(412 - h * 2)} ${n(x + w)},412`;
    x += w;
  }
  d += ` L${W},${GROUND} Z`;
  // A few distant roofs
  const roofs = [
    [180, 396, 70],
    [1180, 392, 60],
    [1470, 398, 90],
  ]
    .map(([x0, y0, w0]) => p("f2", `M${x0},${y0 + 14} L${x0 + 10},${y0} L${x0 + w0 - 10},${y0} L${x0 + w0},${y0 + 14} Z`) + r("f2", x0 + 4, y0 + 14, w0 - 8, GROUND - y0 - 14))
    .join("");
  return p("f1", d) + roofs;
}

// Closed organic outline: a wobbling ellipse whose edge is made of small outward scallops (leaves)
function leafy(cx, cy, rx, ry, lobes, wobble, from = 0, to = Math.PI * 2, close = true) {
  const pts = [];
  for (let i = 0; i <= lobes; i++) {
    const a = from + ((to - from) * i) / lobes;
    const k = 1 + (rnd() - 0.5) * wobble + Math.sin(a * 3 + 1) * wobble * 0.5;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  let d = `M${n(pts[0][0])},${n(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    // push the control point outward from the centre for a rounded leaf lobe
    const ox = mx - cx;
    const oy = my - cy;
    const len = Math.hypot(ox, oy) || 1;
    const bulge = 0.16 * Math.hypot(x1 - x0, y1 - y0) + 2;
    d += ` Q${n(mx + (ox / len) * bulge)},${n(my + (oy / len) * bulge)} ${n(x1)},${n(y1)}`;
  }
  return close ? d + " Z" : d;
}

function neem(x, y, s) {
  // Broad, low crown with a leafy edge; shade (with halftone) below right, sun on the upper left
  seed = 29;
  const crown = leafy(0, -22, 158, 98, 48, 0.13);
  const shade = leafy(30, 18, 128, 58, 30, 0.12);
  const deep = leafy(46, 46, 90, 26, 18, 0.1);
  const lit = leafy(-46, -52, 62, 30, 20, 0.12);
  const trunk = p(
    "tk",
    "M-14,150 Q-8,104 -15,70 L-58,30 L-50,24 L-11,56 Q-7,36 -18,10 L-9,7 Q2,34 2,50 L44,18 L50,25 Q14,52 10,76 Q7,108 15,150 Z"
  );
  return g(
    x,
    y,
    s,
    trunk +
      p("t1", crown) +
      p("t2", shade) +
      `<path d="${shade}" fill="url(#ht)"/>` +
      p("t4", deep) +
      p("t3", lit)
  );
}

function palm(x, y, s, lean = 1) {
  // Curved trunk with growth rings, crown of drooping fronds drawn as leaflets on a spine
  const top = [x + 34 * lean * s, y - 250 * s];
  const trunk = p(
    "tk",
    `M${n(x - 7 * s)},${y} Q${n(x - 4 * s + 10 * lean * s)},${n(y - 130 * s)} ${n(top[0] - 4 * s)},${n(top[1])} L${n(top[0] + 4 * s)},${n(top[1])} Q${n(x + 6 * s + 10 * lean * s)},${n(y - 130 * s)} ${n(x + 7 * s)},${y} Z`
  );
  let fronds = "";
  const angles = [-170, -140, -112, -80, -52, -22, 8, 30, 160, 192];
  for (const deg of angles) {
    const a = (deg * Math.PI) / 180;
    const len = (70 + (Math.abs(Math.cos(a)) * 30)) * s;
    const ex = top[0] + Math.cos(a) * len;
    const ey = top[1] + Math.sin(a) * len * 0.55 + 38 * s;
    const mx = top[0] + Math.cos(a) * len * 0.5;
    const my = top[1] + Math.sin(a) * len * 0.5 - 14 * s;
    let d = `M${n(top[0])},${n(top[1])} Q${n(mx)},${n(my)} ${n(ex)},${n(ey)}`;
    // leaflets
    for (let t = 0.18; t < 0.98; t += 0.085) {
      const bx = (1 - t) * (1 - t) * top[0] + 2 * (1 - t) * t * mx + t * t * ex;
      const by = (1 - t) * (1 - t) * top[1] + 2 * (1 - t) * t * my + t * t * ey;
      const l = (1 - t * 0.6) * 22 * s;
      d += ` M${n(bx)},${n(by)} l${n(Math.cos(a) * l * 0.35 - 3 * s)},${n(l)}`;
      d += ` M${n(bx)},${n(by)} l${n(Math.cos(a) * l * 0.35 + 3 * s)},${n(l * 0.9)}`;
    }
    fronds += `<path d="${d}" fill="none" stroke-linecap="round" class="pfs" style="stroke-width:${n(2.6 * s)}"/>`;
  }
  return trunk + fronds + c("tk", top[0], top[1] + 4 * s, 7 * s);
}

function school() {
  const x0 = 860;
  const x1 = 1530;
  const wallTop = 352;
  const base = 444;
  let s = "";
  // side wall in the sun (left end, slight perspective)
  s += p("ws", `M832,${base - 4} L832,${wallTop + 6} L${x0},${wallTop} L${x0},${base} Z`);
  s += p("wl", `M${x0},${wallTop} L${x1},${wallTop} L${x1},${base} L${x0},${base} Z`);
  // veranda shadow band under the roof
  s += r("vs", x0, wallTop, x1 - x0, 16);
  // windows of breeze blocks and doors between the columns
  for (let i = 0; i < 9; i++) {
    const bx = x0 + 22 + i * 74;
    if (i % 3 === 1) {
      s += r("dr", bx + 14, 384, 26, 58);
    } else {
      for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) s += r("bb", bx + 8 + col * 11, 382 + row * 11, 8, 8);
    }
  }
  // columns
  for (let i = 0; i <= 9; i++) s += r("cl", x0 + 4 + i * 73.6, wallTop + 8, 9, base - wallTop - 12);
  // veranda floor
  s += r("cl", x0 - 4, base - 4, x1 - x0 + 8, 6);
  // roof: front slope with corrugations, gable on the sunlit end
  s += p("rf", `M${x0 - 34},${wallTop + 4} L${x1 + 14},${wallTop + 4} L${x1 - 10},${wallTop - 30} L${x0 - 6},${wallTop - 30} Z`);
  let ridges = "";
  for (let x = x0 - 24; x < x1 + 6; x += 12) ridges += `M${x},${wallTop + 3} L${x + 2.4},${wallTop - 29}`;
  s += `<path d="${ridges}" fill="none" class="rrs" style="stroke-width:3"/>`;
  s += p("ws", `M${x0 - 34},${wallTop + 4} L${x0 - 6},${wallTop - 30} L${x0 - 2},${wallTop - 26} L${x0 - 28},${wallTop + 4} Z`);
  return s;
}

function canopy() {
  // Open shade tent with a scalloped valance, a table and two officials, a voting screen
  let s = "";
  const L = 704;
  const R = 966;
  const eave = 348;
  // shade on the ground, officials and table (behind the front poles)
  s += p("sh", "M716,452 L960,452 Q1000,462 980,470 L740,470 Q700,462 716,452 Z");
  s += g(792, 474, 0.72, official("c2")) + g(848, 474, 0.72, official("c3"));
  s += r("c4", 764, 416, 148, 8, 1.5);
  s += r("pl", 770, 424, 3, 32) + r("pl", 903, 424, 3, 32);
  // voting screen on a stand (plain panel, no markings)
  s += p("c4", "M926,384 L956,380 L958,418 L928,420 Z") + r("pl", 940, 419, 3, 38);
  // back poles
  s += r("pl", 740, 330, 3.5, 118) + r("pl", 928, 330, 3.5, 114);
  // roof
  s += p("cn", `M${L},${eave} L740,314 L930,314 L${R},${eave} Z`);
  s += p("cs", `M835,314 L930,314 L${R},${eave} L835,${eave} Z`);
  let scallop = `M${L},${eave}`;
  const count = 14;
  const step = (R - L) / count;
  for (let i = 0; i < count; i++) scallop += ` q${n(step / 2)},${14} ${n(step)},0`;
  s += p("cv", `${scallop} L${R},${eave - 4} L${L},${eave - 4} Z`);
  // front poles
  s += r("pl", L + 2, eave, 4, 112) + r("pl", R - 6, eave, 4, 112);
  return s;
}

function ground() {
  let s = r("gd", 0, GROUND, W, H - GROUND);
  s += p("g2", `M0,500 Q400,486 800,494 Q1200,502 ${W},488 L${W},${H} L0,${H} Z`);
  // the road that leads in from the left
  s += p("re", `M-10,${H} L250,${H} Q300,512 420,488 Q520,474 620,474 L620,478 Q520,479 424,494 Q320,518 286,${H} Z`);
  s += p("rd", `M-10,${H} L246,${H} Q290,510 416,484 Q520,466 640,468 Q540,470 430,482 Q300,506 0,522 Z`);
  // grass tufts and pebbles
  seed = 41;
  let tufts = "";
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W;
    const y = GROUND + 8 + rnd() * (H - GROUND - 14);
    if (x > 700 && x < 1000 && y < 470) continue;
    const k = 0.6 + rnd() * 0.8;
    tufts += `M${n(x)},${n(y)} l${n(-3 * k)},${n(-7 * k)} M${n(x + 2)},${n(y)} l${n(0.5 * k)},${n(-9 * k)} M${n(x + 4)},${n(y)} l${n(4 * k)},${n(-6 * k)}`;
  }
  s += `<path d="${tufts}" fill="none" stroke-linecap="round" class="tfs" style="stroke-width:1.6"/>`;
  return s;
}

/* ---------- Composition ---------- */

function scene(theme) {
  const people = [
    // [x, y, scale, drawing, flip]
    [690, 466, 0.95, youngMan],
    [646, 469, 0.97, hijabWoman],
    [594, 471, 0.98, elderMan],
    [540, 474, 0.99, geleWoman],
    [474, 478, 1.0, wheelchair],
    [400, 481, 1.01, motherBaby],
    [438, 489, 0.62, child],
    [342, 483, 1.02, youngWoman, true],
    [298, 487, 1.03, kaftanMan],
  ];
  const walkers = [
    [188, 528, 1.14, kaftanWalker],
    [116, 540, 1.16, geleWalker],
    [1430, 500, 1.04, geleWalker, true],
  ];
  const distant = [
    [1236, 452, 0.62, kaftanMan, true],
    [1262, 453, 0.62, hijabWoman, true],
  ];
  const obs = [992, 494, 1.06, observer, true];

  const all = [...people, ...walkers, ...distant, obs];
  const shadows = all.map(([x, y, s]) => shadowOf(x, y, s)).join("");
  const drawFigures = (list) => list.map(([x, y, s, f, flip]) => g(x, y, s, f(), flip)).join("");

  return [
    sun(theme),
    birds(),
    farLine(),
    palm(1290, 440, 1.0, 1),
    palm(1580, 448, 0.9, -1),
    palm(70, 436, 0.8, 1),
    school(),
    ground(),
    p("sh", "M300,452 Q470,440 640,452 Q700,462 620,470 Q460,474 300,464 Z"),
    neem(420, 314, 1),
    shadows,
    canopy(),
    drawFigures(distant),
    drawFigures(people.slice().reverse()),
    drawFigures([obs]),
    drawFigures(walkers),
  ].join("");
}

function svg(theme) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">` +
    `<defs><pattern id="ht" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="0.9" class="hd"/></pattern></defs>` +
    `<style>${style(theme)}.pfs{stroke:${ROLES.pf[theme === "dark" ? 1 : 0]}}.rrs{stroke:${ROLES.rr[theme === "dark" ? 1 : 0]}}.tfs{stroke:${ROLES.tf[theme === "dark" ? 1 : 0]}}.whs{fill:none;stroke:${ROLES.wh[theme === "dark" ? 1 : 0]}}</style>` +
    scene(theme) +
    `</svg>`
  );
}

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../../../frontend/public/art");
for (const theme of ["light", "dark"]) {
  writeFileSync(resolve(out, `polling-day-${theme}.svg`), svg(theme));
}
console.log("written", out);
