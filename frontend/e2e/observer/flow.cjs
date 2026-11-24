/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * End-to-end checks of the observer flow against an intercepted /api/v1 (the
 * backend does not exist yet). Every response below follows
 * docs/design/api-contracts.md; requests are checked against it too.
 * Usage: BASE=http://localhost:3100 node e2e/observer/flow.cjs  (playwright on NODE_PATH)
 */
const { chromium } = require("playwright");
const assert = require("assert/strict");

const BASE = process.env.BASE || "http://localhost:3100";
const CODE = "OBS-7K2P9X";
const me = {
  authenticated: true,
  user: { id: "u1", kind: "observer", observer_code: CODE, roles: ["observer"], display_name: null, email: null, totp_enrolled: false, organisation: { id: "o1", name: "Observation group", intake_paused: false } },
  session_expires_at: "2026-12-12T09:00:00+01:00",
  citizen_intake_open: true,
  server_time: new Date().toISOString(),
};
const AREAS = {
  state_code: "KN",
  name: "Kano",
  version: "t1",
  lgas: [{ lga_code: "KN-04", name: "Dala", wards: [{ ward_code: "KN-04-07", name: "Kantudu", units: [["KN-04-07-012", "Kantudu Primary School I"]] }] }],
};
// 8x8 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAYklEQVR4nGNgENGwCUip6Fmw5cSdDywSOg4hGTUTluw4wyBn5BaV1zRt1b5Lz37xKZl5xRW1zVp36NorBqzKH3zhYMCq/J+QGgNW5TIGLgxYlVv5JTFgVR6R08CAVXlZ1zwAORNgQXwkZZMAAAAASUVORK5CYII=", "base64");

function json(route, status, body, headers = {}) {
  return route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
}

/** A fake /api/v1 that records every request. `script` can override per call. */
function fakeApi(page, script = {}) {
  const log = [];
  const uploads = {};
  let reportCalls = 0;
  page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const method = request.method();
    const headers = request.headers();
    const entry = { method, path, headers, body: request.postData() };
    log.push(entry);
    if (method !== "GET") assert.ok(headers["x-csrftoken"] || path === "/auth/csrf", `CSRF header on ${method} ${path}`);
    if (path === "/auth/csrf") return json(route, 200, { csrf_token: "t0k3n" });
    if (path === "/auth/me") return json(route, 200, me);
    if (path === "/reports" && method === "GET") return json(route, 200, { items: [], next_cursor: null, counts: { open_questions: 0, unread_messages: 0 } });
    if (path === "/reference/areas") return json(route, 200, { dataset_version: "t1", source: "synthetic", states: [{ state_code: "KN", name: "Kano", lga_count: 1, unit_count: 1, version: "t1", bytes_gzip: 200 }] }, { ETag: '"i1"' });
    if (path === "/reference/areas/KN") return json(route, 200, AREAS, { ETag: '"k1"' });
    if (path === "/auth/observer/sign-in") return script.signIn ? script.signIn(route, entry) : json(route, 200, { status: "signed_in", me });
    if (path === "/auth/observer/pin") return json(route, 200, { status: "signed_in", me });
    if (path === "/reports" && method === "POST") {
      reportCalls += 1;
      if (script.report) {
        const handled = await script.report(route, entry, reportCalls);
        if (handled) return;
      }
      return json(route, reportCalls > 1 ? 200 : 201, { id: "8d0c1a52-4f3e-4b9e-9a51-2f6a0f7c3e11", receipt_code: "EG-4H7Q-92KD", kind: "incident", status: "received", received_at: "2026-12-05T09:14:31+01:00", version: 0, media_upload: { max_items: 6, max_total_bytes: 62914560 } });
    }
    const start = path.match(/^\/reports\/([^/]+)\/uploads$/);
    if (start && method === "POST") {
      const body = JSON.parse(entry.body);
      const id = `up-${body.client_media_id}`;
      uploads[id] = { size: body.size_bytes, received: 0 };
      return json(route, 201, { upload: { id, report_id: start[1], client_media_id: body.client_media_id, kind: body.kind, size_bytes: body.size_bytes, received_bytes: 0, chunk_bytes: 262144, status: "open", expires_at: "2026-12-06T09:16:00+01:00" }, media: null });
    }
    const chunk = path.match(/^\/uploads\/([^/]+)$/);
    if (chunk && method === "PATCH") {
      const upload = uploads[chunk[1]];
      const offset = Number(headers["upload-offset"]);
      if (offset !== upload.received) return json(route, 409, { error: { code: "offset_mismatch", message: "x" } });
      upload.received += request.postDataBuffer().length;
      return json(route, 200, { id: chunk[1], received_bytes: upload.received, size_bytes: upload.size, status: "open" });
    }
    const done = path.match(/^\/uploads\/([^/]+)\/complete$/);
    if (done) return json(route, 201, { media: { id: "m1", kind: "photo", status: "processing", size_bytes: uploads[done[1]].size, duration_ms: null, blurred: false, exif_removed: false, created_at: "2026-12-05T09:16:02+01:00" }, client_media_id: done[1].slice(3) });
    if (path.startsWith("/reports/") && method === "GET") return json(route, 200, { id: "8d0c", media: [] });
    return json(route, 404, { error: { code: "not_found", message: "Not in the test" } });
  });
  return log;
}

