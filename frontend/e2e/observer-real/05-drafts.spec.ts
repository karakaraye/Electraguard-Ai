import { expect, test, type Page } from "@playwright/test";
import { choosePlace, draftsOnPhone, knownPhone, signInNewObserver, stepIs } from "./helpers";

const TEXT = "Officials stopped the count for an hour and agents were asked to leave the room.";

async function reloadAt(page: Page, step: string) {
  await page.reload();
  await stepIs(page, step);
}

test("draft: reload and Back keep every value, one draft per code, a language change keeps it", async ({ context, page }) => {
  await knownPhone(context);
  const observer = await signInNewObserver(page);

  await page.getByTestId("o04-report").click();
  await stepIs(page, "what");
  const voteBuying = page.locator('input[name="category"][value="vote_buying"]');
  await page.locator("label").filter({ has: voteBuying }).click();
  // Reload at once: the change must already be on the phone (written within 300 ms, flushed on page hide).
  await reloadAt(page, "what");
  await expect(page.locator('input[name="category"]:checked')).toHaveValue("vote_buying");
  await page.getByTestId("continue").click();

  await stepIs(page, "danger");
  await page.getByTestId("o06-answer-no").click();
  await stepIs(page, "where");
  await reloadAt(page, "where");
  await choosePlace(page);
  const place = (await page.getByTestId("o07-summary").textContent())!.trim();
  await reloadAt(page, "where");
  await expect(page.getByTestId("o07-summary")).toHaveText(place);
  await page.getByTestId("continue").click();

  await stepIs(page, "when");
  await reloadAt(page, "when");
  await page.getByTestId("continue").click();

  await stepIs(page, "describe");
  await page.locator("textarea").fill(TEXT);
  await page.getByTestId("o09-source-no").click();
  await reloadAt(page, "describe");
  await expect(page.locator("textarea")).toHaveValue(TEXT);
  await expect(page.getByTestId("o09-source").getByRole("radio").nth(1)).toBeChecked();
  await page.getByTestId("continue").click();
  await stepIs(page, "evidence");
  await reloadAt(page, "evidence");
  await page.getByTestId("continue").click();
  await stepIs(page, "check");
  await reloadAt(page, "check");
  const summary = (await page.getByTestId("o11").textContent()) ?? "";
  expect(summary).toContain(TEXT);
  expect(summary).toContain(place.split(",")[0]);

  // Back walks every step with its value kept, then Home keeps the draft.
  await page.getByTestId("back").click();
  await stepIs(page, "evidence");
  await page.getByTestId("back").click();
  await stepIs(page, "describe");
  await expect(page.locator("textarea")).toHaveValue(TEXT);
  await page.getByTestId("back").click();
  await stepIs(page, "when");
  await page.getByTestId("back").click();
  await stepIs(page, "where");
  await expect(page.getByTestId("o07-summary")).toHaveText(place);
  await page.getByTestId("back").click();
  await stepIs(page, "danger");
  await expect(page.getByTestId("o06-answer-no").locator("input")).toBeChecked();
  await page.getByTestId("back").click();
  await stepIs(page, "what");
  await expect(page.locator('input[name="category"]:checked')).toHaveValue("vote_buying");
  // Hardware Back on the first step goes Home and keeps the draft.
  await page.getByTestId("back").click();
  await page.waitForURL(/\/o$/);
  await expect(page.getByTestId("o04-draft-kept")).toBeVisible();
  await expect(page.getByTestId("o04-draft")).toBeVisible();

  // "Report something" with a draft open goes back into that draft: never a second one.
  await page.getByTestId("o04-report").click();
  await page.waitForURL(/\/o\/new\//);
  await expect(page.locator("h1")).toBeFocused();
  let drafts = await draftsOnPhone(page);
  expect(drafts).toHaveLength(1);
  expect(drafts[0].owner).toBe(observer.code);
  const draftId = drafts[0].id;

  // Change the language on Home: the draft and its values stay.
  await page.goto("/o");
  await page.getByTestId("menu").click();
  await page.getByTestId("o04-menu").locator("select").selectOption("ha");
  await expect(page.locator("html")).toHaveAttribute("lang", /^ha/);
  await page.keyboard.press("Escape");
  await page.getByTestId("o04-continue").click();
  await page.waitForURL(/\/o\/new\//);
  await page.goto("/o/new/describe");
  await expect(page.locator("textarea")).toHaveValue(TEXT);
  drafts = await draftsOnPhone(page);
  expect(drafts).toHaveLength(1);
  expect(drafts[0].id).toBe(draftId);
  expect(drafts[0].category_observer).toBe("vote_buying");
  expect(drafts[0].description).toBe(TEXT);
});

test("draft: another code on the same phone does not see the first code's draft", async ({ context, page }) => {
  await knownPhone(context);
  const first = await signInNewObserver(page);
  await page.goto("/o/new/what");
  await page.locator('input[name="category"][value="late_materials"]').check({ force: true });
  await page.getByTestId("continue").click();
  await stepIs(page, "danger");

  // The first observer hands the phone over (session forgotten on the phone; the drafts stay theirs).
  await page.evaluate(() => window.localStorage.removeItem("eg.observer"));
  const second = await signInNewObserver(page);
  await expect(page.getByTestId("o04-draft")).toHaveCount(0);
  await page.goto("/o/new/what");
  await expect(page.locator('input[name="category"]:checked')).toHaveCount(0);
  const owners = (await draftsOnPhone(page)).map((d) => d.owner);
  expect(owners).toEqual([first.code]);
  expect(second.code).not.toBe(first.code);
});
