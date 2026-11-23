/*
 * Screenshots and axe checks for every observer screen state in the dev state viewer.
 * Usage: BASE=http://localhost:3100 OUT=../docs/design/observer-screens-shots node e2e/observer/states.cjs
 * Needs playwright and @axe-core/playwright on NODE_PATH.
 */
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = process.env.OUT || path.join(__dirname, "../../../docs/design/observer-screens-shots");
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;

/** Every variant (360/768, light/dark, 200 % text, offline) for these key states; 360 light for all. */
const KEY = new Set([
  "o01/first", "o02/first", "o03-choose/first", "o03-signin/wrong", "o03-setpin/mismatch", "o03-revoked/unsent",
  "o04/filled", "o04/offline", "o05/access", "o05/error", "o06/first", "o06/emergency", "o07/selected", "o07/list-missing",
  "o08/another-day", "o08/future", "o09/name-warning", "o09/listening", "o10/items", "o10/recording", "o11/first",
  "o11/not-confirmed", "o11/needs-attention", "o12/uploading", "o12/failed",
]);

async function listStates(page) {
  await page.goto(`${BASE}/dev/observer`);
  return page.$$eval("main a", (links) => links.map((a) => new URL(a.href).searchParams).map((p) => `${p.get("screen")}/${p.get("state")}`));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const index = await (await browser.newContext()).newPage();
  let states = await listStates(index);
  if (ONLY) states = states.filter((s) => ONLY.some((o) => s.startsWith(o)));
  const results = [];
  const variants = [
    { name: "360-light", width: 360, theme: "light" },
    { name: "360-dark", width: 360, theme: "dark", keyOnly: true },
    { name: "768-light", width: 768, theme: "light", keyOnly: true },
    { name: "360-text200", width: 360, theme: "light", text200: true, keyOnly: true },
    { name: "360-offline", width: 360, theme: "light", offline: true, keyOnly: true },
  ];
  for (const variant of variants) {
    const context = await browser.newContext({ viewport: { width: variant.width, height: 760 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    for (const state of states) {
      if (variant.keyOnly && !KEY.has(state)) continue;
      const [screen, name] = state.split("/");
      await context.setOffline(false);
      await page.goto(`${BASE}/dev/observer?screen=${screen}&state=${name}&theme=${variant.theme}`);
      await page.waitForSelector("[data-viewer-ready]", { timeout: 15000 });
      // Full-page captures: the pinned action area is shown where it sits in the flow, and the dev badge is hidden.
      await page.addStyleTag({ content: '[data-testid="action-area"]{position:static !important} nextjs-portal{display:none !important}' });
      if (variant.text200) await page.addStyleTag({ content: "html{font-size:200% !important}" });
      if (variant.offline) {
        await context.setOffline(true);
        await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      }
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      let serious = [];
      if (variant.name === "360-light" || variant.name === "360-dark") {
        const axe = await new AxeBuilder({ page }).disableRules(["region"]).analyze();
        serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
      }
      const file = path.join(OUT, `${screen}--${name}--${variant.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      results.push({ state, variant: variant.name, overflow, serious });
      if (serious.length || overflow > 0) console.log("PROBLEM", state, variant.name, "overflow", overflow, serious);
    }
    await context.close();
  }
  await browser.close();
  const shots = results.length;
  const axeRuns = results.filter((r) => r.variant === "360-light" || r.variant === "360-dark").length;
  const seriousTotal = results.reduce((n, r) => n + r.serious.length, 0);
  const overflowTotal = results.filter((r) => r.overflow > 0).length;
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ shots, axeRuns, seriousTotal, overflowTotal, results }, null, 1));
  console.log(JSON.stringify({ states: states.length, shots, axeRuns, seriousTotal, overflowTotal }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
