import { expect, test } from "@playwright/test";
import { fillReport, knownPhone, outboxItems, signInNewObserver, storedReports } from "./helpers";

test("offline Send keeps it on the phone, survives a reload while offline, and sends once when back online", async ({ context, page }) => {
  await knownPhone(context);
  const observer = await signInNewObserver(page);
  // The service worker takes control on the first load; reload once so this page is controlled by it.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 30_000 });

  const creates: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/reports") creates.push(request.headers()["idempotency-key"]);
  });

  await fillReport(page);
  await context.setOffline(true);
  await page.getByTestId("o11-send").click();
  await expect(page.getByTestId("o11-status-savedOffline")).toBeVisible();
  const o11 = (await page.getByTestId("o11").textContent()) ?? "";
  expect(o11).not.toMatch(/\bReceived\b/);
  await page.waitForURL(/\/o$/, { timeout: 15_000 });
  await expect(page.getByTestId("o04-unsent")).toBeVisible();
  await expect(page.getByTestId("network-bar")).toContainText("Offline");

  // App reloaded with no network: the shell comes from the service worker, the item from IndexedDB.
  await page.reload();
  await expect(page.getByTestId("o04")).toBeVisible();
  await expect(page.getByTestId("o04-unsent")).toBeVisible();
  const [queued] = await outboxItems(page);
  expect(queued.state).toBe("queued");
  expect(creates).toHaveLength(0);
  expect(storedReports(observer.code)).toHaveLength(0);

  // Network back: sent automatically, exactly once.
  await context.setOffline(false);
  await expect(page.getByTestId("o04-unsent")).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(async () => (await outboxItems(page))[0]?.state, { timeout: 30_000 }).toBe("received");
  await page.waitForTimeout(3_000);
  expect(creates).toEqual([queued.id]);
  const reports = storedReports(observer.code);
  expect(reports).toHaveLength(1);
  const [item] = await outboxItems(page);
  expect(item.server?.receipt_code).toBe(reports[0].receipt_code);
  await expect(page.getByTestId("o04")).toContainText(reports[0].receipt_code);
});
