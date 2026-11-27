// Walks the demonstration screens against the real stack and reports what it sees. Screenshots go to EG_SHOTS.
import { mkdirSync } from "node:fs";
import { BASE, knownPhone, launch, observerSignIn, staffSignIn } from "./common.mjs";

const shots = process.env.EG_SHOTS ?? "../demo-shots";
mkdirSync(shots, { recursive: true });
const browser = await launch();
const results = [];
const check = (name, ok, note = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name} ${note}`); };

async function page(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await knownPhone(context);
  return context.newPage();
}

// Public pages
{
  const p = await page();
  await p.goto(BASE); await p.waitForLoadState("networkidle");
  const home = await p.locator("body").innerText();
  check("home has no load error", !/could not be loaded/i.test(home));
  await p.screenshot({ path: `${shots}/home.png` });
  await p.goto(`${BASE}/results`); await p.waitForLoadState("networkidle");
  const results_ = await p.locator("body").innerText();
  check("results shows totals", /38|Not official results/i.test(results_), results_.match(/fewer than 5/i) ? "(small numbers hidden)" : "(no hidden label)");
  await p.screenshot({ path: `${shots}/results.png`, fullPage: true });
  await p.goto(`${BASE}/check`); await p.waitForLoadState("networkidle");
  await p.locator("textarea, input[type=text]").first().fill("Voting has been moved to Saturday in Kano");
  await p.getByRole("button", { name: /check/i }).first().click();
  await p.waitForTimeout(2500);
  const check_ = await p.locator("body").innerText();
  check("rumour check gives an approved answer", /Checked by ElectraGuard/i.test(check_));
  await p.screenshot({ path: `${shots}/check.png` });
  await p.goto(`${BASE}/phone`); await p.waitForLoadState("networkidle");
  const phone = await p.locator("body").innerText();
  check("phone simulator shows test-number label", /test/i.test(phone) && /simulat/i.test(phone));
  await p.getByTestId("phone-dial").fill("*347*88#");
  await p.getByTestId("phone-call").click();
  await p.waitForTimeout(2000);
  check("USSD menu appears", (await p.getByTestId("phone-ussd-text").innerText().catch(() => "")).length > 10);
  await p.screenshot({ path: `${shots}/phone.png` });
  await p.close();
}

// Observer
{
  const p = await page({ viewport: { width: 390, height: 844 } });
  await observerSignIn(p, 4);
  check("observer signs in with a demo code", /\/o$/.test(p.url()));
  await p.goto(`${BASE}/o/messages`); await p.waitForLoadState("networkidle");
  check("observer has a reviewer question", /question|\?/i.test(await p.locator("body").innerText()));
  await p.screenshot({ path: `${shots}/observer-messages.png` });
  await p.close();
}

// Staff
for (const [key, route, expect] of [
  ["reviewer.amina", "/s/queue", /EG-/],
  ["coordinator.ngozi", "/s/ops", /./],
  ["coordinator.ngozi", "/s/publish", /./],
  ["coordinator.ngozi", "/s/rumours", /ask|claim|rumour/i],
  ["admin.tunde", "/s/admin/codes", /OBS-/],
  ["moderator.zainab", "/s/discussions", /./],
]) {
  const p = await page();
  try {
    await staffSignIn(p, key);
    await p.goto(`${BASE}${route}`); await p.waitForLoadState("networkidle"); await p.waitForTimeout(1500);
    const text = await p.locator("body").innerText();
    check(`${key} ${route}`, expect.test(text) && !/could not be loaded/i.test(text));
    await p.screenshot({ path: `${shots}/${key}-${route.replaceAll("/", "_")}.png` });
  } catch (e) { check(`${key} ${route}`, false, String(e).slice(0, 200)); }
  await p.context().close();
}
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
