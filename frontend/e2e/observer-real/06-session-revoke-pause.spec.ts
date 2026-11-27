import { expect, test } from "@playwright/test";
import { fillReport, knownPhone, outboxItems, server, signInNewObserver, storedReports } from "./helpers";

test("session expired: the report waits, the PIN sheet signs in again, then it sends once with the same key", async ({ context, page }) => {
  await knownPhone(context);
  const observer = await signInNewObserver(page);
  const keys: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/reports") keys.push(request.headers()["idempotency-key"]);
  });

  await fillReport(page);
  server("expire", observer.code);
  await page.getByTestId("o11-send").click();

  // 401: queue kept, outbox paused, the PIN sheet asks once. "Not now" leaves it on the phone.
  await expect(page.getByTestId("pin-sheet")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("pin-sheet-later").click();
  // The app takes itself home about two seconds later; a goto at that moment is aborted by its navigation.
  await page.waitForURL((url) => url.pathname === "/o", { timeout: 8_000 }).catch(() => undefined);
  await page.goto("/o");
  await expect(page.getByTestId("o04-unsent")).toBeVisible();
  let [item] = await outboxItems(page);
  expect(["queued", "unconfirmed", "sending"]).toContain(item.state);
  expect(storedReports(observer.code)).toHaveLength(0);

  // Opening the app tries to send again, gets 401 again and asks again; "Not now" once more leaves it queued.
  await expect(page.getByTestId("pin-sheet")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("pin-sheet-later").click();
  await expect(page.getByTestId("pin-sheet")).toBeHidden();

  // "Send now" opens the sheet again; the PIN signs in and the outbox resumes with the same key.
  await page.getByTestId("o04-send-now").click();
  await expect(page.getByTestId("pin-sheet")).toBeVisible();
  await page.getByTestId("pin-sheet-pin").fill(observer.pin);
  await page.getByTestId("pin-sheet-submit").click();
  await expect(page.getByTestId("pin-sheet")).toBeHidden();
  await expect.poll(async () => (await outboxItems(page))[0]?.state, { timeout: 60_000 }).toBe("received");
  [item] = await outboxItems(page);
  expect(new Set(keys)).toEqual(new Set([item.id]));
  const reports = storedReports(observer.code);
  expect(reports).toHaveLength(1);
  expect(reports[0].receipt_code).toBe(item.server?.receipt_code);
});

test("code revoked: queued report waits for a code, the revoked view shows, a new code sends it", async ({ context, page }) => {
  await knownPhone(context);
  const observer = await signInNewObserver(page);
  await fillReport(page);
  server("revoke", observer.code);
  await page.getByTestId("o11-send").click();

  // Revocation ends the sessions (401); the PIN is correct, so AUTH-02 reveals code_revoked (contract AUTH-02).
  await expect(page.getByTestId("pin-sheet")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("pin-sheet-pin").fill(observer.pin);
  await page.getByTestId("pin-sheet-submit").click();
  await page.waitForURL(/\/o\/start\?view=revoked/, { timeout: 30_000 });
  await expect(page.getByTestId("o03-revoked")).toBeVisible();
  await expect(page.getByTestId("o03-revoked-unsent")).toBeVisible();
  const [waiting] = await outboxItems(page);
  expect(waiting.state).toBe("waiting_code");
  expect(await page.evaluate(() => window.localStorage.getItem("eg.observer"))).toBeNull();
  expect(storedReports(observer.code)).toHaveLength(0);

  // A new code signs in on this phone; the waiting report is sent under it with the same key (Q3 decision).
  await page.getByTestId("o03-revoked-signin").click();
  const replacement = await signInNewObserver(page);
  await expect.poll(async () => (await outboxItems(page))[0]?.state, { timeout: 60_000 }).toBe("received");
  const [sent] = await outboxItems(page);
  expect(sent.id).toBe(waiting.id);
  expect(sent.owner).toBe(replacement.code);
  expect(storedReports(replacement.code)).toHaveLength(1);
  expect(storedReports(observer.code)).toHaveLength(0);
});

test("intake paused: the report waits on the phone with the banner, and sends once intake reopens", async ({ context, page }) => {
  await knownPhone(context);
  const observer = await signInNewObserver(page);
  server("pause", "on");
  try {
    await fillReport(page);
    await page.getByTestId("o11-send").click();
    await expect(page.getByTestId("o11-status-intakePaused")).toBeVisible({ timeout: 30_000 });
    await page.waitForURL(/\/o$/, { timeout: 15_000 });
    await expect(page.getByTestId("o04-intake-paused")).toBeVisible();
    await expect(page.getByTestId("o04-unsent")).toBeVisible();
    const [item] = await outboxItems(page);
    expect(item.state).toBe("queued");
    expect(item.wait_reason).toBe("intake_paused");
    expect(storedReports(observer.code)).toHaveLength(0);
  } finally {
    server("pause", "off");
  }
  // Intake reopens: the app re-reads AUTH-07 and the waiting report goes, without waiting out the 600 s.
  await page.reload();
  await expect.poll(async () => (await outboxItems(page))[0]?.state, { timeout: 120_000 }).toBe("received");
  await expect(page.getByTestId("o04-intake-paused")).toHaveCount(0);
  expect(storedReports(observer.code)).toHaveLength(1);
});
