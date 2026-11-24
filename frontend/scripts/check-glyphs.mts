// Every character in every messages/*.json string must be covered by the unicode-range of the
// self-hosted fonts: Noto Sans (ui/tokens.css) and Noto Sans Display (ui/fonts-display.css).
// Run: node scripts/check-glyphs.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const locales = ["en", "pcm", "ha", "yo", "ig"];

type Range = [number, number];

function rangesFor(file: string, family: string): Range[] {
  const css = readFileSync(join(root, "ui", file), "utf8");
  const ranges: Range[] = [];
  for (const face of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = face[1];
    if (!body.includes(`"${family}"`)) continue;
    const unicode = body.match(/unicode-range:\s*([^;]+);/);
    if (!unicode) continue;
    for (const part of unicode[1].split(",")) {
      const m = part.trim().match(/^U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?$/);
      if (!m) continue;
      const lo = parseInt(m[1], 16);
      ranges.push([lo, m[2] ? parseInt(m[2], 16) : lo]);
    }
  }
  return ranges;
}

const fonts: Array<{ name: string; ranges: Range[] }> = [
  { name: "Noto Sans", ranges: rangesFor("tokens.css", "Noto Sans") },
  { name: "Noto Sans Display", ranges: rangesFor("fonts-display.css", "Noto Sans Display") },
];
for (const font of fonts) {
  if (!font.ranges.length) {
    console.error(`No unicode-range found for ${font.name}.`);
    process.exit(1);
  }
}

function covered(ranges: Range[], cp: number) {
  return ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
}

function strings(value: unknown, path: string, out: Array<[string, string]> = []) {
  if (typeof value === "string") out.push([path, value]);
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) strings(child, path ? `${path}.${key}` : key, out);
  }
  return out;
}

let problems = 0;
for (const locale of locales) {
  const data = JSON.parse(readFileSync(join(root, "messages", `${locale}.json`), "utf8"));
  const found = new Map<string, Set<string>>();
  for (const [key, text] of strings(data, "")) {
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      for (const font of fonts) {
        if (!covered(font.ranges, cp)) {
          const id = `${font.name} U+${cp.toString(16).toUpperCase().padStart(4, "0")} "${ch}"`;
          if (!found.has(id)) found.set(id, new Set());
          found.get(id)!.add(key);
        }
      }
    }
  }
  console.log(`${locale}: ${found.size} uncovered character(s)`);
  for (const [id, keyset] of found) {
    const list = [...keyset];
    console.log(`  ${id} in ${list.length} string(s), e.g. ${list.slice(0, 3).join(", ")}`);
    problems++;
  }
}

if (problems) {
  console.error(`\n${problems} uncovered character(s) across the two fonts.`);
  process.exit(1);
}
console.log("Every character is covered by both fonts.");