async function newPage(browser, { signedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 360, height: 760 }, reducedMotion: "reduce" });
  await context.addInitScript(
    ({ code, signedIn }) => {
      if (sessionStorage.getItem("eg.test.init")) return;
      sessionStorage.setItem("eg.test.init", "1");
      localStorage.setItem("eg.locale", "en");
      localStorage.setItem("eg.noticeSeen", "2026-11-22");
      if (signedIn) localStorage.setItem("eg.observer", JSON.stringify({ code, organisation: "Observation group", intake_paused: false, clock_offset_ms: 0, signed_in_at: Date.now() }));
    },
    { code: CODE, signedIn },
  );
  if (process.env.DEBUG_SHOT) await context.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) { console.log("IDBPUT", this.name, value && value.last_step, value && value.category_observer); return put.call(this, value, key); };
    const del = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (key) { console.log("IDBDEL", this.name, String(key)); return del.call(this, key); };
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log("PAGE ERROR", error.message));
  if (process.env.DEBUG_SHOT) page.on("console", (m) => (m.type() === "error" || m.text().startsWith("IDB")) && console.log("CONSOLE", m.text().slice(0, 300)));
  return { context, page };
}

/** Press Tab until the element with this test id has focus. */
async function tabTo(page, testId, max = 25) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate((id) => document.activeElement?.getAttribute("data-testid") === id || document.activeElement?.closest(`[data-testid="${id}"]`) !== null, testId)) return;
  }
  throw new Error(`Could not reach ${testId} with Tab`);
}

async function stepIs(page, step) {
  if (process.env.DEBUG_SHOT) console.log("STEP", step, await page.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open("electraguard", 1); q.onsuccess = () => r(q.result); });
    return new Promise((r) => { const q = db.transaction("drafts").objectStore("drafts").getAll(); q.onsuccess = () => r(JSON.stringify(q.result.map((d) => [d.category_observer, d.last_step, d.media.length]))); });
  }).catch((e) => String(e)));
  try {
    await page.waitForFunction((s) => location.pathname === `/o/new/${s}`, step, { timeout: 10000 });
    // R7: focus moves to the screen question on every step change.
    await page.waitForFunction(() => document.activeElement?.tagName === "H1", null, { timeout: 5000 });
  } catch (error) {
    if (process.env.DEBUG_SHOT) await page.screenshot({ path: process.env.DEBUG_SHOT, fullPage: true });
    throw new Error(`Expected step ${step}, still at ${page.url()}`);
  }
}

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log("PASS", name);
  } catch (error) {
    results.push({ name, ok: false, error: String(error && error.stack ? error.stack.split("\n").slice(0, 3).join(" ") : error) });
    console.log("FAIL", name, error);
  }
}

