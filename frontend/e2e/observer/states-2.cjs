/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Screenshots and axe checks for O-13 to O-20, C-01 and P-01 in the dev state viewer.
 * Usage: BASE=http://localhost:3291 OUT=../docs/design/observer-screens-2-shots node e2e/observer/states-2.cjs
 * Needs playwright and @axe-core/playwright on NODE_PATH.
 */
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://localhost:3291";
const OUT = process.env.OUT || path.join(__dirname, "../../../docs/design/observer-screens-2-shots");
const SCREENS = ["o13", "o14", "o15", "o16", "o17", "o18", "o19", "o20", "c01", "p01"];
/** Extra variants: Hausa for two screens, dark for two. */
const EXTRA = [
  { state: "o14/question", lang: "ha" },
  { state: "o15/opening", lang: "ha" },
  { state: "o13/filled", theme: "dark" },
  { state: "o16/suggested", theme: "dark" },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${BASE}/dev/observer`);
  await page.waitForSelector("main a", { timeout: 120000 });
  const all = await page.$$eval("main a", (links) => links.map((a) => new URL(a.href).searchParams).map((p) => `${p.get("screen")}/${p.get("state")}`));
  const states = all.filter((s) => SCREENS.includes(s.split("/")[0])).map((state) => ({ state }));
  const results = [];
  for (const job of [...states, ...EXTRA]) {
    const [screen, name] = job.state.split("/");
    const query = `screen=${screen}&state=${name}&theme=${job.theme || "light"}${job.lang ? `&lang=${job.lang}` : ""}`;
    await page.goto(`${BASE}/dev/observer?${query}`);
    await page.waitForSelector("[data-viewer-ready]", { timeout: 60000 });
    await page.addStyleTag({ content: '[data-testid="action-area"]{position:static !important} nextjs-portal{display:none !important}' });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const file = `${screen}-${name}${job.lang ? `-${job.lang}` : ""}${job.theme ? `-${job.theme}` : ""}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    results.push({ file, overflow, serious: bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`) });
    console.log(file, overflow > 0 ? `OVERFLOW ${overflow}px` : "", bad.length ? `AXE ${bad.map((v) => v.id).join(",")}` : "ok");
  }
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const serious = results.reduce((n, r) => n + r.serious.length, 0);
  console.log(`\n${results.length} shots, ${serious} serious/critical axe issues, ${results.filter((r) => r.overflow > 0).length} with horizontal overflow`);
  await browser.close();
})();
