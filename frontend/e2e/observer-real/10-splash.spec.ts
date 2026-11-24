import { expect, test } from "@playwright/test";

test.describe("Splash overlay", () => {
  test("shows on first open and disappears by itself in under 1.6s", async ({ page }) => {
    await page.goto("/o/start");
    const splash = page.getByTestId("splash-overlay");
    await expect(splash).toBeVisible();

    // Must disappear by itself in under 1.6s
    await expect(splash).not.toBeVisible({ timeout: 1600 });
  });

  test("can be dismissed by tap", async ({ page }) => {
    await page.goto("/o/start");
    const splash = page.getByTestId("splash-overlay");
    await expect(splash).toBeVisible();
    await splash.click();
    await expect(splash).not.toBeVisible();
  });

  test("can be dismissed by Escape", async ({ page }) => {
    await page.goto("/o/start");
    const splash = page.getByTestId("splash-overlay");
    await expect(splash).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(splash).not.toBeVisible();
  });

  test("never shows again after reload", async ({ page }) => {
    await page.goto("/o/start");
    const splash = page.getByTestId("splash-overlay");
    await expect(splash).toBeVisible();
    await splash.click();
    await expect(splash).not.toBeVisible();

    // Reload
    await page.reload();
    await expect(page.getByTestId("splash-overlay")).not.toBeVisible();
  });

  test("never shows on /workspace", async ({ page }) => {
    await page.goto("/workspace/reviewer/cases");
    await expect(page.getByTestId("splash-overlay")).not.toBeVisible();
  });

  test("shows no animation under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/o/start");
    const splash = page.getByTestId("splash-overlay");
    if (await splash.isVisible()) {
      const transition = await splash.evaluate((el) => window.getComputedStyle(el).transitionDuration);
      expect(["0s", "0ms", ""]).toContain(transition);
      await splash.click();
      await expect(splash).not.toBeVisible();
    }
  });
});
