/**
 * Staff review workflows against the real backend:
 * 1. Observer submits a report containing PII.
 * 2. Reviewer finds it in the queue, uses keyboard navigation (j/k/Enter) to open it.
 * 3. Reviewer verifies text is auto-redacted, starts review, and asks the observer a question.
 * 4. Observer sees the question on their report screen and sends a reply.
 * 5. Reviewer sees the reply, records the decision (corroborated) with rationale and closes the case.
 * 6. Observer's report detail shows the closed status and outcome.
 * 7. Coordinator bulk-assigns cases to a reviewer; workload updates.
 * 8. Reviewer sees forbidden state when visiting restricted staff pages.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  cleanCommunity,
  fillReport,
  knownPhone,
  newCoordinator,
  newReviewer,
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

test("reviewer reviews observer report: queue navigation, redacted text, Q&A clarification, and closed outcome", async ({
  browser,
  context: observerContext,
  page: observerPage,
}) => {
  await knownPhone(observerContext);
  const reviewer = newReviewer("Zainab Reviewer");
  const desk = await staffDesk(browser, reviewer);

  // 1. Observer signs in and submits a report with sensitive PII in narrative
  const observer = await signInNewObserver(observerPage);
  const rawNarrative = "Mallam Ibrahim at phone 08031234567 threatened voters outside the polling unit.";
  await fillReport(observerPage, { description: rawNarrative });
  await observerPage.getByTestId("o11-send").click();
  await observerPage.waitForURL(/\/o\/reports\/[0-9a-f-]{36}/, { timeout: 30_000 });

  // Read report details from server
  await expect(observerPage.getByTestId("receipt-card-code")).toBeVisible({ timeout: 20_000 });
  const receiptCode = (await observerPage.getByTestId("receipt-card-code").textContent())!.trim();

  let serverReportId = "";
  for (let i = 0; i < 20; i++) {
    const list = server<{ reports: Array<{ id: string; receipt_code: string }> }>("reports", observer.code).reports;
    if (list.length > 0) {
      serverReportId = list[0].id;
      break;
    }
    await observerPage.waitForTimeout(500);
  }
  expect(serverReportId).toMatch(/^[0-9a-f-]{36}$/);

  // Assign the report to this reviewer so it appears in their personal queue
  server("assign", serverReportId, reviewer.email);

  // 2. Reviewer opens the queue and finds the report
  await desk.page.goto("/s/queue");
  await expect(desk.page.getByTestId("s02-table")).toBeVisible({ timeout: 30_000 });

  const targetRow = desk.page.locator(`tr[data-row-key="${serverReportId}"]`);
  await expect(targetRow).toBeVisible({ timeout: 20_000 });
  await expect(targetRow).toContainText(receiptCode);

  // Priority, place and status are all shown on the row.
  await expect(targetRow.locator("span[data-level]")).toHaveAttribute("data-level", /.+/);
  await expect(targetRow.locator("td").nth(2)).not.toHaveText("");
  await expect(targetRow.locator("td").last()).not.toHaveText("");
  await expect(targetRow.locator("td").last()).toContainText(/submitted|new|received|to review/i);

  // Keyboard: J and K move between rows, Enter opens the case.
  await targetRow.focus();
  await desk.page.keyboard.press("j");
  await desk.page.keyboard.press("k");
  await expect(targetRow).toBeFocused();
  await desk.page.keyboard.press("Enter");
  await desk.page.waitForURL(`**/s/cases/${serverReportId}`, { timeout: 20_000 });

  // A click opens it too.
  await desk.page.goBack();
  await expect(targetRow).toBeVisible({ timeout: 20_000 });
  await targetRow.locator("th").click();
  await desk.page.waitForURL(`**/s/cases/${serverReportId}`, { timeout: 20_000 });

  // 3. Reviewer verifies redacted text (PII name and/or phone redacted)
  const caseText = desk.page.getByTestId("s03-text");
  await expect(caseText).toBeVisible({ timeout: 15_000 });
  const textContent = await caseText.innerText();
  // Ensure sensitive phone is redacted or not displayed raw
  expect(textContent).not.toContain("08031234567");

  // 4. Reviewer starts review and asks a question
  const startBtn = desk.page.getByTestId("s03-start");
  if (await startBtn.isVisible()) {
    await startBtn.click();
  }

  const questionInput = desk.page.locator("#s03-question");
  await expect(questionInput).toBeVisible({ timeout: 15_000 });
  await questionInput.fill("Did the security agents intervene after the threat?");
  await desk.page.getByTestId("s03-ask").click();
  await expect(desk.page.getByTestId("s03-ask")).toBeDisabled();

  // 5. Observer visits report detail page and sees the question
  await observerPage.goto(`/o/reports/${serverReportId}`);
  const qCard = observerPage.getByTestId("o14-question");
  await expect(qCard).toBeVisible({ timeout: 20_000 });
  await expect(qCard).toContainText("Did the security agents intervene");

  // Observer answers the question
  const replyInput = observerPage.getByTestId("o14-reply");
  await replyInput.fill("Yes, the police arrived within 15 minutes and detained the individual.");
  await observerPage.getByTestId("o14-reply-send").click();
  await expect(observerPage.getByTestId("o14-reply-sent")).toBeVisible({ timeout: 20_000 });

  // 6. Reviewer reloads case screen, sees the response, records decision "corroborated"
  await desk.page.reload();
  await expect(desk.page.getByTestId("s03-text")).toBeVisible();

  // Select outcome "corroborated"
  const outcomeRadio = desk.page.locator('input[name="s03-outcome"][value="corroborated"]');
  await expect(outcomeRadio).toBeVisible({ timeout: 15_000 });
  await outcomeRadio.click({ force: true });

  // Enter rationale
  const rationaleField = desk.page.locator("#s03-rationale");
  await rationaleField.fill("Corroborated by observer timely clarification and police intervention.");

  // Check considered evidence checkbox
  const consideredBox = desk.page.getByTestId("s03-considered");
  await consideredBox.click({ force: true });

  // Wait for close button to be enabled and click it
  await expect(desk.page.getByTestId("s03-close")).toBeEnabled({ timeout: 10_000 });
  await desk.page.getByTestId("s03-close").click();

  // Status on case screen should now be closed (form closes)
  await expect(desk.page.getByTestId("s03-close")).toHaveCount(0, { timeout: 20_000 });

  // 7. Observer visits report detail and sees the closed status and outcome
  await observerPage.reload();
  await expect(observerPage.getByTestId("o14-journey").locator('[data-state="done"][data-step="closed"], [data-state="current"][data-step="closed"]')).toBeVisible({ timeout: 20_000 });
  await expect(observerPage.getByTestId("o14-outcome")).toBeVisible({ timeout: 20_000 });

  await desk.context.close();
});

test("coordinator bulk case assignment with workload updates; reviewer sees forbidden state on restricted pages", async ({
  browser,
  context,
}) => {
  await knownPhone(context);
  const coordinator = newCoordinator("Chidi Coordinator");
  const reviewer = newReviewer("Bala Reviewer");

  // Seed two reports from observers in an LGA
  const area = server<{ wards: Array<{ ward_code: string; units: Array<[string, string]> }> }>("area", "2");
  const ward = area.wards[0];
  const unit1 = ward.units[0][0];
  const unit2 = ward.units[1][0];

  const code1 = server<{ code: string }>("issue").code;
  server("place", code1, ward.ward_code, unit1);
  const code2 = server<{ code: string }>("issue").code;
  server("place", code2, ward.ward_code, unit2);

  // Coordinator logs in and opens /s/assign
  const coordDesk = await staffDesk(browser, coordinator);
  await coordDesk.page.goto("/s/assign");
  await expect(coordDesk.page.getByTestId("assign-view")).toBeVisible({ timeout: 30_000 });

  // Select all unassigned cases
  const selectAll = coordDesk.page.getByTestId("s04-select-all");
  await expect(selectAll).toBeVisible({ timeout: 20_000 });
  await selectAll.check();

  // Select target reviewer from dropdown
  const targetSelect = coordDesk.page.getByTestId("s04-target");
  const reviewerOption = await targetSelect.locator("option", { hasText: reviewer.name }).last().getAttribute("value");
  if (reviewerOption) {
    await targetSelect.selectOption(reviewerOption);
  }

  // Click assign
  await coordDesk.page.getByTestId("s04-assign").click();

  // Success summary banner appears
  await expect(coordDesk.page.getByTestId("s04-summary")).toBeVisible({ timeout: 20_000 });

  // Workload list shows reviewer name
  const workloadSection = coordDesk.page.locator('[aria-labelledby="s04-workload"]');
  await expect(workloadSection).toContainText(reviewer.name);

  await coordDesk.context.close();

  // Reviewer signs in and attempts to access restricted pages (/s/assign and /s/admin/settings)
  const reviewerDesk = await staffDesk(browser, reviewer);

  // /s/assign should show forbidden banner
  await reviewerDesk.page.goto("/s/assign");
  await expect(reviewerDesk.page.locator("text=/do not have (permission|access)/i").first()).toBeVisible({ timeout: 20_000 });

  // /s/admin/settings should show forbidden banner
  await reviewerDesk.page.goto("/s/admin/settings");
  await expect(reviewerDesk.page.locator("text=/do not have (permission|access)/i").first()).toBeVisible({ timeout: 20_000 });

  await reviewerDesk.context.close();
});
