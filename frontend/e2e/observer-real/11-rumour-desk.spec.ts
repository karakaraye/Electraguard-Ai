/**
 * The rumour desk with public asks against the real servers: the "From the public" filter, the most-asked
 * sort, the ask count with its last-hour trend, and ward check-in evidence on a claim. Claims, a check-in
 * and its answers are created through server_state.py; the screen reads them from the real API.
 */
import { expect, test } from "@playwright/test";
import { areaNumber, cleanCommunity, knownPhone, newCoordinator, server, staffSignIn } from "./helpers";

test.beforeAll(() => cleanCommunity());

test("From the public filter and Most asked sort list the public asks by demand, and a claim shows its check-in evidence", async ({ browser }) => {
  const area = areaNumber(9);
  const elsewhere = areaNumber(10);
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  await knownPhone(context);
  const page = await context.newPage();
  

  // Two public asks (older one is asked far more), one claim the desk logged itself that is asked most of all, one check-in with answers.
  const popular = server<{ id: string }>("claim", "Election materials have not reached the ward", "40", area.lga_code, "late_materials").id;
  const quiet = server<{ id: string }>("claim", "Voting is said to start at noon", "3", elsewhere.lga_code, "-").id;
  const desk = server<{ id: string }>("claim", "Logged from a radio call-in", "90", area.lga_code, "-", "desk").id;
  const notice = server<{ id: string }>("notice", "lga", area.lga_code, "materials_arrived").id;
  server("answers", notice, "yes=5", "no=2", "not_seen=1");

  await staffSignIn(page, newCoordinator("Funmi Bakare"));
  await page.goto("/s/rumours");
  await expect(page.getByTestId("s06-source")).toBeVisible();
  const asks = () => page.locator('[data-testid^="s06-asks-"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid")!.replace("s06-asks-", "")));
  const mine = (ids: string[]) => ids.filter((id) => [popular, quiet, desk].includes(id));

  // All sources: all three are there.
  await expect.poll(async () => mine(await asks()).length).toBe(3);

  // From the public: the desk's own claim is gone, the two public asks stay.
  await page.getByTestId("s06-source").getByRole("tab", { name: "From the public" }).click();
  await expect.poll(async () => mine(await asks()).sort()).toEqual([popular, quiet].sort());

  // Newest first by default: the quieter ask was logged after the popular one.
  expect(mine(await asks())).toEqual([quiet, popular]);

  // Most asked: the popular one leads, and the list is the one the server sorted by demand.
  const sorted = page.waitForResponse((response) => response.url().includes("sort=demand") && response.url().includes("source=public"));
  await page.getByTestId("s06-sort").getByRole("tab", { name: "Most asked" }).click();
  expect((await sorted).status()).toBe(200);
  await expect.poll(async () => mine(await asks())).toEqual([popular, quiet]);
  await expect(page.getByTestId(`s06-asks-${popular}`)).toContainText("40");
  await expect(page.getByTestId(`s06-asks-${popular}`)).toContainText("in 1 h");

  // Most asked across every source: the desk's 90 asks come first.
  await page.getByTestId("s06-source").getByRole("tab", { name: "All" }).click();
  await expect.poll(async () => mine(await asks())).toEqual([desk, popular, quiet]);

  // The popular claim: its asks and where it came from, and what the ward check-ins said.
  await page.getByTestId("s06-source").getByRole("tab", { name: "From the public" }).click();
  await page.getByText("Election materials have not reached the ward").first().click();
  const detail = page.getByTestId("s06-detail");
  await expect(detail).toContainText("Election materials have not reached the ward");
  await expect(page.getByTestId("s06-ask-box")).toContainText("From the public");
  await expect(page.getByTestId("s06-ask-box")).toContainText("40");
  const evidence = page.getByTestId("s06-evidence");
  await expect(evidence).toContainText("Have materials arrived");
  await expect(evidence.locator("dl div").filter({ hasText: "Yes" })).toContainText("5");
  await expect(evidence.locator("dl div").filter({ hasText: "No" }).first()).toContainText("fewer than 5");
  await expect(evidence.locator("dl div").filter({ hasText: "Not seen" })).toContainText("fewer than 5");

  // A claim with no category has no check-in evidence to show.
  await page.getByText("Voting is said to start at noon").first().click();
  await expect(page.getByTestId("s06-evidence")).toContainText("No ward check-ins on this yet.");
  await context.close();
});
