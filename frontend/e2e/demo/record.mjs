// Records the draft demonstration video, one clip per scene part, from the real running stack.
// Usage: node e2e/demo/record.mjs [clip-name ...]     (no names = all clips)
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { BASE, PYTHON, signins, staffSignIn } from "./common.mjs";
import { beat, clip, stateFor, tap, typeSlowly } from "./recorder.mjs";

const REPO = join(import.meta.dirname, "../../..");
const query = (code) => execFileSync(PYTHON, ["manage.py", "shell", "-c", code], { cwd: join(REPO, "backend"), encoding: "utf8" }).trim().split("\n").pop();

async function choosePlace(page, wardIndex = 0) {
  const state = page.getByTestId("polling-unit-picker-state");
  if (!(await state.isVisible())) await tap(page, page.getByTestId("polling-unit-picker-by-area"));
  await state.selectOption({ label: "Kano" });
  await beat(page, 700);
  const sheet = page.getByTestId("polling-unit-picker-sheet");
  if (!(await sheet.evaluate((d) => d.open))) await tap(page, page.getByTestId("polling-unit-picker-by-area"));
  for (const level of ["lga", "ward", "unit"]) {
    const select = page.getByTestId(`polling-unit-picker-${level}`);
    await select.waitFor({ state: "visible" });
    await page.waitForFunction((el) => !el.disabled && el.options.length > 1, await select.elementHandle(), { timeout: 20000 });
    const value = await select.locator("option").nth(level === "ward" ? 1 + wardIndex : 1).getAttribute("value");
    await select.selectOption(value);
    await beat(page, 700);
  }
  await tap(page, page.getByTestId("polling-unit-picker-done"));
}

/** Seven short steps. Stops on "Check and send". */
async function reportSteps(page, { path = "/o/new/what", category, description, wardIndex = 0 }) {
  await page.goto(BASE + path);
  await page.getByTestId("o05").waitFor();
  await beat(page, 1200);
  await tap(page, page.locator(`label:has(input[name="category"][value="${category}"])`));
  await tap(page, page.getByTestId("continue"));
  await tap(page, page.getByTestId("o06-answer-no"));
  await page.waitForURL(/\/where/);
  await choosePlace(page, wardIndex);
  await beat(page, 900);
  await tap(page, page.getByTestId("continue"));
  await page.waitForURL(/\/when/);
  await beat(page, 1200);
  await tap(page, page.getByTestId("continue"));
  await page.waitForURL(/\/describe/);
  await typeSlowly(page, "textarea", description, 35);
  await tap(page, page.getByTestId("o09-source").getByRole("radio").first(), { after: 500 }).catch(() => {});
  await tap(page, page.getByTestId("continue"));
  await page.waitForURL(/\/evidence/);
  await beat(page, 1500);
  await tap(page, page.getByTestId("continue"));
  await page.waitForURL(/\/check/);
  await beat(page, 2000);
}

async function observerSignInSlow(page, number) {
  const [code, info] = Object.entries(signins().observers).find(([, v]) => v.label === `Demo observer ${String(number).padStart(2, "0")}`);
  await page.goto(BASE + "/o/start?view=sign-in");
  await beat(page, 1200);
  await typeSlowly(page, page.getByTestId("o03-code"), code, 60);
  await typeSlowly(page, page.getByTestId("o03-pin"), info.pin, 100);
  await tap(page, page.getByTestId("o03-submit"), { after: 3000 });
  await page.waitForURL(/\/o$/, { timeout: 60000 });
}
const choosePlaceOnPage = (page, wardIndex) => choosePlace(page, wardIndex);

