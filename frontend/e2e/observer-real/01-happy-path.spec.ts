import { expect, test } from "@playwright/test";
import { fillReport, outboxItems, photo, server, storedReports } from "./helpers";

test("first run: setup PIN, own PIN, report with a photo, receipt; one report and one clean photo on the server", async ({ page }) => {
  const { code, pin: setupPin } = server<{ code: string; pin: string }>("issue");
  const camera = photo("camera-small.jpg", 800, 600, 6);

  // O-01 language, O-02 privacy notice, O-03 choose and sign in, as a new phone sees them.
  await page.addInitScript(() => window.localStorage.setItem("eg.splashSeen", "1"));
  await page.goto("/o");
  await page.waitForURL(/\/o\/start/);
  await page.getByTestId("o01-en").click();
  await page.getByTestId("o02-continue").click();
  await page.getByTestId("o03-observer").click();
  await page.getByTestId("o03-code").fill(code.toLowerCase().replace("-", " "));
  await page.getByTestId("o03-pin").fill(setupPin);
  await page.getByTestId("o03-submit").click();
  await expect(page.getByTestId("o03-set-pin")).toBeVisible();
  await page.getByTestId("o03-newpin").fill("482913");
  await page.getByTestId("o03-confirmpin").fill("482913");
  await page.getByTestId("o03-setpin-submit").click();
  await page.waitForURL(/\/o$/);
  await expect(page.getByTestId("o04-pin-saved")).toBeVisible();

  const requests: Array<{ method: string; path: string; key: string | null }> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/")) requests.push({ method: request.method(), path: url.pathname, key: request.headers()["idempotency-key"] ?? null });
  });

  await fillReport(page, { photoPath: camera });
  await page.getByTestId("o11-send").click();
  await page.waitForURL(/\/o\/reports\/[0-9a-f-]{36}\?just-sent=1/, { timeout: 30_000 });
  const receipt = (await page.getByTestId("receipt-card-code").textContent())!.trim();
  expect(receipt).toMatch(/^EG-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  await expect(page.getByTestId("o12-upload").first()).toContainText("Saved", { timeout: 60_000 });

  // The phone: the outbox item is received, the photo is saved, the report text left the phone (R8).
  const [item] = await outboxItems(page);
  expect(item.state).toBe("received");
  expect(item.server?.receipt_code).toBe(receipt);
  expect(item.media.map((m) => m.state)).toEqual(["saved"]);

  // The server: exactly one report, one photo, no EXIF or GPS left in the stored file.
  const reports = storedReports(code);
  expect(reports).toHaveLength(1);
  expect(reports[0].receipt_code).toBe(receipt);
  expect(reports[0].media).toHaveLength(1);
  const stored = reports[0].media[0];
  expect(stored.stored).toBe(true);
  expect(stored.format).toBe("JPEG");
  expect(stored.gps).toBe(false);
  expect(stored.exif_tags).toBe(0);
  expect(stored.has_exif_marker).toBe(false);
  expect(reports[0].uploads.map((u) => u.status)).toEqual(["completed"]);

  // One REP-01, every write carried an Idempotency-Key, and the report key is the draft key.
  const creates = requests.filter((r) => r.method === "POST" && r.path === "/api/v1/reports");
  expect(creates).toHaveLength(1);
  expect(creates[0].key).toBe(item.id);
  expect(reports[0].idempotency.find((r) => r.operation === "REP-01")?.key).toBe(item.id);

  // Back from the receipt goes Home, which lists it; no draft is left.
  await page.getByTestId("back").click();
  await page.waitForURL(/\/o$/);
  await expect(page.getByTestId("o04")).toContainText(receipt);
  await expect(page.getByTestId("o04-draft")).toHaveCount(0);
});
