// The app never asks for the location of the phone. Fail if geolocation appears in app/, ui/ or lib/.
// Run: node scripts/check-privacy.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const banned = [/navigator\s*\.\s*geolocation/, /\bgetCurrentPosition\b/, /\bwatchPosition\b/];
const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (extensions.some((ext) => name.endsWith(ext))) yield path;
  }
}

let hits = 0;
let files = 0;
for (const folder of ["app", "ui", "lib"]) {
  for (const file of walk(join(root, folder))) {
    files++;
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (banned.some((pattern) => pattern.test(line))) {
          console.log(`${file.slice(root.length + 1)}:${index + 1}: ${line.trim()}`);
          hits++;
        }
      });
  }
}

if (hits) {
  console.error(`\n${hits} location API use(s) found.`);
  process.exit(1);
}
console.log(`No location API in ${files} source files.`);
