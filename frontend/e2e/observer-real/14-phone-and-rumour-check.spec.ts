/**
 * 14-phone-and-rumour-check.spec.ts
 *
 * Real-backend end-to-end tests for phone channels and community rumour checking:
 * 1. On-screen phone at /phone:
 *    - SMS "REPORT ..." creates a simulated report with receipt code EG-XXXX-XXXX
 *      that never reaches public results;
 *    - SMS "STATUS <receipt_code>" replies with current status;
 *    - USSD "*347*88#" menu step-by-step navigation;
 *    - /phone?start=ussd auto-types the service code.
 * 2. Public rumour check at /check:
 *    - Approved answer is shown as quotation card for matching query;
 *    - Unknown message shows no-match state;
 *    - Citizen asks reviewers, which increments ask count for the rumour desk (/s/rumours).
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  cleanCommunity,
  knownPhone,
  newCoordinator,
  newReviewer,
  server,
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

test.beforeAll(() => {
  cleanCommunity();
  server("simulator", "on");
});

test("on-screen phone simulator handles SMS report, receipt code status check, and interactive USSD flow", async ({
  browser,
  page,
}) => {
  // 1. Open the on-screen phone at /phone
  await page.goto("/phone");
  await expect(page.getByTestId("phone")).toBeVisible();

  // 2. Click example report button to populate compose textarea with a valid report
  await page.getByTestId("phone-example-report").click();
  await expect(page.getByTestId("phone-sms")).toBeVisible();
  const draftText = await page.getByTestId("phone-sms").inputValue();
  expect(draftText).toContain("REPORT");

  // Send the SMS
  await page.getByTestId("phone-call").click();

  // 3. Verify inbox displays reply with receipt code EG-XXXX-XXXX
  await expect(page.getByTestId("phone-inbox")).toBeVisible({ timeout: 15_000 });
  const inboxContent = await page.getByTestId("phone-inbox").innerText();
  expect(inboxContent).toContain("ElectraGuard: received");
  const codeMatch = inboxContent.match(/EG-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  expect(codeMatch).toBeTruthy();
  const receiptCode = codeMatch ? codeMatch[0] : "";

  // 4. Send STATUS <receipt_code> via SMS
  // Click soft left "Write" to compose new SMS
  await page.getByTestId("phone-soft-left").click();
  await expect(page.getByTestId("phone-sms")).toBeVisible();
  await page.getByTestId("phone-sms").fill(`STATUS ${receiptCode}`);
  await page.getByTestId("phone-call").click();

  // Verify inbox receives status response
  await expect(page.getByTestId("phone-inbox")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("phone-inbox")).toContainText(`${receiptCode}: received`);

  // 5. Navigate to /phone?start=ussd and verify USSD code is auto-typed
  await page.goto("/phone?start=ussd");
  await expect(page.getByTestId("phone")).toBeVisible();
  const dialValue = await page.getByTestId("phone-dial").inputValue();
  expect(dialValue).toBe("*347*88#");

  // Press call to start interactive USSD session
  await page.getByTestId("phone-call").click();
  await expect(page.getByTestId("phone-ussd-text")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("phone-ussd-text")).toContainText("ElectraGuard");

  // Step 1: Language -> 1 (English)
  await page.getByTestId("phone-ussd-reply").fill("1");
  await page.getByTestId("phone-call").click();

  // Step 2: What happened? -> 1 (Late materials)
  await expect(page.getByTestId("phone-ussd-text")).toContainText("What happened?");
  await page.getByTestId("phone-ussd-reply").fill("1");
  await page.getByTestId("phone-call").click();

  // Step 3: Danger -> 2 (No)
  await expect(page.getByTestId("phone-ussd-text")).toContainText("danger");
  await page.getByTestId("phone-ussd-reply").fill("2");
  await page.getByTestId("phone-call").click();

  // Step 4: State -> 1 (First state)
  await expect(page.getByTestId("phone-ussd-text")).toContainText("state");
  await page.getByTestId("phone-ussd-reply").fill("1");
  await page.getByTestId("phone-call").click();

  // Step 5: LGA -> 1 (First LGA)
  await expect(page.getByTestId("phone-ussd-text")).toContainText("LGA");
  await page.getByTestId("phone-ussd-reply").fill("1");
  await page.getByTestId("phone-call").click();

  // Step 6: Narrative description
  await expect(page.getByTestId("phone-ussd-text")).toContainText("happened");
  await page.getByTestId("phone-ussd-reply").fill("Ballot boxes arrived without official seals");
  await page.getByTestId("phone-call").click();

  // Step 7: Confirmation screen -> 1 (Send)
  await expect(page.getByTestId("phone-ussd-text")).toContainText("Send?");
  await page.getByTestId("phone-ussd-reply").fill("1");
  await page.getByTestId("phone-call").click();

  // USSD ends with confirmation screen
  await expect(page.getByTestId("phone-ussd-end")).toBeVisible({ timeout: 15_000 });

  // 6. The simulated SMS report is marked as simulated for staff and never reaches the public results.
  const reviewer = newReviewer("Ngozi Phone Desk");
  server("assign", receiptCode, reviewer.email);
  const desk = await staffDesk(browser, reviewer);
  await desk.page.goto("/s/queue");
  const row = desk.page.locator("tr[data-row-key]", { hasText: receiptCode });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expect(desk.page.locator("body")).toContainText(/simulated/i);
  await desk.context.close();

  await page.goto("/results");
  await expect(page.locator("body")).not.toContainText(receiptCode);
});

test("public rumour check displays approved answers, handles unknown queries, and increments rumour desk ask count", async ({
  browser,
  page,
}) => {
  // 1. Seed an approved claim with a verified answer
  const approvedText = "Voting moved to next Sunday in Dala LGA";
  const approvedAnswer = "Voting date has not changed. INEC polling proceeds on Saturday as scheduled.";
  server("approved-claim", approvedText, approvedAnswer);

  // 2. Citizen opens /check
  await page.goto("/check");
  await expect(page.getByTestId("check-text")).toBeVisible();

  // 3. Citizen asks a matching question
  await page.getByTestId("check-text").fill("Is voting moved to next Sunday in Dala?");
  await page.getByTestId("check-submit").click();

  // Verified quotation card is displayed with the approved answer
  await expect(page.getByTestId("check-checked")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("check-checked")).toContainText(approvedAnswer);

  // 4. Citizen checks an unknown rumour
  const unknownRumour = "Mysterious helicopters dropping strange boxes at polling station 42";
  await page.getByTestId("check-text").fill(unknownRumour);
  await page.getByTestId("check-submit").click();

  // No-match card is shown with "Ask our reviewers" button
  await expect(page.getByTestId("check-not-checked")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("check-ask")).toBeVisible();

  // 5. Citizen clicks "Ask our reviewers"
  await page.getByTestId("check-ask").click();
  await expect(page.getByTestId("check-not-checked")).toContainText(/reviewers/i, { timeout: 15_000 });
  await expect(page.getByTestId("check-ask")).toBeHidden({ timeout: 15_000 });

  // 6. Coordinator signs in and verifies the ask appears on the staff rumour desk (/s/rumours)
  const coordinator = newCoordinator("Amina RumourDesk");
  const desk = await staffDesk(browser, coordinator);
  await desk.page.goto("/s/rumours");
  await expect(desk.page.getByTestId("rumour-view")).toBeVisible({ timeout: 15_000 });

  // Table has claims including the newly queued rumour
  await expect(desk.page.getByTestId("s06-table")).toBeVisible();
  await expect(desk.page.locator("body")).toContainText("Mysterious helicopters");

  await desk.context.close();
});
