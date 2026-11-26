/**
 * Ward check-ins and "your LGA today" against the real servers: a coordinator writes a check-in on the
 * staff screen, an observer in that ward answers it on the phone, and the coordinator reads the answers.
 * Coordinators, places and reviewed reports are created through server_state.py; every request the
 * screens make reaches the real API.
 */
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import {
  areaNumber,
  chooseScope,
  cleanCommunity,
  knownPhone,
  newCoordinator,
  observerAt,
  openCheckins,
  server,
  staffSignIn,
  type Coordinator,
} from "./helpers";

type StoredAnswers = { answers: Array<{ observer_code: string; answer: string; version: number; answered_at_device: string }> };

/** A coordinator at a desk: wide screen, English, signed in. */
async function deskOf(browser: Browser, who: Coordinator): Promise<{ context: BrowserContext; page: Awaited<ReturnType<BrowserContext["newPage"]>> }> {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  await knownPhone(context);
  const page = await context.newPage();
  await staffSignIn(page, who);
  return { context, page };
}

test.beforeAll(() => cleanCommunity());

test("a coordinator asks a fixed question, the observer in that ward answers Yes, and the result bar and unanswered units follow", async ({ browser, context, page }) => {
  const area = areaNumber(1);
  const ward = area.wards[0];
  const [first] = ward.units;
  await knownPhone(context);
  const coordinator = newCoordinator("Ada Okafor");
  const desk = await deskOf(browser, coordinator);

  // The coordinator: Check-ins tab, this ward, the fixed question "materials arrived".
  await openCheckins(desk.page);
  await chooseScope(desk.page, "ward", ward.ward_code);
  await desk.page.getByTestId("ci-question").selectOption("materials_arrived");
  await desk.page.getByTestId("ci-send").click();
  await expect(desk.page.getByTestId("ci-notice")).toContainText("Check-in sent.");
  const row = desk.page.locator('[data-testid^="ci-item-"]', { hasText: "Have materials arrived" }).first();
  const noticeId = ((await row.getAttribute("data-testid")) ?? "").replace("ci-item-", "");
  expect(noticeId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(desk.page.getByTestId("ci-results")).toBeVisible();

  // Nobody has answered yet.
  const wardRow = desk.page.getByTestId(`ci-ward-${ward.ward_code}`);
  await expect(desk.page.getByTestId("ci-results")).toContainText(`0 of ${ward.units.length} units answered`);

  // The observer in that ward sees it under "Needs you" on Home and in Messages.
  await observerAt(page, ward.ward_code, first[0]);
  const need = page.getByTestId(`o04-notice-${noticeId}`);
  await expect(need).toContainText("Have materials arrived");
  await page.goto("/o/messages");
  await expect(page.getByTestId(`o17-notice-${noticeId}`)).toContainText("Have materials arrived");

  // Answer Yes from Home.
  await page.goto("/o");
  const posts: Array<{ url: string; key: string | null }> = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/answer")) posts.push({ url: request.url(), key: request.headers()["idempotency-key"] ?? null });
  });
  await page.getByTestId(`o04-notice-${noticeId}`).getByTestId("o04-notice-answer").click();
  await page.waitForURL(`**/o/checkin/${noticeId}`);
  await expect(page.getByTestId("o21-question")).toContainText("Have materials arrived");
  await page.getByTestId("o21-answer-yes").check({ force: true });
  await page.getByTestId("o21-save").click();
  await expect(page.getByTestId("o21-summary")).toContainText("Yes");
  await expect(page.getByTestId("o21-summary")).toContainText("Received", { timeout: 30_000 });
  expect(posts).toHaveLength(1);
  const stored = server<StoredAnswers>("notice-answers", noticeId).answers;
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ answer: "yes", version: 1 });

  // Answered check-ins leave "Needs you".
  await page.goto("/o");
  await expect(page.getByTestId(`o04-notice-${noticeId}`)).toHaveCount(0);

  // The coordinator reads the answer: one Yes in the ward and the bar shows it.
  await desk.page.reload();
  await expect(desk.page.getByTestId("ci-results")).toBeVisible();
  await expect(wardRow).toBeVisible();
  await expect(wardRow.locator("td").nth(1)).toHaveText("1"); // Yes
  await expect(wardRow.locator("td").nth(2)).toHaveText("0"); // No
  await expect(wardRow.locator("td").nth(3)).toHaveText("0"); // Not seen
  await expect(wardRow.getByRole("img")).toHaveAttribute("aria-label", "1 yes, 0 no, 0 not seen, 0 not answered");
  await expect(wardRow.getByRole("img").locator("span[data-k=yes]")).toHaveCSS("width", /[1-9]/);
  await desk.context.close();
});

