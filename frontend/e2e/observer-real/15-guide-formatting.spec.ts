/**
 * 15-guide-formatting.spec.ts
 *
 * Approved guide text carries light markdown. Guide pages and Ask quotes must render it
 * (lists, inline code, paragraphs) with the wording unchanged, and a guide must not repeat
 * its own title as the first section heading.
 */
import { expect, test } from "@playwright/test";
import { server } from "./helpers";

test.beforeAll(() => {
  server("guide", "on");
});

test.afterAll(() => {
  server("guide", "off");
});

test("guide page does not repeat its title and renders markdown", async ({ page }) => {
  await page.goto("/guide/e2e-formatting");
  await expect(page.getByRole("heading", { level: 1, name: "E2E Formatting Guide" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "E2E Formatting Guide" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "Zebra Checklist" })).toBeVisible();
  await expect(page.getByText("A short introduction to the zebra checklist.")).toBeVisible();
  const article = page.locator("article");
  await expect(article.locator("ul li")).toHaveText(["your ZEBRA-CARD slip", "a pen"]);
  await expect(article.locator("code")).toHaveText("ZEBRA-CARD");
  await expect(article).not.toContainText("`");
  await expect(article).not.toContainText("- a pen");
});

test("ask quotes the passage verbatim but renders its markdown", async ({ page }) => {
  await page.goto("/ask");
  await page.getByTestId("ask-question").fill("What do I bring to the zebra desk?");
  await page.getByTestId("ask-submit").click();
  const answer = page.getByTestId("ask-answer");
  await expect(answer.locator("blockquote").first()).toContainText("Bring the following items to the zebra desk", { timeout: 15_000 });
  await expect(answer.locator("blockquote ul li").first()).toContainText("ZEBRA-CARD");
  await expect(answer.locator("blockquote code").first()).toHaveText("ZEBRA-CARD");
  await expect(answer).not.toContainText("`");
  await expect(answer).not.toContainText("- a pen");
});
