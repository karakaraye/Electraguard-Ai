// Every key in messages/en.json must exist in pcm, ha, yo and ig, and the reverse.
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

const keys = new Map<string, Set<string>>();
for (const locale of locales) {
  keys.set(locale, flatten(JSON.parse(readFileSync(join(dir, `${locale}.json`), "utf8"))));
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

if (problems) {
  console.error(`\n${problems} key mismatch(es).`);
  process.exit(1);
}
console.log("All five languages have the same keys.");