test("results list the units that have not answered, and an answer removes its unit from that list", async ({ browser, context, page }) => {
  const area = areaNumber(8);
  const ward = area.wards[0];
  const [first] = ward.units;
  await knownPhone(context);
  const desk = await deskOf(browser, newCoordinator("Efe Obi"));
  const { id: noticeId } = server<{ id: string }>("notice", "ward", ward.ward_code, "materials_arrived");
  await openCheckins(desk.page);
  await desk.page.getByTestId(`ci-item-${noticeId}`).click();
  const wardRow = desk.page.getByTestId(`ci-ward-${ward.ward_code}`);
  await expect(desk.page.getByTestId("ci-results")).toContainText(`0 of ${ward.units.length} units answered`, { timeout: 5_000 });
  await expect(wardRow).toContainText(first[1], { timeout: 5_000 });
  await observerAt(page, ward.ward_code, first[0]);
  await page.goto(`/o/checkin/${noticeId}`);
  await page.getByTestId("o21-answer-yes").check({ force: true });
  await page.getByTestId("o21-save").click();
  await expect(page.getByTestId("o21-summary")).toContainText("Received", { timeout: 30_000 });
  await desk.page.reload();
  await expect(wardRow).not.toContainText(first[1], { timeout: 5_000 });
  await expect(wardRow).toContainText(ward.units[1][1], { timeout: 5_000 });
  await desk.context.close();
});

test("a free-text check-in with a phone number, an email, a link or a polling unit code is blocked and lists every reason", async ({ browser }) => {
  const area = areaNumber(2);
  const ward = area.wards[0];
  const coordinator = newCoordinator("Bola Adeyemi");
  const desk = await deskOf(browser, coordinator);
  await openCheckins(desk.page);
  await chooseScope(desk.page, "ward", ward.ward_code);
  await desk.page.getByTestId("ci-mode").getByRole("tab", { name: "Write a message" }).click();

  // The page marks what it can read itself and keeps Send off.
  await desk.page.getByTestId("ci-text").fill(`Call 08031234567 or write ada@example.org, see https://results.example.com and ${ward.units[0][0]}-x`);
  const reasons = desk.page.getByTestId("ci-reasons");
  await expect(reasons).toBeVisible();
  for (const reason of ["phone_number", "email", "link"]) await expect(desk.page.getByTestId(`ci-reason-contains_${reason}`)).toBeVisible();
  await expect(desk.page.getByTestId("ci-send")).toBeDisabled();
  await expect(desk.page.getByTestId("ci-marked").locator("mark")).not.toHaveCount(0);

  // Names, party names and unit codes are only known to the server. It stops the send and lists all of them.
  const unit = ward.units[0][0];
  await desk.page.getByTestId("ci-text").fill(`Adeleke of APC says ${unit} has no ballot papers`);
  await expect(desk.page.getByTestId("ci-clear")).toBeVisible();
  const sends: number[] = [];
  desk.page.on("response", (response) => {
    if (response.request().method() === "POST" && new URL(response.url()).pathname === "/api/v1/notices") sends.push(response.status());
  });
  await desk.page.getByTestId("ci-send").click();
  await expect(desk.page.getByTestId("ci-compose-error")).toContainText("content check stopped");
  for (const reason of ["polling_unit_code", "political_term"]) await expect(desk.page.getByTestId(`ci-reason-contains_${reason}`)).toBeVisible();
  expect(sends).toEqual([400]);
  await expect(desk.page.getByTestId("ci-send")).toBeDisabled();

  // Editing the words takes the reasons away and the clean text can be sent.
  await desk.page.getByTestId("ci-text").fill("Please keep your voter card ready and arrive early.");
  await expect(desk.page.getByTestId("ci-reasons")).toHaveCount(0);
  await expect(desk.page.getByTestId("ci-send")).toBeEnabled();
  await desk.page.getByTestId("ci-send").click();
  await expect(desk.page.getByTestId("ci-notice")).toContainText("Check-in sent.");
  expect(sends).toEqual([400, 201]);
  await desk.context.close();
});

test("a personal name in a free-text check-in is blocked", async ({ browser }) => {
  const desk = await deskOf(browser, newCoordinator("Gbenga Ade"));
  await openCheckins(desk.page);
  await chooseScope(desk.page, "ward", areaNumber(2).wards[0].ward_code);
  await desk.page.getByTestId("ci-mode").getByRole("tab", { name: "Write a message" }).click();
  await desk.page.getByTestId("ci-text").fill("Ask Mrs Funke Adebayo about the keys");
  await desk.page.getByTestId("ci-send").click();
  await expect(desk.page.getByTestId("ci-reason-contains_personal_name")).toBeVisible({ timeout: 5_000 });
  await desk.context.close();
});

