import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { choosePlace, knownPhone, signInNewObserver, stepIs } from "./helpers";

test("after the first load, the app shell, every language and the polling-unit list work with no network", async ({ context, page }) => {
  await knownPhone(context);
  await signInNewObserver(page);
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker?.getRegistration();
    return Boolean(registration?.active);
  }, null, { timeout: 60_000 });
  // Give the install step time to fetch the shell pages and their files.
  await page.waitForFunction(async () => (await caches.keys()).some((name) => name.startsWith("eg-shell-")), null, { timeout: 60_000 });

  // Online once: choose a place, so that state's list is on the phone.
  await page.goto("/o/new/what");
  await page.locator('input[name="category"][value="queues_crowding"]').check({ force: true });
  await page.getByTestId("continue").click();
  await stepIs(page, "danger");
  await page.getByTestId("o06-answer-no").click();
  await stepIs(page, "where");
  await choosePlace(page);
  const place = (await page.getByTestId("o07-summary").textContent())!.trim();
  const stateName = (await page.getByTestId("polling-unit-picker-state").locator("option:checked").textContent())!.trim();
  await page.waitForTimeout(1_000);

  await context.setOffline(true);
  const offline = await context.newPage();
  // Home and every report step open from the cache.
  for (const path of ["/o", "/o/new/what", "/o/new/where", "/o/new/describe", "/o/new/check"]) {
    const response = await offline.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(offline.locator("h1"), path).toBeVisible();
  }
  await offline.goto("/o/new/where");
  await expect(offline.getByTestId("o07-summary")).toHaveText(place);
  await expect(offline.getByTestId("polling-unit-picker-missing")).toHaveCount(0);
  await expect(offline.getByTestId("polling-unit-picker-state").locator("option:checked")).toHaveText(stateName);
  await expect(offline.getByTestId("polling-unit-picker-lga")).toBeEnabled();
  // Search works offline on the stored list.
  await offline.getByTestId("polling-unit-picker-search").locator("input").fill(place.split(",")[0]);
  await expect(offline.getByRole("option").first()).toBeVisible();

  // Every language's messages are on the phone: switch to each with no network.
  await offline.goto("/o");
  for (const locale of ["ha", "yo", "ig", "pcm", "en"]) {
    const word = (JSON.parse(readFileSync(join(__dirname, "../../messages", `${locale}.json`), "utf8")) as { o04: { report: string } }).o04.report;
    await offline.getByTestId("menu").click();
    await offline.getByTestId("o04-menu").locator("select").selectOption(locale);
    await expect(offline.locator("html")).toHaveAttribute("lang", new RegExp(`^${locale}`));
    await offline.keyboard.press("Escape");
    await expect(offline.getByTestId("o04-report")).toHaveText(word);
  }
  await context.setOffline(false);
});