(async () => {
  const browser = await chromium.launch();

  await test("keyboard flow O-05 to O-11, Back keeps values, send, receipt, resumable upload", async () => {
    const { context, page } = await newPage(browser);
    const log = fakeApi(page);
    await page.goto(`${BASE}/o/new/what`);
    await page.waitForSelector('[data-testid="o05"]');
    // O-05: radio group with arrow keys.
    await page.focus('input[name="category"]');
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
    assert.equal(await page.inputValue('input[name="category"]:checked'), "intimidation_violence");
    await tabTo(page, "continue");
    await page.keyboard.press("Enter");
    await stepIs(page, "danger");
    // O-06: "No" moves on at once.
    await tabTo(page, "o06-answer");
    await page.keyboard.press("ArrowDown");
    await stepIs(page, "where");
    // O-07: the first time, choose the state (its list downloads), then search by code without dashes.
    await page.waitForSelector('[data-testid="polling-unit-picker-state"]:not([disabled])');
    await page.selectOption('[data-testid="polling-unit-picker-state"]', "KN");
    await page.waitForSelector('[data-testid="polling-unit-picker-search"] input:not([disabled])', { timeout: 10000 });
    await page.focus('[data-testid="polling-unit-picker-search"] input');
    await page.keyboard.type("kn0407012");
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="o07-summary"]:has-text("Kantudu Primary School I")');
    await tabTo(page, "continue", 40);
    await page.keyboard.press("Enter");
    await stepIs(page, "when");
    await tabTo(page, "continue");
    await page.keyboard.press("Enter");
    await stepIs(page, "describe");
    await page.focus('[data-testid="o09-text"] textarea, textarea');
    await page.keyboard.type("Young men at the gate told people in the queue to go home.");
    await tabTo(page, "o09-source");
    await page.keyboard.press("Space");
    await tabTo(page, "continue");
    await page.keyboard.press("Enter");
    await stepIs(page, "evidence");
    await page.setInputFiles('[data-testid="media-capture-photo-input"]', { name: "p.png", mimeType: "image/png", buffer: PNG });
    await page.waitForSelector('[data-testid="o10-item"]:has-text("Location removed")', { timeout: 10000 });
    await tabTo(page, "continue", 40);
    await page.keyboard.press("Enter");
    await stepIs(page, "check");
    const summary = await page.textContent('[data-testid="o11"]');
    for (const text of ["Intimidation or violence", "No one in danger", "Kantudu Primary School I", "Young men at the gate", "I saw this myself", "1 item added"]) {
      assert.ok(summary.includes(text), `summary shows ${text}`);
    }
    // Back keeps values, all the way to O-05.
    await page.click('[data-testid="back"]');
    await stepIs(page, "evidence");
    assert.equal(await page.locator('[data-testid="o10-item"]').count(), 1);
    await page.click('[data-testid="back"]');
    await stepIs(page, "describe");
    assert.ok((await page.inputValue("textarea")).startsWith("Young men"));
    await page.click('[data-testid="back"]');
    await stepIs(page, "when");
    await page.click('[data-testid="back"]');
    await stepIs(page, "where");
    assert.ok((await page.textContent('[data-testid="o07-summary"]')).includes("Kantudu"));
    await page.click('[data-testid="back"]');
    await stepIs(page, "danger");
    assert.equal(await page.isChecked('[data-testid="o06-answer-no"] input'), true);
    await page.click('[data-testid="back"]');
    await stepIs(page, "what");
    assert.equal(await page.inputValue('input[name="category"]:checked'), "intimidation_violence");
    // The draft survives a reload.
    if (process.env.DEBUG_SHOT) console.log("BEFORE RELOAD", await page.evaluate(async () => {
        const db = await new Promise((r) => { const q = indexedDB.open("electraguard", 1); q.onsuccess = () => r(q.result); });
        return new Promise((r) => { const q = db.transaction("drafts").objectStore("drafts").getAll(); q.onsuccess = () => r(JSON.stringify(q.result.map((d) => [d.owner, d.category_observer, d.last_step]))); });
      }));
    await page.reload();
    if (process.env.DEBUG_SHOT) {
      await page.waitForTimeout(2000);
      console.log("AFTER RELOAD", page.url(), await page.evaluate(async () => {
        const db = await new Promise((r) => { const q = indexedDB.open("electraguard", 1); q.onsuccess = () => r(q.result); });
        return new Promise((r) => { const q = db.transaction("drafts").objectStore("drafts").getAll(); q.onsuccess = () => r(JSON.stringify(q.result.map((d) => [d.owner, d.category_observer, d.last_step]))); });
      }), await page.evaluate(() => localStorage.getItem("eg.observer")));
      await page.screenshot({ path: process.env.DEBUG_SHOT });
    }
    await page.waitForSelector('input[name="category"]:checked', { state: "attached" });
    // Forward again with the hardware-style history.
    await page.goForward().catch(() => undefined);
    await page.goto(`${BASE}/o/new/check`);
    await page.waitForSelector('[data-testid="o11-send"]');
    await page.click('[data-testid="o11-send"]');
    await page.waitForURL(/\/o\/reports\/8d0c1a52-4f3e-4b9e-9a51-2f6a0f7c3e11\?just-sent/, { timeout: 15000 });
    await page.waitForSelector('[data-testid="receipt-card-code"]:has-text("EG-4H7Q-92KD")');
    await page.waitForSelector('[data-testid="o12-upload"]:has-text("Saved")', { timeout: 15000 });
    const report = log.find((r) => r.method === "POST" && r.path === "/reports");
    assert.match(report.headers["idempotency-key"], /^[0-9a-f-]{36}$/);
    assert.match(report.headers["x-device-time"], /[+-]\d\d:\d\d$/);
    const body = JSON.parse(report.body);
    assert.equal(body.kind, "incident");
    assert.equal(body.category_observer, "intimidation_violence");
    assert.equal(body.danger_now, false);
    assert.equal(body.firsthand, true);
    assert.deepEqual(body.place, { polling_unit_code: "KN-04-07-012", ward_code: "KN-04-07" });
    assert.equal(body.language, "en");
    assert.ok(body.device_saved_at && /[+-]\d\d:\d\d$/.test(body.occurred_at));
    assert.equal(body.input_method, "typed");
    const start = log.find((r) => r.path.endsWith("/uploads") && r.method === "POST");
    const startBody = JSON.parse(start.body);
    assert.equal(startBody.kind, "photo");
    assert.equal(startBody.content_type, "image/jpeg");
    assert.match(startBody.sha256, /^[0-9a-f]{64}$/);
    assert.equal(startBody.purpose, "evidence");
    assert.ok(start.headers["idempotency-key"]);
    const chunks = log.filter((r) => r.method === "PATCH");
    assert.ok(chunks.length >= 1 && chunks[0].headers["upload-offset"] === "0" && chunks[0].headers["content-type"] === "application/offset+octet-stream");
    assert.ok(log.some((r) => r.path.endsWith("/complete") && r.headers["idempotency-key"]));
    // Back from the receipt goes Home, never into the sent draft.
    await page.click('[data-testid="back"]');
    await page.waitForURL(`${BASE}/o`);
    await page.waitForSelector('[data-testid="o04"]');
    assert.equal(await page.locator('[data-testid="o04-draft"]').count(), 0);
    assert.ok((await page.textContent('[data-testid="o04"]')).includes("EG-4H7Q-92KD"));
    await context.close();
  });

  await test("not confirmed: a lost response is retried with the same key, one receipt", async () => {
    const { context, page } = await newPage(browser);
    const keys = [];
    const log = fakeApi(page, {
      report: async (route, entry, n) => {
        keys.push(entry.headers["idempotency-key"]);
        if (n === 1) {
          await route.abort("connectionreset");
          return true;
        }
        return false;
      },
    });
    await seedDraft(page);
    await page.goto(`${BASE}/o/new/check`);
    await page.click('[data-testid="o11-send"]');
    await page.waitForSelector('[data-testid="o11-status-notConfirmed"]', { timeout: 10000 });
    await page.waitForURL(/just-sent/, { timeout: 20000 });
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1], "same Idempotency-Key on retry");
    assert.equal(log.filter((r) => r.method === "POST" && r.path === "/reports").length, 2);
    await context.close();
  });

  await test("offline: Send keeps it on this phone, Home says so, it sends when the network returns", async () => {
    const { context, page } = await newPage(browser);
    const log = fakeApi(page);
    await seedDraft(page);
    await page.goto(`${BASE}/o/new/check`);
    await page.waitForSelector('[data-testid="o11-send"]');
    await context.setOffline(true);
    await page.click('[data-testid="o11-send"]');
    await page.waitForSelector('[data-testid="o11-status-savedOffline"]');
    const text = await page.textContent('[data-testid="o11"]');
    assert.ok(!/\bReceived\b|\bsent\b(?! yet)/.test(text.replace("will send", "")), "never says sent or received");
    await page.waitForURL(`${BASE}/o`, { timeout: 10000 });
    await page.waitForSelector('[data-testid="o04-unsent"]');
    assert.equal(await page.isVisible('[data-testid="network-bar"] >> text=Offline'), true);
    assert.equal(log.filter((r) => r.method === "POST" && r.path === "/reports").length, 0);
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForSelector('[data-testid="o04-unsent"]', { state: "detached", timeout: 15000 });
    assert.equal(log.filter((r) => r.method === "POST" && r.path === "/reports").length, 1);
    await context.close();
  });

  await test("server validation: 422 returns to the draft with the field marked, same key", async () => {
    const { context, page } = await newPage(browser);
    const keys = [];
    fakeApi(page, {
      report: async (route, entry, n) => {
        keys.push(entry.headers["idempotency-key"]);
        if (n === 1) {
          await json(route, 422, { error: { code: "validation_failed", message: "x", fields: { occurred_at: { code: "in_future", message: "x" } } } });
          return true;
        }
        return false;
      },
    });
    await seedDraft(page);
    await page.goto(`${BASE}/o/new/check`);
    await page.click('[data-testid="o11-send"]');
    await page.waitForSelector('[data-testid="o11-status-needsAttention"]', { timeout: 10000 });
    assert.ok((await page.textContent('[data-testid="o11-when"]')).includes("has not happened yet"));
    await page.click('[data-testid="o11-send"]');
    await page.waitForURL(/just-sent/, { timeout: 15000 });
    assert.equal(keys[0], keys[1]);
    await context.close();
  });

  await test("sign in with the setup PIN, then choose a PIN", async () => {
    const { context, page } = await newPage(browser, { signedIn: false });
    const log = fakeApi(page, {
      signIn: (route) => json(route, 200, { status: "pin_setup_required", setup_token: "pst_1", setup_token_expires_at: "2026-12-05T09:20:00+01:00" }),
    });
    await page.goto(`${BASE}/o/start?view=sign-in`);
    await page.fill('[data-testid="o03-code"]', "obs 7k2p9x");
    await page.fill('[data-testid="o03-pin"]', "12345678");
    await page.click('[data-testid="o03-submit"]');
    await page.waitForSelector('[data-testid="o03-set-pin"]');
    const signInBody = JSON.parse(log.find((r) => r.path === "/auth/observer/sign-in").body);
    assert.deepEqual(signInBody, { code: CODE, pin: "12345678" });
    await page.fill('[data-testid="o03-newpin"]', "123456");
    await page.fill('[data-testid="o03-confirmpin"]', "123456");
    await page.click('[data-testid="o03-setpin-submit"]');
    assert.ok((await page.textContent('[data-testid="o03-set-pin"]')).includes("too easy"));
    await page.fill('[data-testid="o03-newpin"]', "482913");
    await page.fill('[data-testid="o03-confirmpin"]', "482913");
    await page.click('[data-testid="o03-setpin-submit"]');
    await page.waitForURL(`${BASE}/o`);
    await page.waitForSelector('[data-testid="o04-pin-saved"]');
    assert.deepEqual(JSON.parse(log.find((r) => r.path === "/auth/observer/pin").body), { setup_token: "pst_1", new_pin: "482913" });
    await context.close();
  });

  await test("a mistyped observer code is caught on the phone (check symbol), no request", async () => {
    const { context, page } = await newPage(browser, { signedIn: false });
    const log = fakeApi(page);
    await page.goto(`${BASE}/o/start?view=sign-in`);
    await page.fill('[data-testid="o03-code"]', "OBS-7K2P9E");
    await page.fill('[data-testid="o03-pin"]', "482913");
    await page.click('[data-testid="o03-submit"]');
    assert.ok((await page.textContent('[data-testid="o03-sign-in"]')).includes("Observer codes look like"));
    assert.equal(log.filter((r) => r.path === "/auth/observer/sign-in").length, 0);
    await context.close();
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length }));
  process.exit(failed.length ? 1 : 0);
})();

/** A complete draft in IndexedDB, as the steps would have saved it. */
async function seedDraft(page) {
  await page.goto(`${BASE}/o/new/what`);
  await page.waitForSelector('[data-testid="o05"]');
  await page.evaluate(async (code) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("electraguard", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const draft = {
      owner: code,
      id: crypto.randomUUID(),
      mode: "observer",
      created_at: Date.now(),
      updated_at: Date.now(),
      last_step: "check",
      category_observer: "queues_crowding",
      access_barrier_details: [],
      danger_now: false,
      place: { polling_unit_code: "KN-04-07-012", ward_code: "KN-04-07", state_code: "KN", lga_code: "KN-04", label: "Kantudu Primary School I, Kantudu, Dala", ward_name: "Kantudu", unknown_unit: false },
      when: { mode: "now" },
      occurred_at: new Date(Date.now() - 60000).toISOString().replace("Z", "+00:00"),
      description: "The queue is very long and there is no shade for older voters.",
      firsthand: true,
      input_method: "typed",
      name_ack_hash: null,
      media: [],
      language: "en",
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").put(draft);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }, CODE);
}
