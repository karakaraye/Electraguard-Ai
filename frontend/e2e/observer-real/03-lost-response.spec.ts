import { expect, test } from "@playwright/test";
import { fillReport, knownPhone, outboxItems, signInNewObserver, storedReports } from "./helpers";

test("the server commits but the response is lost: Not confirmed, then the same key returns the same receipt", async ({ context, page }) => {
  await knownPhone(context);
  const observer = await signInNewObserver(page);

  const attempts: Array<{ key: string; status: number | "dropped"; replayed: string | null }> = [];
  await page.route("**/api/v1/reports", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const key = request.headers()["idempotency-key"];
    // The request reaches the real server and is committed there...
    const response = await route.fetch();
    if (attempts.length === 0) {
      attempts.push({ key, status: "dropped", replayed: null });
      // ...but the phone never hears back (connection reset after the server answered).
      return route.abort("connectionreset");
    }
    attempts.push({ key, status: response.status(), replayed: response.headers()["idempotent-replayed"] ?? null });
    return route.fulfill({ response });
  });

  await fillReport(page);
  await page.getByTestId("o11-send").click();
  await expect(page.getByTestId("o11-status-notConfirmed")).toBeVisible({ timeout: 20_000 });
  // Never "Received" before the server confirmed it to the phone.
  expect((await page.getByTestId("o11").textContent()) ?? "").not.toMatch(/\bReceived\b/);
  expect(storedReports(observer.code)).toHaveLength(1);

  // The outbox retries by itself (2 s back-off) with the same key: the server replays the original receipt.
  await page.waitForURL(/\/o\/reports\/[0-9a-f-]{36}\?just-sent=1/, { timeout: 30_000 });
  const receipt = (await page.getByTestId("receipt-card-code").textContent())!.trim();

  expect(attempts).toHaveLength(2);
  expect(attempts[1].key).toBe(attempts[0].key);
  expect(attempts[1].status).toBe(200);
  expect(attempts[1].replayed).toBe("true");
  const reports = storedReports(observer.code);
  expect(reports).toHaveLength(1);
  expect(reports[0].receipt_code).toBe(receipt);
  const [item] = await outboxItems(page);
  expect(item.id).toBe(attempts[0].key);
  expect(item.server?.receipt_code).toBe(receipt);
});
