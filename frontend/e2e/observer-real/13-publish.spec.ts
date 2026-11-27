/**
 * 13-publish.spec.ts
 *
 * Real-backend end-to-end tests for staff publishing and administrative controls:
 * 1. Coordinator generates a snapshot preview from reviewed reports, approves and publishes it.
 *    Public /results page displays reviewed totals with < 5 cell suppression and zero private names/text.
 *    A second generated snapshot shows up in the publishing history table.
 * 2. Organization admin creates an observer code batch, revokes one code, and verifies that the
 *    revoked code cannot be used to sign in / send reports.
 *    Admin toggles organization settings to pause intake, observer sees the paused state on /o,
 *    and admin resumes intake.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  areaNumber,
  cleanCommunity,
  knownPhone,
  newCoordinator,
  newOrgAdmin,
  server,
  signInNewObserver,
  staffSignIn,
  type StaffUser,
} from "./helpers";

async function staffDesk(browser: Browser, who: StaffUser): Promise<{ context: BrowserContext; page: Page }> {
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

test("coordinator publishes snapshot with cell suppression and history; public results show reviewed counts", async ({
  browser,
}) => {
  // 1. Seed closed reviewed reports in an LGA:
  // 6 good_practice (>= 5 threshold) + 2 late_materials (< 5 threshold, cell-suppressed)
  // Total = 8 closed reports.
  const area = areaNumber(0);
  server("closed", area.lga_code, "good_practice=6", "late_materials=2");

  // 2. Coordinator signs in and opens /s/publish
  const coordinator = newCoordinator("Funke Coordinator");
  const desk = await staffDesk(browser, coordinator);
  await desk.page.goto("/s/publish");
  await expect(desk.page.getByTestId("publish-view")).toBeVisible();

  // 3. Generate snapshot
  await desk.page.getByTestId("s07-generate").click();
  await expect(desk.page.getByTestId("s07-notice")).toContainText("Preview ready");
  await expect(desk.page.getByTestId("s07-detail")).toBeVisible();
  await expect(desk.page.getByTestId("s07-detail")).toHaveAttribute("data-status", "draft");

  // 4. Approve and publish snapshot
  await desk.page.getByTestId("s07-approve").click();
  await expect(desk.page.getByTestId("s07-publish-sheet")).toBeVisible();
  await desk.page.getByTestId("s07-publish-confirm").click();
  await expect(desk.page.getByTestId("s07-publish-sheet")).toBeHidden();
  await expect(desk.page.getByTestId("s07-detail")).toHaveAttribute("data-status", "published");

  // 5. Open public /results and verify published totals, cell suppression, and privacy
  const publicContext = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 1280, height: 900 },
  });
  const publicPage = await publicContext.newPage();
  await publicPage.goto("/results");
  await expect(publicPage.getByTestId("results-summary")).toBeVisible();

  // Reviewed total is shown
  await expect(publicPage.getByTestId("results-summary")).toContainText(/reviewed reports/i);

  // Small cell count (< 5) is suppressed
  await expect(publicPage.locator("body")).toContainText("fewer than 5");

  // Zero personal names, observer codes, or confidential text visible on public results
  const publicContent = await publicPage.locator("body").innerText();
  expect(publicContent).not.toContain("Funke Coordinator");
  expect(publicContent).not.toContain("Secret observation narrative");
  expect(publicContent).not.toContain("Mallam");
  expect(publicContent).not.toMatch(/OBS-[A-Z0-9]{6}/);

  // 6. Coordinator generates a second snapshot, approves it, and verifies history table
  await desk.page.bringToFront();
  await desk.page.getByTestId("s07-generate").click();
  await expect(desk.page.getByTestId("s07-notice")).toBeVisible();
  await desk.page.getByTestId("s07-approve").click();
  await expect(desk.page.getByTestId("s07-publish-sheet")).toBeVisible();
  await desk.page.getByTestId("s07-publish-confirm").click();
  await expect(desk.page.getByTestId("s07-publish-sheet")).toBeHidden();

  // History table displays at least 2 snapshot entries
  await expect(desk.page.getByTestId("s07-history")).toBeVisible();
  const rows = desk.page.getByTestId("s07-history").locator("tbody tr");
  await expect(rows).toHaveCount(2);

  await publicContext.close();
  await desk.context.close();
});

test("admin creates code batch, revokes code, and toggles intake pause with observer noticing", async ({
  browser,
}) => {
  // 1. Organization admin signs in and opens /s/admin/codes
  const admin = newOrgAdmin("Tunde Admin");
  const desk = await staffDesk(browser, admin);
  await desk.page.goto("/s/admin/codes");
  await expect(desk.page.getByTestId("admin-codes-view")).toBeVisible();

  // 2. Create an observer code batch
  await desk.page.getByTestId("s09-create").click();
  await expect(desk.page.getByTestId("s09-create-sheet")).toBeVisible();
  await desk.page.getByTestId("s09-label").fill("E2E Batch Staff");
  await desk.page.getByTestId("s09-count").fill("2");
  await desk.page.getByTestId("s09-create-submit").click();

  // Cards panel appears with the newly created batch cards
  await expect(desk.page.getByTestId("s09-cards")).toBeVisible();
  const firstCard = desk.page.getByTestId("s09-card").first();
  const codeText = await firstCard.locator("span").filter({ hasText: /^OBS-/ }).textContent();
  const targetCode = codeText?.trim() ?? "";
  expect(targetCode).toMatch(/^OBS-[A-Z0-9]{6}$/);
  const pinText = await firstCard.locator("span[class*='cardPin']").textContent();
  const targetPin = (pinText ?? "").replace(/\s+/g, "");

  // Close cards panel
  await desk.page.getByTestId("s09-cards-done").click();
  await expect(desk.page.getByTestId("s09-cards")).toBeHidden();

  // 3. Revoke the created observer code
  await desk.page.getByTestId(`s09-more-${targetCode}`).click();
  await desk.page.getByTestId(`s09-revoke-${targetCode}`).click();
  await expect(desk.page.getByTestId("s09-revoke-sheet")).toBeVisible();
  await desk.page.getByTestId("s09-revoke-confirm").click();
  await expect(desk.page.getByTestId("s09-revoke-sheet")).toBeHidden();

  // 4. Observer attempts to sign in with the revoked code and is rejected
  const obsContext = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
  });
  await knownPhone(obsContext);
  const obsPage = await obsContext.newPage();
  await obsPage.goto("/o/start?view=sign-in");
  await obsPage.getByTestId("o03-code").fill(targetCode);
  await obsPage.getByTestId("o03-pin").fill(targetPin);
  await obsPage.getByTestId("o03-submit").click();

  // Revoked code screen is shown
  await expect(obsPage.getByText(/no longer works/i).first()).toBeVisible();

  // 5. Admin navigates to /s/admin/settings and pauses report intake
  await desk.page.goto("/s/admin/settings");
  await expect(desk.page.getByTestId("admin-settings-view")).toBeVisible();

  const intakeCard = desk.page.locator("section", { hasText: "Report intake" });
  await intakeCard.locator("button[role='switch']").click();
  await expect(desk.page.getByTestId("s11-intake-sheet")).toBeVisible();
  await desk.page.getByTestId("s11-intake-confirm").click();
  await expect(desk.page.getByTestId("s11-intake-sheet")).toBeHidden();
  await expect(desk.page.getByTestId("s11-paused-banner")).toBeVisible();

  // 6. Active observer visits /o and sees the paused intake notice
  const activeObsPage = await obsContext.newPage();
  await signInNewObserver(activeObsPage);
  await activeObsPage.goto("/o");
  await expect(activeObsPage.getByTestId("o04-intake-paused")).toBeVisible();
  await expect(activeObsPage.getByTestId("o04-intake-paused")).toContainText("paused");

  // 7. Admin resumes report intake
  await desk.page.bringToFront();
  await intakeCard.locator("button[role='switch']").click();
  await expect(desk.page.getByTestId("s11-intake-sheet")).toBeVisible();
  await desk.page.getByTestId("s11-intake-confirm").click();
  await expect(desk.page.getByTestId("s11-intake-sheet")).toBeHidden();
  await expect(desk.page.getByTestId("s11-paused-banner")).toBeHidden();

  await obsContext.close();
  await desk.context.close();
});