test("a safety notice cannot be approved by its writer; a second coordinator approves it and only then do observers see it", async ({ browser, context, page }) => {
  const area = areaNumber(3);
  const ward = area.wards[0];
  const [first] = ward.units;
  await knownPhone(context);
  const writer = newCoordinator(); // no full name: the screen must still know who wrote it
  const approver = newCoordinator("Chidi Eze");
  const deskA = await deskOf(browser, writer);
  await observerAt(page, ward.ward_code, first[0]);

  await openCheckins(deskA.page);
  await chooseScope(deskA.page, "ward", ward.ward_code);
  await deskA.page.getByTestId("ci-type").getByRole("tab", { name: "Safety" }).click();
  await deskA.page.getByTestId("ci-question").selectOption("unit_calm");
  await deskA.page.getByTestId("ci-send").click();
  await expect(deskA.page.getByTestId("ci-notice")).toContainText("waits for a second coordinator");
  const noticeId = ((await deskA.page.locator('[data-testid^="ci-item-"]', { hasText: "Is your polling unit calm" }).first().getAttribute("data-testid")) ?? "").replace("ci-item-", "");

  // The writer sees the approval card and cannot press Approve.
  await expect(deskA.page.getByTestId("ci-approval")).toBeVisible();
  await expect(deskA.page.getByTestId("ci-approve")).toBeDisabled();
  await expect(deskA.page.getByTestId("ci-same-person")).toContainText("another coordinator has to approve it");

  // Observers see nothing while it waits.
  await page.goto("/o");
  await expect(page.getByTestId("o04")).toBeVisible();
  await expect(page.getByTestId(`o04-notice-${noticeId}`)).toHaveCount(0);
  await page.goto("/o/messages");
  await expect(page.getByTestId(`o17-notice-${noticeId}`)).toHaveCount(0);

  // A second coordinator approves it.
  const deskB = await deskOf(browser, approver);
  await openCheckins(deskB.page);
  await deskB.page.getByTestId(`ci-item-${noticeId}`).click();
  await expect(deskB.page.getByTestId("ci-approve")).toBeEnabled();
  await deskB.page.getByTestId("ci-approve").click();
  await expect(deskB.page.getByTestId("ci-notice")).toContainText("Approved and sent to observers.");
  await expect(deskB.page.getByTestId("ci-approval")).toHaveCount(0);

  // Observers now see it, marked as safety.
  await page.goto("/o");
  const need = page.getByTestId(`o04-notice-${noticeId}`);
  await expect(need).toBeVisible();
  await expect(need).toContainText("Your coordinator asks");
  await page.goto("/o/messages");
  await expect(page.getByTestId(`o17-notice-${noticeId}`)).toContainText("Safety");
  await deskA.context.close();
  await deskB.context.close();
});

test("an answer given offline waits on the phone with the phone's time and is sent once, with one key, when the network returns", async ({ browser, context, page }) => {
  const area = areaNumber(4);
  const ward = area.wards[1];
  const [first] = ward.units;
  await knownPhone(context);
  const observer = await observerAt(page, ward.ward_code, first[0]);
  const { id: noticeId } = server<{ id: string }>("notice", "ward", ward.ward_code, "voting_started");
  void browser;

  const posts: Array<{ key: string | null; body: string | null }> = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === `/api/v1/observer/notices/${noticeId}/answer`) posts.push({ key: request.headers()["idempotency-key"] ?? null, body: request.postData() });
  });

  // Open the check-in while online, then lose the network.
  await page.goto("/o");
  await page.getByTestId(`o04-notice-${noticeId}`).getByTestId("o04-notice-answer").click();
  await page.waitForURL(`**/o/checkin/${noticeId}`);
  await expect(page.getByTestId("o21-question")).toContainText("Has voting started");
  await context.setOffline(true);
  await expect(page.getByTestId("o21-offline")).toBeVisible();
  await page.getByTestId("o21-answer-no").check({ force: true });
  await page.getByTestId("o21-save").click();

  // Saved on the phone, with the phone's time, and nothing has reached the server.
  await expect(page.getByTestId("o21-saved")).toContainText("Saved on this phone");
  await expect(page.getByTestId("o21-summary")).toContainText("No");
  await expect(page.getByTestId("o21-summary")).toContainText("this phone's time");
  await expect(page.getByTestId("o21-badge")).toBeVisible();
  const queued = await page.evaluate(() => JSON.parse(window.localStorage.getItem("eg.noticeAnswers.v1") ?? "[]") as Array<{ notice_id: string; answer: string; answered_at: string; key: string; state: string }>);
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({ notice_id: noticeId, answer: "no", state: "queued" });
  expect(Date.parse(queued[0].answered_at)).toBeLessThanOrEqual(Date.now());
  expect(posts).toHaveLength(0);
  expect(server<StoredAnswers>("notice-answers", noticeId).answers).toHaveLength(0);

  // Network back: one POST with the saved key and the saved time, then it shows as received.
  await context.setOffline(false);
  await expect(page.getByTestId("o21-summary")).toContainText("Received", { timeout: 60_000 });
  await page.waitForTimeout(2_000);
  expect(posts).toHaveLength(1);
  expect(posts[0].key).toBe(queued[0].key);
  expect(JSON.parse(posts[0].body ?? "{}")).toEqual({ answer: "no", answered_at: queued[0].answered_at });
  const stored = server<StoredAnswers>("notice-answers", noticeId).answers;
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ observer_code: observer.code, answer: "no", version: 1 });
  expect(Date.parse(stored[0].answered_at_device)).toBe(Date.parse(queued[0].answered_at));
  await expect(page.getByTestId("o21-badge")).toHaveCount(0);
});

