/**
 * Observer flow against the REAL servers (Django + PostgreSQL behind Next).
 * No mocks: every request reaches the backend; the tests only cut the network
 * (offline, dropped responses, page kill) the way a phone would lose it.
 *
 * Run (servers already up, see README.md in this folder):
 *   EG_BASE=http://localhost:3281 npx playwright test -c e2e/observer-real
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/** Use the installed Chromium when the exact revision Playwright wants is not on this machine. */
function chromiumPath(): string | undefined {
  if (process.env.EG_CHROMIUM) return process.env.EG_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), process.platform === "win32" ? "AppData/Local/ms-playwright" : ".cache/ms-playwright");
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const dir of dirs) {
    for (const exe of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux64/chrome", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      const path = join(root, dir, exe);
      if (existsSync(path)) return path;
    }
  }
  return undefined;
}

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    ...devices["Pixel 5"],
    // A cheap Android phone: narrow screen, touch, reduced motion keeps timings stable.
    viewport: { width: 360, height: 760 },
    baseURL: process.env.EG_BASE ?? "http://localhost:3281",
    reducedMotion: "reduce",
    launchOptions: { executablePath: chromiumPath() },
    trace: "retain-on-failure",
  },
});
