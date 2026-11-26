import { expect, test, type Page } from "@playwright/test";
import { choosePlace, fillReport, knownPhone, signInNewObserver, stepIs, storedReports } from "./helpers";

type Reply = { status: number; body: { error?: { code: string; fields?: Record<string, { code: string }> } } & Record<string, unknown> };

/** A raw call with this phone's session and CSRF token: what a buggy or hostile client could send. */
async function call(page: Page, method: string, path: string, body: unknown, raw = false): Promise<Reply> {
  return page.evaluate(
    async ({ method, path, body, raw }) => {
      const csrf = (await (await fetch("/api/v1/auth/csrf", { credentials: "same-origin" })).json()).csrf_token as string;
      const response = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrf, "Idempotency-Key": crypto.randomUUID(), "X-Device-Time": new Date().toISOString() },
        body: raw ? (body as string) : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    },
    { method, path, body, raw },
  );
}

function watTomorrow(): string {
  const wat = new Date(Date.now() + 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
  return wat.toISOString().slice(0, 10);
}

test("the phone blocks a future time and missing answers before anything is sent", async ({ context, page }) => {
  await knownPhone(context);
  await signInNewObserver(page);

  // O-05: Continue without a category.
  await page.goto("/o/new/what");
  await page.getByTestId("continue").click();
  await stepIs(page, "what").catch(() => undefined);
  await expect(page.getByTestId("o05")).toContainText(/choose/i);
  expect(new URL(page.url()).pathname).toBe("/o/new/what");
  await page.locator('input[name="category"][value="queues_crowding"]').check({ force: true });
  await page.getByTestId("continue").click();
  await stepIs(page, "danger");
  await page.getByTestId("o06-answer-no").click();
  await stepIs(page, "where");

  // O-07: Continue with no place.
  await page.getByTestId("continue").click();
  expect(new URL(page.url()).pathname).toBe("/o/new/where");
  await expect(page.getByTestId("polling-unit-picker").locator('[role="alert"], [aria-invalid="true"]').first()).toBeVisible();
  await choosePlace(page);
  await page.getByTestId("continue").click();
  await stepIs(page, "when");

  // O-08: tomorrow is refused on the phone.
  await page.getByTestId("o08-when-day").click();
  await page.getByTestId("o08-when-date").fill(watTomorrow());
  await page.getByTestId("o08-when-time").fill("10:00");
  await page.getByTestId("continue").click();
  expect(new URL(page.url()).pathname).toBe("/o/new/when");
  await expect(page.getByTestId("o08-when").locator('[aria-invalid="true"]').first()).toBeVisible();
  await page.getByTestId("o08-when-now").click();
  await page.getByTestId("continue").click();
  await stepIs(page, "describe");

  // O-09: empty text and no source are both marked; more than 2000 characters is refused.
  await page.getByTestId("continue").click();
  expect(new URL(page.url()).pathname).toBe("/o/new/describe");
  await expect(page.getByTestId("o09-text")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("o09-source")).toHaveAttribute("aria-invalid", "true").catch(async () => {
    await expect(page.getByTestId("o09-source").locator('[aria-invalid="true"], [role="alert"]').first()).toBeAttached();
  });
  await page.locator("textarea").fill("x".repeat(2001));
  await page.getByTestId("o09-source").getByRole("radio").first().check({ force: true });
  await page.getByTestId("continue").click();
  expect(new URL(page.url()).pathname).toBe("/o/new/describe");
  // The message sits under the field and is its accessible description.
  await expect(page.getByTestId("o09-text")).toHaveAccessibleDescription(/2000/);
});

test("the server refuses bad reports and media with the contract's error codes, storing nothing", async ({ context, page }) => {
  await knownPhone(context);
  const observer = await signInNewObserver(page);
  const areas = await page.evaluate(async () => {
    const index = await (await fetch("/api/v1/reference/areas")).json();
    const state = await (await fetch(`/api/v1/reference/areas/${index.states[0].state_code}`)).json();
    const ward = state.lgas[0].wards[0];
    return { unit: ward.units[0][0] as string, ward: ward.ward_code as string };
  });
  const good = {
    kind: "incident",
    language: "en",
    occurred_at: new Date(Date.now() - 60_000).toISOString(),
    place: { polling_unit_code: areas.unit, ward_code: areas.ward },
    category_observer: "queues_crowding",
    danger_now: false,
    firsthand: true,
    description: "The queue is long and there is no shade.",
  };

  const future = await call(page, "POST", "/api/v1/reports", { ...good, occurred_at: new Date(Date.now() + 2 * 3600_000).toISOString() });
  expect(future.status).toBe(422);
  expect(future.body.error?.code).toBe("validation_failed");
  expect(future.body.error?.fields?.occurred_at?.code).toBe("in_future");

  const { description: _omit, firsthand: _also, ...partial } = good;
  void _omit;
  void _also;
  const missing = await call(page, "POST", "/api/v1/reports", partial);
  expect(missing.status).toBe(422);
  expect(missing.body.error?.fields?.description?.code).toBe("required");
  expect(missing.body.error?.fields?.firsthand?.code).toBe("required");

  const long = await call(page, "POST", "/api/v1/reports", { ...good, description: "y".repeat(2001) });
  expect(long.status).toBe(422);
  expect(long.body.error?.fields?.description?.code).toBe("max_length");

  const huge = await call(page, "POST", "/api/v1/reports", JSON.stringify({ ...good, description: "z".repeat(70_000) }), true);
  expect(huge.status).toBe(413);
  expect(huge.body.error?.code).toBe("payload_too_large");

  const unknown = await call(page, "POST", "/api/v1/reports", { ...good, place: { polling_unit_code: "NOT-A-UNIT", ward_code: areas.ward } });
  expect(unknown.status).toBe(422);
  expect(unknown.body.error?.fields?.["place.polling_unit_code"]?.code).toBe("unknown_area");
  expect(storedReports(observer.code)).toHaveLength(0);

  // A valid report, then media that breaks the limits.
  const created = await call(page, "POST", "/api/v1/reports", good);
  expect(created.status).toBe(201);
  const reportId = created.body.id as string;
  const start = { kind: "photo", purpose: "evidence", content_type: "image/jpeg", size_bytes: 1000, sha256: "a".repeat(64), client_media_id: "m-1" };
  const tooBig = await call(page, "POST", `/api/v1/reports/${reportId}/uploads`, { ...start, size_bytes: 2 * 1024 * 1024 + 1 });
  expect(tooBig.status).toBe(413);
  expect(tooBig.body.error?.code).toBe("payload_too_large");
  const wrongType = await call(page, "POST", `/api/v1/reports/${reportId}/uploads`, { ...start, content_type: "image/gif", client_media_id: "m-2" });
  expect(wrongType.status).toBe(415);
  expect(wrongType.body.error?.code).toBe("unsupported_media_type");
  const video = await call(page, "POST", `/api/v1/reports/${reportId}/uploads`, { ...start, kind: "video", content_type: "video/mp4", duration_ms: 61_000, client_media_id: "m-3" });
  expect(video.status).toBe(422);
  expect(video.body.error?.code).toBe("validation_failed");

  const stored = storedReports(observer.code);
  expect(stored).toHaveLength(1);
  expect(stored[0].media).toHaveLength(0);
  expect(stored[0].uploads).toHaveLength(0);
});

test("the phone refuses a file that is not a photo, video or voice note", async ({ context, page }) => {
  await knownPhone(context);
  await signInNewObserver(page);
  await fillReport(page);
  await page.getByTestId("back").click();
  await stepIs(page, "evidence");
  await page.getByTestId("media-capture-file-input").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%fake\n") });
  await expect(page.getByTestId("o10")).toContainText(/photo|video|voice/i);
  await expect(page.getByTestId("o10-item")).toHaveCount(0);
});