test("an answer that reaches the server after the check-in closed shows as Not counted", async ({ context, page }) => {
  const area = areaNumber(5);
  const ward = area.wards[2];
  await knownPhone(context);
  await observerAt(page, ward.ward_code, ward.units[0][0]);
  const { id: noticeId } = server<{ id: string }>("notice", "ward", ward.ward_code, "officials_present");

  await page.goto(`/o/checkin/${noticeId}`);
  await expect(page.getByTestId("o21-question")).toContainText("Are election officials present");
  await context.setOffline(true);
  await page.getByTestId("o21-answer-yes").check({ force: true });
  await page.getByTestId("o21-save").click();
  await expect(page.getByTestId("o21-saved")).toBeVisible();
  // The coordinator withdraws it while the phone is offline.
  server("withdraw", noticeId);
  await context.setOffline(false);
  await expect(page.getByTestId("o21-expired")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("o21-summary")).toContainText("Not counted");
  expect(server<StoredAnswers>("notice-answers", noticeId).answers).toHaveLength(0);
});

test("Your LGA today shows real counts and says \"fewer than 5\" for anything smaller, never a zero or a small number", async ({ context, page }) => {
  const area = areaNumber(6);
  const ward = area.wards[0];
  await knownPhone(context);
  // 6 reviewed reports of one kind, three smaller groups that together reach 5, and 2 reports under an hour old that must not count.
  server("closed", area.lga_code, "late_materials=6", "equipment_failure=3", "intimidation_violence=2", "recent:late_materials=2");
  await observerAt(page, ward.ward_code, ward.units[0][0]);

  const card = page.getByTestId("o04-lga-today");
  await expect(card).toBeVisible();
  await expect(card).toContainText(`${area.lga_name} today`);
  const rows = card.locator("li");
  const total = await rows.count();
  expect(total).toBeGreaterThanOrEqual(6);
  const counts = await rows.locator("span").evaluateAll((spans) => spans.filter((_, index) => index % 2 === 1).map((span) => span.textContent?.trim() ?? ""));
  expect(counts.filter((text) => text === "6")).toHaveLength(1);
  expect(counts.filter((text) => text === "fewer than 5")).toHaveLength(total - 1);
  for (const text of counts) expect(text === "6" || text === "fewer than 5").toBe(true);
  await expect(card).not.toContainText(/\b[0-4]\b/);
  await expect(card).toContainText("Updated");
});

test("coordinators' ask-again sends the same question once more with a new key", async ({ browser, context, page }) => {
  const area = areaNumber(7);
  const ward = area.wards[0];
  await knownPhone(context);
  const desk = await deskOf(browser, newCoordinator("Dayo Bello"));
  await observerAt(page, ward.ward_code, ward.units[0][0]);
  const { id: noticeId } = server<{ id: string }>("notice", "ward", ward.ward_code, "results_posted");

  await openCheckins(desk.page);
  await desk.page.getByTestId(`ci-item-${noticeId}`).click();
  await desk.page.getByTestId("ci-again").click();
  await expect(desk.page.getByTestId("ci-notice")).toContainText("Asked again");
  await expect(desk.page.locator('[data-testid^="ci-item-"]', { hasText: "Have results been posted" })).toHaveCount(2);
  await page.goto("/o");
  await expect(page.locator('[data-testid^="o04-notice-"]:not([data-testid="o04-notice-answer"])')).toHaveCount(2);
  await desk.context.close();
});
