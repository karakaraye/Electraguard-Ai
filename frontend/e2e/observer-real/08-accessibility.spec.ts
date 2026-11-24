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

  const names = { state: "State", lga: "Local government area", ward: "Ward", unit: "Polling unit" } as const;
  async function checkNames() {
    for (const [level, name] of Object.entries(names)) {
      const select = page.getByTestId(`polling-unit-picker-${level}`);
      // Exactly the label: the accessible name must not be the empty option's "Choose".
      await expect(page.getByRole("combobox", { name, exact: true })).toHaveAttribute("data-testid", `polling-unit-picker-${level}`);
      const snapshot = await select.ariaSnapshot();
      expect(snapshot).toContain(`combobox "${name}"`);
      expect(snapshot).not.toMatch(/combobox "Choose/);
    }
  }
  await checkNames();
  expect(await axe(page, '[data-testid="polling-unit-picker"]')).toEqual([]);

  await choosePlace(page);
  await checkNames();
  expect(await axe(page, '[data-testid="polling-unit-picker"]')).toEqual([]);
  expect((await axe(page, "main")).filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
});