const clips = {
  async "01a-citizen-phone"() {
    await clip("01a-citizen-phone", { phone: true }, async (page) => {
      await page.goto(BASE);
      await beat(page, 3000);
      // Header language control: Hausa, then back to English so the rest is readable.
      const menu = page.getByRole("button", { name: /menu/i }).first();
      await tap(page, menu);
      await tap(page, page.locator('text="Hausa" >> visible=true').first(), { after: 3000 });
      await tap(page, page.locator('text="English" >> visible=true').first(), { after: 1500 });
      await tap(page, page.getByRole("button", { name: /close menu/i }), { after: 800 });
      await tap(page, page.getByRole("link", { name: /report what you saw/i }).first());
      await page.waitForURL(/\/o\/new/);
      await reportSteps(page, { path: "/o/new/what?as=citizen", category: "late_materials", description: "Ballot papers had not reached the unit by nine. About sixty people are waiting in the line.", wardIndex: 1 });
      await tap(page, page.getByTestId("o11-send"), { after: 4000 });
      const receipt = (await page.locator("body").innerText()).match(/EG-[0-9A-Z]{4}-[0-9A-Z]{4}/)?.[0];
      await beat(page, 3000);
      await page.goto(BASE + "/status");
      await beat(page, 1500);
      await typeSlowly(page, page.locator('[data-testid="p01-code"] input, input[data-testid="p01-code"]').first(), receipt ?? "", 80);
      await page.keyboard.press("Enter");
      await beat(page, 4000);
    });
  },
  async "01b-check-rumour"() {
    await clip("01b-check-rumour", {}, async (page) => {
      await page.goto(BASE + "/check");
      await beat(page, 2000);
      await typeSlowly(page, page.getByTestId("check-text"), "Voting has been moved to Saturday in Kano", 60);
      await tap(page, page.getByTestId("check-submit"), { after: 4500 });
      await page.getByTestId("check-result").scrollIntoViewIfNeeded();
      await beat(page, 3000);
    });
  },
  async "01c-phone-simulator"() {
    await clip("01c-phone-simulator", {}, async (page) => {
      await page.goto(BASE + "/phone");
      await page.evaluate(() => { document.body.style.zoom = "0.78"; });
      await beat(page, 3500);
      await typeSlowly(page, page.getByTestId("phone-dial"), "*347*88#", 120);
      await tap(page, page.getByTestId("phone-call"), { after: 3000 });
      await tap(page, page.getByTestId("phone-end"), { after: 1500 });
      await tap(page, page.getByTestId("phone-example-report"), { after: 1500 });
      await tap(page, page.getByTestId("phone-call"), { after: 3500 });
    });
  },
  async "02-observer-phone"() {
    await clip("02-observer-phone", { phone: true }, async (page, context) => {
      await page.goto(BASE + "/o/start?view=sign-in");
      const [code, info] = Object.entries(signins().observers).find(([, v]) => v.label === "Demo observer 04");
      await beat(page, 1500);
      await typeSlowly(page, page.getByTestId("o03-code"), code, 70);
      await typeSlowly(page, page.getByTestId("o03-pin"), info.pin, 120);
      await tap(page, page.getByTestId("o03-submit"), { after: 3500 });
      await page.waitForURL(/\/o$/, { timeout: 60000 });
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 30000 }).catch(() => {});
      await beat(page, 2000);
      await reportSteps(page, { category: "queues_crowding", description: "One accreditation table only. The line is about two hundred people and moving slowly.", wardIndex: 0 });
      await context.setOffline(true);
      await beat(page, 800);
      await tap(page, page.getByTestId("o11-send"), { after: 3000 });
      await page.waitForURL(/\/o$/, { timeout: 15000 }).catch(() => {});
      await beat(page, 3500);
      await context.setOffline(false);
      await page.getByTestId("o04-unsent").waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
      await beat(page, 4000);
      await page.goto(BASE + "/o/messages");
      await beat(page, 2500);
      await tap(page, page.getByTestId("report-row").first(), { after: 2500 });
      const reply = page.locator("textarea").first();
      if (await reply.count()) {
        await typeSlowly(page, reply, "It was the unit by the school gate. The materials came at about ten.", 45);
        await tap(page, page.getByRole("button", { name: /send answer/i }), { after: 4000 });
      }
    });
  },
  async "03-reviewer"() {
    const ref = query("from reports.models import Report; print(Report.objects.get(description__startswith='Ballot papers had not arrived at the unit by 9:15').reference)");
    // Put the showcase case back as the seed left it, so a re-take starts from the same screen.
    query("from reports.models import Report, ReviewEvent; r = Report.objects.get(description__startswith='Ballot papers had not arrived at the unit by 9:15'); ReviewEvent.objects.filter(report=r, action__in=['accept_suggestion', 'correct_suggestion', 'request_clarification', 'respond', 'message']).delete(); r.review_suggestions = {}; r.status = 'in_review'; r.version = max(ReviewEvent.objects.filter(report=r).values_list('version', flat=True)); r.save(); print('reset')");
    const state = await stateFor("amina", (p) => staffSignIn(p, "reviewer.amina"));
    await clip("03-reviewer", { storageState: state }, async (page) => {
      await page.goto(BASE + "/s/queue");
      await beat(page, 4000);
      await page.goto(BASE + `/s/cases/${ref}`);
      await beat(page, 4000);
      await tap(page, page.getByTestId("s03-redact"), { after: 2500 });
      await tap(page, page.getByRole("button", { name: /cancel/i }).first(), { after: 1000 });
      const category = page.getByTestId("s03-suggestion-category");
      await category.scrollIntoViewIfNeeded();
      await beat(page, 2500);
      await tap(page, category.getByRole("button", { name: /accept/i }).first(), { after: 1500 });
      await tap(page, page.getByTestId("s03-confirm-category").getByRole("button", { name: /confirm/i }), { after: 2000 });
      const urgency = page.getByTestId("s03-suggestion-urgency");
      await urgency.scrollIntoViewIfNeeded();
      await beat(page, 2000);
      await tap(page, urgency.getByRole("button", { name: /correct/i }).first(), { after: 1200 });
      await page.locator("select").last().selectOption("high");
      await beat(page, 1200);
      await tap(page, page.getByRole("button", { name: /apply correction/i }), { after: 2500 });
      await page.getByText(/Evidence/i).first().scrollIntoViewIfNeeded();
      await beat(page, 3500);
      await page.getByText(/Audit trail/i).first().scrollIntoViewIfNeeded();
      await beat(page, 1500);
      await tap(page, page.getByRole("button", { name: /record chain/i }), { after: 3500 }).catch(() => {});
      await page.getByText(/Ask formal question/i).first().scrollIntoViewIfNeeded();
      await typeSlowly(page, "#s03-question", "Which polling unit was this at, and what time did the first ballot papers arrive?", 40);
      await tap(page, page.getByTestId("s03-ask"), { after: 4000 });
    });
  },
  async "04a-coordinator"() {
    const state = await stateFor("ngozi", (p) => staffSignIn(p, "coordinator.ngozi"));
    await clip("04a-coordinator", { storageState: state }, async (page) => {
      await page.goto(BASE + "/s/ops");
      await beat(page, 4500);
      await page.getByTestId("s05-lga-table").scrollIntoViewIfNeeded();
      await beat(page, 3000);
      await tap(page, page.getByTestId("s05-tab-checkins"), { after: 2500 });
      await tap(page, page.getByTestId("ci-scope-kind").getByRole("tab", { name: "LGA", exact: true }), { after: 800 });
      const place = page.getByTestId("ci-scope-code");
      await place.selectOption(await place.locator("option", { hasText: /^Kano LGA-2/ }).first().getAttribute("value"));
      await beat(page, 800);
      await tap(page, page.getByTestId("ci-type").getByRole("tab", { name: /safety/i }), { after: 800 });
      await tap(page, page.getByTestId("ci-mode").getByRole("tab", { name: /write/i }), { after: 800 });
      await typeSlowly(page, page.getByTestId("ci-text"), "Keep calm and stay at your unit. Report any crowd near the gate to your coordinator.", 40);
      await beat(page, 1500);
      await tap(page, page.getByTestId("ci-send"), { after: 4000 });
    });
  },
  async "04b-second-coordinator"() {
    const state = await stateFor("ibrahim", (p) => staffSignIn(p, "coordinator.ibrahim"));
    await clip("04b-second-coordinator", { storageState: state }, async (page) => {
      await page.goto(BASE + "/s/ops?tab=checkins");
      await beat(page, 3500);
      await page.getByTestId("ci-approval").scrollIntoViewIfNeeded();
      await beat(page, 3000);
      await tap(page, page.locator('[data-testid="ci-approve"]:not([disabled])').first(), { after: 4000 });
    });
  },
  async "05a-result-sheet-phone"() {
    await clip("05a-result-sheet-phone", { phone: true }, async (page) => {
      await observerSignInSlow(page, 1);
      await page.goto(BASE + "/o/checklist/arrival");
      await beat(page, 2000);
      await choosePlaceOnPage(page, 0);
      await tap(page, page.getByTestId("o15-send"), { after: 3500 });
      await page.goto(BASE + "/o/checklist/results/sheet");
      await beat(page, 2500);
      await tap(page, page.getByTestId("o16-skip"), { after: 1500 });
      const numbers = { registered: 612, accredited: 330, rejected: 11, "votes.A": 102, "votes.B": 88, "votes.C": 57, "votes.D": 33, "votes.E": 19 };
      for (const [key, value] of Object.entries(numbers)) {
        const field = page.getByTestId(`o16-field-${key}`);
        await typeSlowly(page, field.locator("input").or(field).first(), String(value), 90);
      }
      await beat(page, 1500);
      const confirm = page.getByTestId("o16-confirm");
      if (await confirm.count()) await tap(page, confirm, { after: 1500 });
      await tap(page, page.getByTestId("o16-send"), { after: 4500 });
    });
  },
  async "05b-result-sheet-reviewer"() {
    const ref = query("from reports.models import Report; print(Report.objects.filter(kind='result_sheet', status='submitted').exclude(result_flags=[]).order_by('created_at').first().reference)");
    const state = await stateFor("amina2", (p) => staffSignIn(p, "reviewer.amina"));
    await clip("05b-result-sheet-reviewer", { storageState: state }, async (page) => {
      await page.goto(BASE + `/s/cases/${ref}`);
      await beat(page, 3500);
      await page.getByTestId("s03-result-sheet").scrollIntoViewIfNeeded();
      await beat(page, 6000);
    });
  },
  async "05c-publish-and-results"() {
    const state = await stateFor("ngozi2", (p) => staffSignIn(p, "coordinator.ngozi"));
    await clip("05c-publish-and-results", { storageState: state }, async (page) => {
      await page.goto(BASE + "/s/publish");
      await beat(page, 3500);
      await tap(page, page.getByTestId("s07-generate"), { after: 3500 });
      await page.getByTestId("s07-detail").scrollIntoViewIfNeeded();
      await beat(page, 3000);
      await tap(page, page.getByTestId("s07-approve"), { after: 2000 });
      await tap(page, page.getByTestId("s07-publish-confirm"), { after: 3500 });
      await page.goto(BASE + "/results");
      await beat(page, 3500);
      await page.mouse.wheel(0, 700); await beat(page, 3000);
      await page.mouse.wheel(0, 900); await beat(page, 3500);
      await page.mouse.wheel(0, 1200); await beat(page, 3500);
    });
  },
  async "06-privacy-languages"() {
    await clip("06-privacy-languages", { phone: true }, async (page) => {
      await page.goto(BASE);
      await beat(page, 2500);
      for (const name of ["Naijá", "Hausa", "Yorùbá", "Igbo", "English"]) {
        await page.mouse.click(362, 26); await beat(page, 800);
        await tap(page, page.locator(`text="${name}" >> visible=true`).first(), { after: 900 });
        await page.mouse.click(362, 26); await beat(page, 1800);
      }
      await page.goto(BASE + "/privacy");
      await beat(page, 3000);
      await page.mouse.wheel(0, 700); await beat(page, 3000);
      await page.mouse.wheel(0, 900); await beat(page, 3000);
    });
  },
};
const wanted = process.argv.slice(2);
for (const name of Object.keys(clips)) if (!wanted.length || wanted.includes(name)) await clips[name]();
