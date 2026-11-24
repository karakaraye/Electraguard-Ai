/**
 * Shared steps for the real-backend observer suite. Server state is created and
 * checked through server_state.py (the same Django settings and database as the
 * running server); the browser only talks to the real API.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, type BrowserContext, type Page } from "@playwright/test";

const HERE = __dirname;
const REPO = resolve(HERE, "../../..");
export const OUT = join(REPO, "frontend", "test-results", "observer-real-files");

function python(): string {
  if (process.env.EG_PYTHON) return process.env.EG_PYTHON;
  for (const candidate of [join(REPO, "backend/.venv/Scripts/python.exe"), join(REPO, "backend/.venv/bin/python")]) {
    if (existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "python" : "python3";
}

/** Run a server_state.py command and parse its JSON line. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function server<T = any>(command: string, ...args: string[]): T {
  const text = execFileSync(python(), [join(HERE, "server_state.py"), command, ...args], { encoding: "utf8", timeout: 120_000 });
  const line = text.trim().split("\n").pop() ?? "{}";
  return JSON.parse(line) as T;
}

export type StoredMedia = { id: string; size_bytes: number; stored: boolean; format: string; exif_tags: number; gps: boolean; has_exif_marker: boolean; info_keys: string[] };
export type StoredReport = {
  id: string;
  receipt_code: string;
  status: string;
  media: StoredMedia[];
  uploads: Array<{ id: string; status: string; received_bytes: number; size_bytes: number; client_attachment_id: string }>;
  idempotency: Array<{ operation: string; key: string }>;
};
export function storedReports(code: string): StoredReport[] {
  return server<{ reports: StoredReport[] }>("reports", code).reports;
}

/** A camera-like JPEG with GPS in its EXIF (made once per run). */
export function photo(name: string, width: number, height: number, grain: number): string {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, name);
  if (!existsSync(path)) server("photo", path, String(width), String(height), String(grain));
  return path;
}

/** English, privacy notice already read: a phone that has opened the app before. */
export async function knownPhone(context: BrowserContext) {
  await context.addInitScript(() => {
    if (window.localStorage.getItem("eg.test.ready")) return;
    window.localStorage.setItem("eg.test.ready", "1");
    window.localStorage.setItem("eg.locale", "en");
    window.localStorage.setItem("eg.noticeSeen", "2026-11-22");
    window.localStorage.setItem("eg.splashSeen", "1");
  });
}

export type Observer = { code: string; setupPin: string; pin: string };

/** Issue a code on the server and sign in with it on this page: setup PIN, then a personal PIN. */
export async function signInNewObserver(page: Page): Promise<Observer> {
  const { code, pin: setupPin } = server<{ code: string; pin: string }>("issue");
  const pin = personalPin(setupPin);
  await page.goto("/o/start?view=sign-in");
  await page.getByTestId("o03-code").fill(code);
  await page.getByTestId("o03-pin").fill(setupPin);
  await page.getByTestId("o03-submit").click();
  await expect(page.getByTestId("o03-set-pin")).toBeVisible();
  await page.getByTestId("o03-newpin").fill(pin);
  await page.getByTestId("o03-confirmpin").fill(pin);
  await page.getByTestId("o03-setpin-submit").click();
  await page.waitForURL(/\/o$/);
  await expect(page.getByTestId("o04")).toBeVisible();
  return { code, setupPin, pin };
}

/** A 6-digit PIN that is not easy to guess and not the setup PIN's first six digits. */
function personalPin(setupPin: string): string {
  for (const candidate of ["482913", "730582", "615047"]) if (!setupPin.startsWith(candidate)) return candidate;
  return "947261";
}

export async function stepIs(page: Page, step: string) {
  await page.waitForURL((url) => url.pathname === `/o/new/${step}`);
  await expect(page.locator("h1")).toBeFocused();
}

export type ReportInput = { description?: string; photoPath?: string };

/**
 * Walk O-05 → O-11 with the real reference list (drill down through the first
 * state, LGA, ward and unit). Stops on Check and send.
 */
export async function fillReport(page: Page, input: ReportInput = {}) {
  await page.goto("/o/new/what");
  await expect(page.getByTestId("o05")).toBeVisible();
  await page.locator('input[name="category"][value="intimidation_violence"]').check({ force: true });
  await page.getByTestId("continue").click();
  await stepIs(page, "danger");
  await page.getByTestId("o06-answer-no").click();
  await stepIs(page, "where");
  await choosePlace(page);
  await page.getByTestId("continue").click();
  await stepIs(page, "when");
  await page.getByTestId("continue").click();
  await stepIs(page, "describe");
  await page.locator("textarea").fill(input.description ?? "Young men at the gate told people in the queue to go home before voting started.");
  await page.getByTestId("o09-source").getByRole("radio").first().check({ force: true });
  await page.getByTestId("continue").click();
  await stepIs(page, "evidence");
  if (input.photoPath) {
    await page.getByTestId("media-capture-photo-input").setInputFiles(input.photoPath);
    await expect(page.getByTestId("o10-item").filter({ hasText: "Location removed" })).toBeVisible({ timeout: 30_000 });
  }
  await page.getByTestId("continue").click();
  await stepIs(page, "check");
}

/** First state → first LGA → first ward → first unit from the server's reference list. */
export async function choosePlace(page: Page) {
  const state = page.getByTestId("polling-unit-picker-state");
  await expect(state).toBeEnabled();
  const stateValue = await state.locator("option").nth(1).getAttribute("value");
  await state.selectOption(stateValue!);
  for (const level of ["lga", "ward", "unit"]) {
    const select = page.getByTestId(`polling-unit-picker-${level}`);
    await expect(select).toBeEnabled({ timeout: 20_000 });
    const value = await select.locator("option").nth(1).getAttribute("value");
    await select.selectOption(value!);
  }
  await expect(page.getByTestId("o07-summary")).not.toBeEmpty();
}

/** Read the outbox mirror straight from IndexedDB. */
export async function outboxItems(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((ok, fail) => {
      const request = indexedDB.open("electraguard", 1);
      request.onsuccess = () => ok(request.result);
      request.onerror = () => fail(request.error);
    });
    const items = await new Promise<Array<Record<string, unknown>>>((ok) => {
      const request = db.transaction("outbox").objectStore("outbox").getAll();
      request.onsuccess = () => ok(request.result as Array<Record<string, unknown>>);
    });
    db.close();
    return items as Array<{ id: string; owner: string; state: string; attempts: number; wait_reason: string | null; server: { id: string; receipt_code: string } | null; media: Array<{ state: string; received_bytes: number; size_bytes: number; upload_id: string | null }> }>;
  });
}

export async function draftsOnPhone(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((ok, fail) => {
      const request = indexedDB.open("electraguard", 1);
      request.onsuccess = () => ok(request.result);
      request.onerror = () => fail(request.error);
    });
    const drafts = await new Promise<Array<Record<string, unknown>>>((ok) => {
      const request = db.transaction("drafts").objectStore("drafts").getAll();
      request.onsuccess = () => ok(request.result as Array<Record<string, unknown>>);
    });
    db.close();
    return drafts;
  });
}
