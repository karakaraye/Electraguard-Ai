// Shared helpers for the demonstration checks and the draft video recording.
// Needs the demo stack running (see docs/demo/RUN-THE-DEMO.md). Nothing here is a mock: every page talks to the real servers.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

export const BASE = process.env.EG_BASE ?? "http://localhost:3382";
const REPO = resolve(import.meta.dirname, "../../..");
export const SIGNINS = process.env.EG_SIGNINS ?? resolve(REPO, "..", "demo-signins.json");
const venv = join(REPO, "backend/.venv/Scripts/python.exe");
export const PYTHON = process.env.EG_PYTHON ?? (existsSync(venv) ? venv : "python");

export const signins = () => JSON.parse(readFileSync(SIGNINS, "utf8"));

/** The newest Chromium (headless shell preferred) under the Playwright browser folder. */
export function chromiumPath() {
  if (process.env.EG_CHROMIUM) return process.env.EG_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), "AppData/Local/ms-playwright");
  const pick = (prefix, exes) => {
    const dirs = readdirSync(root).filter((n) => n.startsWith(prefix)).sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()));
    for (const dir of dirs) for (const exe of exes) { const p = join(root, dir, exe); if (existsSync(p)) return p; }
  };
  return pick("chromium_headless_shell-", ["chrome-headless-shell-win64/chrome-headless-shell.exe", "chrome-win/headless_shell.exe"])
    ?? pick("chromium-", ["chrome-win64/chrome.exe", "chrome-win/chrome.exe"]);
}

export const launch = () => chromium.launch({ executablePath: chromiumPath() });

/** The current two-step code for a demo staff account, from the running database. */
export function totp(email) {
  return execFileSync(PYTHON, ["manage.py", "demo_totp", email], { cwd: join(REPO, "backend"), encoding: "utf8", env: process.env }).trim();
}

export const staffEmail = (key) => `${key}@demo.electraguard.test`;

export async function staffSignIn(page, key) {
  const email = staffEmail(key);
  const account = signins().staff[email];
  await page.goto(`${BASE}/s/sign-in`);
  await page.locator("#staff-email").fill(email);
  await page.locator("#staff-password").fill(account.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.getByTestId("staff-totp-input").waitFor();
  await page.getByTestId("staff-totp-input").fill(totp(email));
  await page.waitForURL((url) => !url.pathname.startsWith("/s/sign-in"), { timeout: 60000 });
}

/** A phone that has opened the app before: English, privacy notice read. */
export async function knownPhone(context) {
  await context.addInitScript(() => {
    if (window.localStorage.getItem("eg.test.ready")) return;
    window.localStorage.setItem("eg.test.ready", "1");
    window.localStorage.setItem("eg.locale", "en");
    window.localStorage.setItem("eg.noticeSeen", "2026-11-22");
  });
}

export async function observerSignIn(page, number = 4) {
  const label = `Demo observer ${String(number).padStart(2, "0")}`;
  const [code, info] = Object.entries(signins().observers).find(([, v]) => v.label === label);
  await page.goto(`${BASE}/o/start?view=sign-in`);
  await page.getByTestId("o03-code").fill(code);
  await page.getByTestId("o03-pin").fill(info.pin);
  await page.getByTestId("o03-submit").click();
  await page.waitForURL(/\/o$/, { timeout: 60000 });
  return code;
}

export const pause = (page, ms = 1500) => page.waitForTimeout(ms);
