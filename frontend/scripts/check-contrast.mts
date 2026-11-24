// WCAG contrast check for the colour pairs in design spec B1, in both themes.
// Run: node scripts/check-contrast.ts   (Node 24 strips the types; built-ins only)
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const css = readFileSync(join(root, "ui", "tokens.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No ${selector} block in tokens.css`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i);
  }
  throw new Error(`Unclosed ${selector} block`);
}

function vars(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

const light = vars(block(":root"));
const dark = { ...light, ...vars(block('[data-theme="dark"]')) };

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Pair = { fg: string; bg: string; min: number; note: string };
const pairs: Pair[] = [
  { fg: "--ink", bg: "--paper", min: 15, note: "headings and body" },
  { fg: "--ink", bg: "--paper-raised", min: 15, note: "text on cards" },
  { fg: "--ink-2", bg: "--paper", min: 7, note: "secondary text" },
  { fg: "--ink-2", bg: "--paper-raised", min: 7, note: "secondary text on cards" },
  { fg: "--ink-3", bg: "--paper", min: 4.5, note: "meta text" },
  { fg: "--ink-3", bg: "--paper-raised", min: 4.5, note: "meta text on cards" },
  { fg: "--rule-control", bg: "--paper", min: 3, note: "control borders (1.4.11)" },
  { fg: "--rule-control", bg: "--paper-raised", min: 3, note: "control borders on cards" },
  { fg: "--sun-ink", bg: "--paper", min: 4.5, note: "eyebrows" },
  { fg: "--sun-ink", bg: "--sun-wash", min: 4.5, note: "eyebrows on question card" },
  { fg: "--ok", bg: "--ok-bg", min: 4.5, note: "status: received, closed" },
  { fg: "--info", bg: "--info-bg", min: 4.5, note: "status: in review" },
  { fg: "--attn", bg: "--attn-bg", min: 4.5, note: "status: question, attention" },
  { fg: "--wait", bg: "--wait-bg", min: 4.5, note: "status: on this phone" },
  { fg: "--danger", bg: "--danger-bg", min: 4.5, note: "status: danger, failed" },
  { fg: "--info", bg: "--sun-wash", min: 4.5, note: "info banner" },
  { fg: "--on-ink", bg: "--ink", min: 4.5, note: "primary button, toast, offline banner" },
  { fg: "--hero-ink", bg: "--hero", min: 4.5, note: "hero card title, staff rail" },
  { fg: "--hero-ink-2", bg: "--hero", min: 4.5, note: "hero card body, staff rail links" },
];

let failures = 0;
for (const [name, tokens] of [
  ["light", light],
  ["dark", dark],
] as const) {
  console.log(`\n${name}`);
  console.log("foreground".padEnd(16) + "background".padEnd(18) + "ratio".padStart(7) + "  need  result  note");
  for (const pair of pairs) {
    const fg = tokens[pair.fg];
    const bg = tokens[pair.bg];
    if (!fg || !bg) {
      console.log(`${pair.fg} / ${pair.bg}: token missing`);
      failures++;
      continue;
    }
    const value = ratio(fg, bg);
    const ok = value >= pair.min;
    if (!ok) failures++;
    console.log(
      pair.fg.padEnd(16) +
        pair.bg.padEnd(18) +
        value.toFixed(2).padStart(7) +
        `  ${String(pair.min).padStart(4)}  ${ok ? "pass  " : "FAIL  "}  ${pair.note}`,
    );
  }
}

if (failures) {
  console.error(`\n${failures} contrast failure(s).`);
  process.exit(1);
}
console.log("\nAll contrast pairs pass.");
