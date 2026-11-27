// Every key in messages/en.json must exist in pcm, ha, yo and ig, and the reverse, and no value
// in any language may carry a placeholder marker.
// Run: node scripts/check-message-keys.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "messages");
const locales = ["en", "pcm", "ha", "yo", "ig"];

function flatten(value: unknown, prefix = "", out: Set<string> = new Set()): Set<string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("_")) continue;
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.add(prefix);
  }
  return out;
}

// Draft or filler text must never ship: "[HA draft] ...", TODO, TBD, lorem ipsum.
const placeholder = /\[(?:[A-Z]{2,4}) draft\]|\bTODO\b|\bTBD\b|lorem ipsum/i;

function strings(value: unknown, path: string, out: Array<[string, string]> = []) {
  if (typeof value === "string") out.push([path, value]);
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) strings(child, path ? `${path}.${key}` : key, out);
  }
  return out;
}

const keys = new Map<string, Set<string>>();
const placeholders: string[] = [];
for (const locale of locales) {
  const data = JSON.parse(readFileSync(join(dir, `${locale}.json`), "utf8"));
  keys.set(locale, flatten(data));
  for (const [path, text] of strings(data, "")) {
    if (placeholder.test(text)) placeholders.push(`  ${locale}: ${path} = ${JSON.stringify(text)}`);
  }
}

const reference = keys.get("en")!;
let problems = 0;
for (const locale of locales.slice(1)) {
  const own = keys.get(locale)!;
  const missing = [...reference].filter((key) => !own.has(key));
  const extra = [...own].filter((key) => !reference.has(key));
  console.log(`${locale}: ${own.size} keys, ${missing.length} missing, ${extra.length} not in en`);
  for (const key of missing) console.log(`  missing in ${locale}: ${key}`);
  for (const key of extra) console.log(`  only in ${locale}: ${key}`);
  problems += missing.length + extra.length;
}
console.log(`en: ${reference.size} keys`);

if (placeholders.length) {
  console.error(`\n${placeholders.length} placeholder value(s) found (draft marker, TODO, TBD or lorem ipsum):`);
  for (const line of placeholders) console.error(line);
}
if (problems) console.error(`\n${problems} key mismatch(es).`);
if (problems || placeholders.length) process.exit(1);
console.log("All five languages have the same keys and no placeholder values.");
