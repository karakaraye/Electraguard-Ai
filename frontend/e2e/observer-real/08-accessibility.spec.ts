import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { choosePlace, knownPhone, signInNewObserver, stepIs } from "./helpers";

const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

type AxeViolation = { id: string; impact: string | null; help: string; nodes: Array<{ target: string[] }> };

async function axe(page: Page, selector: string): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async (scope) => {
    const result = await (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: AxeViolation[] }> } }).axe.run(
      { include: [scope] },
      { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } },
    );
    return result.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target })) }));
  }, selector);
}

test("Where: every place select is named by its label, never by its \"Choose\" option, and axe finds nothing", async ({ context, page }) => {
  await knownPhone(context);
  await signInNewObserver(page);
  await page.goto("/o/new/what");
  await page.locator('input[name="category"][value="queues_crowding"]').check({ force: true });
  await page.getByTestId("continue").click();
  await stepIs(page, "danger");
  await page.getByTestId("o06-answer-no").click();
  await stepIs(page, "where");

  // By design the state is the only select on the page itself; Local government area, Ward and Polling unit
  // live in the "By area" sheet, so the sheet is opened to read them, and Done closes it again.
  const names = { state: "State", lga: "Local government area", ward: "Ward", unit: "Polling unit" } as const;
  async function checkNames() {
    const sheet = page.getByTestId("polling-unit-picker-sheet");
    expect(await axe(page, '[data-testid="polling-unit-picker"]')).toEqual([]);
    await page.getByTestId("polling-unit-picker-by-area").click();
    await expect(page.getByTestId("polling-unit-picker-lga")).toBeVisible();
    for (const [level, name] of Object.entries(names)) {
      const select = page.getByTestId(`polling-unit-picker-${level}`);
      // Exactly the label: the accessible name must not be the empty option's "Choose".
      await expect(page.getByRole("combobox", { name, exact: true })).toHaveAttribute("data-testid", `polling-unit-picker-${level}`);
      const snapshot = await select.ariaSnapshot();
      expect(snapshot).toContain(`combobox "${name}"`);
      expect(snapshot).not.toMatch(/combobox "Choose/);
    }
    expect(await axe(page, '[data-testid="polling-unit-picker"]')).toEqual([]);
    await page.getByTestId("polling-unit-picker-done").click();
    await expect(sheet).not.toBeVisible();
  }
  await checkNames();

  await choosePlace(page);
  await checkNames();
  expect((await axe(page, "main")).filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
});
