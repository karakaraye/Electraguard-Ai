import { chromium, type Page } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fillReport, photo, server } from "../e2e/observer-real/helpers";

function chromiumPath(): string | undefined {
  if (process.env.EG_CHROMIUM) return process.env.EG_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), process.platform === "win32" ? "AppData/Local/ms-playwright" : ".cache/ms-playwright");
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const dir of dirs) {
    for (const exe of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux64/chrome", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      const path = join(root, dir, exe);
      if (existsSync(path)) return path;
    }
  }
  return undefined;
}

const FRONTEND_DIR = resolve(__dirname, "..");
const WORKTREE_DIR = resolve(FRONTEND_DIR, "..");
const TARGETS_DIR = "C:\\Users\\Windows\\Desktop\\CAIRN\\.worktrees\\design-proto\\screens";
const SHOTS_DIR = join(WORKTREE_DIR, "docs", "design", "visual-refresh-shots");
const PYTHON = "C:\\Users\\Windows\\Desktop\\CAIRN\\.worktrees\\Electraguard-Ai\\backend\\.venv\\Scripts\\python.exe";
const BACKEND_DIR = join(WORKTREE_DIR, "backend");

function runDjango(script: string) {
  return execFileSync(PYTHON, ["manage.py", "shell"], {
    cwd: BACKEND_DIR,
    input: script,
    encoding: "utf8",
  });
}

async function main() {
  mkdirSync(SHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath() });

  for (const theme of ["light", "dark"] as const) {
    console.log(`\nCapturing theme: ${theme}`);
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3361",
      viewport: { width: 390, height: 844 },
      colorScheme: theme,
      deviceScaleFactor: 2,
    });

    const page = await context.newPage();

    page.on("console", (msg) => console.log(`    [browser console] ${msg.type()}: ${msg.text()}`));
    page.on("response", (res) => {
      if (res.status() >= 400) {
        console.log(`    [browser error response] ${res.status()} ${res.url()}`);
      }
    });

    // Set theme and test ready
    await page.addInitScript((th) => {
      document.documentElement.setAttribute("data-theme", th);
      window.localStorage.setItem("eg.theme", th);
      window.localStorage.setItem("eg.locale", "en");
      window.localStorage.setItem("eg.test.ready", "1");
    }, theme);

    // 01-splash
    console.log("  -> 01-splash");
    await page.goto("http://127.0.0.1:3361/o/start?splash=1");
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SHOTS_DIR, `01-splash-${theme}.png`) });

    // 02-onboarding-report
    console.log("  -> 02-onboarding-report");
    await page.evaluate(() => {
      window.localStorage.removeItem("eg.noticeSeen");
    });
    await page.goto("http://127.0.0.1:3361/o/start?view=notice");
    await page.getByTestId("o02").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS_DIR, `02-onboarding-report-${theme}.png`) });

    // 03-onboarding-safe
    console.log("  -> 03-onboarding-safe");
    await page.getByTestId("o02-next").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS_DIR, `03-onboarding-safe-${theme}.png`) });

    // 04-onboarding-offline
    console.log("  -> 04-onboarding-offline");
    await page.getByTestId("o02-next").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS_DIR, `04-onboarding-offline-${theme}.png`) });

    // 05a-choose-role
    console.log("  -> 05a-choose-role");
    await page.goto("http://127.0.0.1:3361/o/start?view=choose");
    await page.getByTestId("o03-choose").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS_DIR, `05a-choose-role-${theme}.png`) });

    // Sign in observer
    console.log("  -> Signing in observer");
    await page.evaluate(() => {
      window.localStorage.setItem("eg.noticeSeen", "2026-11-22");
    });
    const { code, pin: setupPin } = server("issue");
    const pin = "482913";
    await page.goto("http://127.0.0.1:3361/o/start?view=sign-in");
    await page.getByTestId("o03-code").fill(code);
    await page.getByTestId("o03-pin").fill(setupPin);
    await page.getByTestId("o03-submit").click();
    try {
      await page.getByTestId("o03-set-pin").waitFor({ state: "visible", timeout: 10000 });
    } catch (e) {
      console.log("URL at failure:", page.url());
      const bodyText = await page.innerText("body");
      console.log("Body text at failure:", bodyText.slice(0, 300));
      throw e;
    }
    await page.getByTestId("o03-newpin").fill(pin);
    await page.getByTestId("o03-confirmpin").fill(pin);
    await page.getByTestId("o03-setpin-submit").click();
    await page.waitForURL(/\/o$/);
    await page.getByTestId("o04").waitFor({ state: "visible" });

    // 05-home
    console.log("  -> 05-home");
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS_DIR, `05-home-${theme}.png`) });

    // 06-what-happened
    console.log("  -> 06-what-happened");
    await page.goto("http://127.0.0.1:3361/o/new/what");
    await page.getByTestId("o05").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS_DIR, `06-what-happened-${theme}.png`) });

    // Submit report for receipt and detail
    console.log("  -> Submitting report");
    const samplePhoto = photo("sample.jpg", 800, 600, 6);
    await fillReport(page as unknown as Page, { photoPath: samplePhoto });
    await page.getByTestId("o11-send").click();

    await page.waitForURL(/\/o\/reports\/[0-9a-f-]{36}\?just-sent=1/, { timeout: 30_000 });
    const url = page.url();
    const match = url.match(/\/o\/reports\/([0-9a-f-]{36})/);
    const reportId = match ? match[1] : "";

    // 07-receipt
    console.log("  -> 07-receipt");
    await page.getByTestId("receipt-card-code").waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SHOTS_DIR, `07-receipt-${theme}.png`) });

    // 08-polling-day
    console.log("  -> 08-polling-day");
    await page.goto("http://127.0.0.1:3361/o/checklist");
    await page.getByTestId("o15").waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS_DIR, `08-polling-day-${theme}.png`) });

    // 09-report-detail (with clarification question)
    console.log("  -> 09-report-detail");
    runDjango(`
from reports.models import Report, ReviewEvent
r = Report.objects.get(pk='${reportId}')
r.status = 'needs_clarification'
r.version += 1
r.save()
ReviewEvent.objects.create(organisation=r.organisation, report=r, action=ReviewEvent.Action.REQUEST_CLARIFICATION, version=r.version, change={'author': 'reviewer', 'note': 'Could you confirm whether the security officer in your photo was inside or outside the polling perimeter?'})
`);
    await page.goto(`http://127.0.0.1:3361/o/reports/${reportId}`);
    await page.getByTestId("o14").waitFor({ state: "visible" });
    await page.getByTestId("o14-question").waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SHOTS_DIR, `09-report-detail-${theme}.png`) });

    // 10-public-results
    console.log("  -> 10-public-results");
    await page.goto("http://127.0.0.1:3361/results");
    await page.waitForSelector("main");
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS_DIR, `10-public-results-${theme}.png`) });

    await context.close();
  }

  await browser.close();
  console.log("\nAll 11 screens captured in light and dark modes!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
