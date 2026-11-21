"use strict";

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { chromium } = require("playwright");

const root = resolve(__dirname, "..");
const envFile = resolve(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const origin = new URL(process.env.QA_FRONTEND_ORIGIN ?? "http://localhost:3149");
assert(["localhost", "127.0.0.1"].includes(origin.hostname), "Run only against the isolated local fixture.");
const roles = {
  observer: ["observer@qa.example", "QA_OBSERVER_PASSWORD", "/workspace/observer"],
  otherObserver: ["second-observer@qa.example", "QA_SECOND_OBSERVER_PASSWORD", "/workspace/observer"],
  reviewer: ["reviewer@qa.example", "QA_REVIEWER_PASSWORD", "/workspace/reviewer"],
  otherReviewer: ["second-reviewer@qa.example", "QA_SECOND_REVIEWER_PASSWORD", "/workspace/reviewer"],
  admin: ["administrator@qa.example", "QA_ADMINISTRATOR_PASSWORD", "/workspace/administrator"],
};
const evidence = resolve(root, "tests/fixtures/evidence.png");
const unchanged = "Synthetic entrance observation for automated QA.";
let step = "start Chromium";

async function open(page, path) {
  return page.goto(new URL(path, origin).href);
}

async function signIn(browser, role, width) {
  const [email, variable, workspace] = roles[role];
  const password = process.env[variable];
  assert(password, `Set ${variable} locally and seed the fixture accounts.`);
  const context = await browser.newContext({
    viewport: { width, height: 800 },
    hasTouch: true,
    isMobile: true,
    timezoneId: "Africa/Lagos",
  });
  const page = await context.newPage();
  await open(page, "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(new URL(workspace, origin).href);
  return page;
}

async function enlargeAndCheck(page, name, width) {
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.getByRole("heading", { name, exact: true }).waitFor();
  const size = await page.evaluate(() => ({
    actual: document.documentElement.clientWidth,
    flow: document.documentElement.scrollWidth,
    font: getComputedStyle(document.documentElement).fontSize,
  }));
  assert.equal(size.actual, width);
  assert.equal(size.font, "32px");
  assert.equal(size.flow, size.actual, `Horizontal overflow on ${name}`);
}

async function api(page, path) {
  return page.request.get(new URL(path, origin).href);
}

async function deny(page, path) {
  const response = await api(page, path);
  assert([401, 403, 404].includes(response.status()), "Expected access to be denied.");
  assert(!(await response.text()).includes(unchanged));
}

async function assign(admin, reference, role, reassign = false) {
  const assignment = admin.getByRole("listitem").filter({ hasText: reference });
  const email = roles[role][0];
  await assignment.getByLabel("Active Reviewer").selectOption({ label: email });
  await assignment.getByRole("button", { name: reassign ? "Reassign" : "Assign", exact: true }).focus();
  await admin.keyboard.press("Enter");
  await assignment.locator("dd").getByText(email, { exact: true }).waitFor();
}

async function run(browser, width, date, previousDate) {
  step = `sign in actor sessions at ${width}px`;
  const [observer, otherObserver, reviewer, otherReviewer, admin] =
    await Promise.all(Object.keys(roles).map((role) => signIn(browser, role, width)));
  const dashboardPath = `/api/dashboard?start=${date}&end=${date}`;
  assert.equal((await (await api(admin, dashboardPath)).json()).report_count, 0, "Use a clean fictional fixture.");

  step = `keyboard navigation and required fields at ${width}px`;
  await enlargeAndCheck(observer, "Observer Workspace", width);
  await observer.keyboard.press("Tab");
  const focused = observer.locator(":focus-visible");
  assert(await focused.isVisible());
  await observer.getByRole("button", { name: "Submit report", exact: true }).click();
  await observer.getByText("Enter the incident date and time.", { exact: true }).waitFor();
  assert.equal(await observer.locator(":focus").getAttribute("id"), "occurred-at");
  await observer.locator("#occurred-at").fill(`${date}T00:05`);
  await observer.getByLabel("Approximate location").fill("Fictional training hall");
  await observer.getByLabel("Polling-unit code (optional)").fill("QA-FICTIONAL");
  await observer.getByLabel("Short description").fill(unchanged);
  await observer.getByLabel("Private evidence (optional)").setInputFiles({
    name: "unsupported.txt", mimeType: "text/plain", buffer: Buffer.from("fictional"),
  });

  step = `interruption before commit and response loss after commit at ${width}px`;
  let reportAttempts = 0;
  let key;
  let reference;
  await observer.route("**/api/reports", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    reportAttempts += 1;
    const submittedKey = request.headers()["idempotency-key"];
    if (reportAttempts === 1) {
      key = submittedKey;
      return route.abort("failed");
    }
    assert.equal(submittedKey, key);
    const response = await route.fetch();
    const payload = await response.json();
    if (reportAttempts === 2) {
      assert.equal(response.status(), 201);
      reference = payload.reference;
      return route.abort("failed");
    }
    assert.equal(response.status(), 200);
    assert.equal(payload.reference, reference);
    return route.fulfill({ response });
  });
  await observer.getByRole("button", { name: "Submit report", exact: true }).click();
  const unconfirmed = observer.getByText(/Report save could not be confirmed/);
  await unconfirmed.waitFor();
  assert.equal((await (await api(admin, dashboardPath)).json()).report_count, 0);
  await observer.getByRole("button", { name: "Retry report", exact: true }).click();
  await unconfirmed.waitFor();
  assert.equal((await (await api(admin, dashboardPath)).json()).report_count, 1);
  assert.equal((await (await api(observer, `/api/reports/${reference}`)).json()).reference, reference);
  await observer.getByRole("button", { name: "Retry report", exact: true }).click();
  await observer.getByRole("heading", { name: "Report saved" }).waitFor();
  assert.equal(reportAttempts, 3);
  await observer.getByRole("alert").filter({ hasText: /JPEG|PNG/i }).waitFor();
  assert.equal((await (await api(admin, dashboardPath)).json()).report_count, 1);

  step = `independent attachment failure and identical retry at ${width}px`;
  const reportPath = `/api/reports/${reference}`;
  const attachmentPath = `${reportPath}/attachments`;
  await observer.evaluate((path) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (resource, options) => {
      const response = await originalFetch(resource, options);
      if (new URL(response.url).pathname === path && options?.method === "POST") {
        window.fetch = originalFetch;
        throw new TypeError("Simulated lost attachment response");
      }
      return response;
    };
  }, attachmentPath);
  const attachmentResponse = () => observer.waitForResponse((response) =>
    new URL(response.url()).pathname === attachmentPath && response.request().method() === "POST");
  await observer.getByLabel("Private evidence", { exact: true }).setInputFiles(evidence);
  const firstUpload = attachmentResponse();
  await observer.getByRole("button", { name: "Retry attachment" }).click();
  assert.equal((await firstUpload).status(), 201);
  await observer.getByText("The upload could not be confirmed.", { exact: true }).waitFor();
  const retryUpload = attachmentResponse();
  await observer.getByRole("button", { name: "Retry attachment" }).click();
  assert.equal((await retryUpload).status(), 200);
  await observer.getByText("Evidence saved.", { exact: true }).waitFor();
  const { attachments } = await (await api(observer, reportPath)).json();
  assert.equal(attachments.length, 1);
  const evidencePath = `${reportPath}/attachments/${attachments[0].id}`;
  const reviewerPath = `/api/review/${reference}`;
  await deny(otherObserver, reportPath);
  await deny(otherObserver, evidencePath);
  await deny(admin, evidencePath);
  await deny(observer, dashboardPath);
  await deny(reviewer, dashboardPath);

  step = `assignment, reassignment and immediate case removal at ${width}px`;
  await open(admin, "/workspace/administrator/assignments");
  await enlargeAndCheck(admin, "Reviewer assignments", width);
  await assign(admin, reference, "otherReviewer");
  const casePath = `/workspace/reviewer/cases/${reference}`;
  const caseResponse = await open(otherReviewer, casePath);
  assert.match(caseResponse.headers()["cache-control"] ?? "", /no-store/);
  await enlargeAndCheck(otherReviewer, "Review case", width);
  await otherReviewer.getByText(unchanged, { exact: true }).waitFor();
  const formerBack = await otherReviewer.context().newPage();
  await open(formerBack, casePath);
  await formerBack.getByRole("link", { name: "Review queue", exact: true }).click();
  await formerBack.waitForURL("**/workspace/reviewer/cases");
  await assign(admin, reference, "reviewer", true);
  await otherReviewer.getByRole("button", { name: "Start review", exact: true }).click();
  await otherReviewer.getByRole("heading", { name: "Access changed" }).waitFor();
  assert.equal(await otherReviewer.getByText(unchanged, { exact: true }).count(), 0);
  await deny(otherReviewer, reviewerPath);
  await deny(otherReviewer, evidencePath);
  step = `former reviewer Back navigation at ${width}px`;
  await formerBack.goBack();
  await formerBack.waitForURL("**/workspace/reviewer");
  assert.equal(await formerBack.getByText(unchanged, { exact: true }).count(), 0);

  step = `worker-free clarification and assessment at ${width}px`;
  await open(reviewer, "/workspace/reviewer/cases?status=submitted");
  await enlargeAndCheck(reviewer, "Review queue", width);
  await reviewer.getByRole("link", { name: "Fictional training hall", exact: true }).click();
  await enlargeAndCheck(reviewer, "Review case", width);
  await reviewer.getByRole("button", { name: "Start review", exact: true }).click();
  await reviewer.getByLabel("Question for the Observer").fill("Which entrance was affected?");
  await reviewer.getByRole("button", { name: "Request clarification", exact: true }).click();
  await reviewer.getByText("Awaiting a clarification response from the Observer.", { exact: true }).waitFor();
  await observer.getByRole("link", { name: "View report", exact: true }).click();
  await enlargeAndCheck(observer, "Incident report", width);
  await observer.getByLabel("Clarification response").fill("The east entrance was affected.");
  await observer.getByRole("button", { name: "Send clarification", exact: true }).click();
  await observer.getByRole("heading", { name: "Clarification history" }).waitFor();
  await observer.getByText("Your reply", { exact: true }).waitFor();
  await reviewer.reload();
  await enlargeAndCheck(reviewer, "Review case", width);
  await reviewer.getByLabel("Corroborated by available evidence", { exact: true }).check();
  await reviewer.getByLabel("Closing rationale").fill("The fictional photograph supports the location and the reported obstruction.");
  await reviewer.getByLabel("I confirm this assessment closes the case").check();
  await reviewer.getByRole("button", { name: "Confirm closure", exact: true }).focus();
  await reviewer.keyboard.press("Enter");
  await reviewer.getByText("Evidence recorded at closure", { exact: true }).waitFor();
  const review = await (await api(reviewer, reviewerPath)).json();
  assert.equal(review.status, "closed");
  assert.deepEqual(review.history.find(({ action }) => action === "close").change.attachment_ids, [attachments[0].id]);
  assert(!JSON.stringify(review.history).includes(roles.observer[0]));
  await observer.reload();
  await observer.getByRole("heading", { name: "Observation assessment" }).waitFor();
  await observer.getByText("Corroborated by available evidence", { exact: true }).waitFor();
  assert.equal(await observer.getByText(/the fictional photograph supports/i).count(), 0);
  await admin.reload();
  assert.equal(await admin.getByRole("listitem").filter({ hasText: reference }).count(), 0);

  step = `WAT reconciliation and report-only mode at ${width}px`;
  await open(admin, "/workspace/administrator/dashboard");
  await enlargeAndCheck(admin, "Observation dashboard", width);
  await admin.getByLabel("From", { exact: true }).fill(date);
  await admin.getByLabel("Through", { exact: true }).fill(date);
  await admin.getByRole("button", { name: "Apply date filter" }).click();
  await admin.waitForURL(`**/dashboard?start=${date}&end=${date}`);
  await enlargeAndCheck(admin, "Observation dashboard", width);
  const reportTotal = admin.locator(".dashboard-totals div").filter({ hasText: "Submitted reports" });
  assert.equal(await reportTotal.locator("dd").textContent(), "1");
  assert.equal(await admin.getByRole("row", { name: "Corroborated by available evidence 1" }).count(), 1);
  assert.equal(await admin.getByText("Distinct incident groups", { exact: true }).count(), 0);
  const empty = await api(admin, `/api/dashboard?start=${previousDate}&end=${previousDate}`);
  assert.equal((await empty.json()).report_count, 0);
  const invalid = await api(admin, "/api/dashboard?start=invalid");
  assert.equal(invalid.status(), 400);

  step = `shared-device sign-out and Back at ${width}px`;
  await observer.getByRole("button", { name: "Sign out", exact: true }).click();
  await observer.waitForURL("**/sign-in");
  await observer.goBack();
  await observer.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
  assert.equal(await observer.getByText(unchanged, { exact: true }).count(), 0);
  await deny(observer, reportPath);
  await deny(observer, evidencePath);
  for (const page of [observer, otherObserver, reviewer, otherReviewer, admin]) {
    await page.context().close();
  }
  console.log(`Core workflow passed at ${width}px, with 200% text and WAT count 1 on ${date}.`);
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
  const anchor = new Date(process.env.QA_DATE ?? "2026-04-16");
  assert(Number.isFinite(anchor.getTime()), "Set QA_DATE to an unused fictional incident date.");
  function fixtureDate(offset) {
    const date = new Date(anchor);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }
  try {
    await run(browser, 320, fixtureDate(0), fixtureDate(-1));
    await run(browser, 360, fixtureDate(2), fixtureDate(1));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  const line = /verify-core\.cjs:(\d+)/.exec(error.stack)?.[1];
  console.error(`Core verification failed during ${step} (${error.name}${line ? `, line ${line}` : ""}).`);
  process.exitCode = 1;
});
