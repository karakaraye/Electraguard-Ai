import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoots = [join(root, "app"), join(root, "ui")];
const locales = ["en", "pcm", "ha", "yo", "ig"] as const;
const messageFiles = Object.fromEntries(
  locales.map((locale) => [
    locale,
    JSON.parse(readFileSync(join(root, "messages", `${locale}.json`), "utf8")) as Record<string, unknown>,
  ]),
) as Record<(typeof locales)[number], Record<string, unknown>>;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function hasKey(messages: Record<string, unknown>, key: string): boolean {
  let value: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof value !== "object" || value === null || !(part in value)) return false;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === "string";
}

const failures: string[] = [];
const seen = new Set<string>();
const literalCall = /\bt\s*\(\s*(["'])([^"'\n]+?)\1\s*[,)]/g;

for (const sourceRoot of sourceRoots) {
  for (const file of sourceFiles(sourceRoot)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(literalCall)) {
      const key = match[2];
      const line = source.slice(0, match.index).split("\n").length;
      const location = `${relative(root, file)}:${line}`;
      const identity = `${location}:${key}`;
      if (seen.has(identity)) continue;
      seen.add(identity);

      for (const locale of locales) {
        if (!hasKey(messageFiles[locale], key)) {
          failures.push(`${location}: missing ${locale} message key "${key}"`);
        }
      }
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Checked ${seen.size} literal translation calls across ${locales.join(", ")}.`);
}
