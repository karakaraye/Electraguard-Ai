// Records the moving hero on the real home page and checks the motion rules (landing plan 6).
//
//   node record.js <outDir> [all|video|frames|checks]
//
// HERO_URL (default http://localhost:3415/) is the running site; the browser is the newest
// Playwright headless shell. Writes hero-loop-<w>x<h>.webm (one 36 s loop), key frames, and checks.json.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '../../../../../frontend/node_modules/playwright'));

const pw = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const shell = fs.readdirSync(pw).filter((d) => d.startsWith('chromium_headless_shell-')).sort((a, b) => +a.split('-')[1] - +b.split('-')[1]).pop();
const exe = path.join(pw, shell, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
const out = process.argv[2];
const mode = process.argv[3] || 'all';
const URL = process.env.HERO_URL || 'http://localhost:3415/';
const VIEWS = [[1440, 900, 'desktop'], [390, 844, 'phone']];
const LIVE = '[data-testid="hero-motion"][data-live]';
const ART = '[data-testid="home-art"]';
const LAYER = /\/art\/hero-motion\//;
fs.mkdirSync(out, { recursive: true });

async function watchConsole(page, bag) {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') bag.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => bag.push(`pageerror: ${e.message}`));
}

async function artIntoView(page, tag, offset) {
  if (tag !== 'phone') return;
  await page.evaluate(([sel, off]) => { const r = document.querySelector(sel).getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - off); }, [ART, offset]);
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch({ executablePath: exe });
  const res = { console: [] };
  if (mode === 'all' || mode === 'video') {
    for (const [w, h, tag] of VIEWS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, recordVideo: { dir: out, size: { width: w, height: h } } });
      const page = await ctx.newPage();
      await watchConsole(page, res.console);
      await page.goto(URL);
      await page.waitForSelector(LIVE, { state: 'attached', timeout: 60000 });
      await artIntoView(page, tag, 260);
      await page.evaluate(() => { window.__heroMotion.seek(0); document.getAnimations().forEach((a) => a.play()); });
      await page.waitForTimeout(37000);
      const v = page.video();
      await ctx.close();
      fs.renameSync(await v.path(), path.join(out, `hero-loop-${w}x${h}.webm`));
      console.log('video', tag);
    }
  }
  if (mode === 'all' || mode === 'frames') {
    const times = (process.env.TIMES || '0,1.2,4.5,8.2,9.4,12.8,16,19.2,22,27.5,29.4,31,34').split(',').map(Number);
    for (const [w, h, tag] of VIEWS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await watchConsole(page, res.console);
      // the still alone, as reduced motion shows it
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(URL);
      await page.waitForLoadState('load'); await page.waitForFunction(() => { const i = document.querySelector("[data-testid=home-art] img"); return i && i.complete && i.naturalWidth > 0; });
      await artIntoView(page, tag, 100);
      let box = await page.locator(ART).boundingBox();
      await page.screenshot({ path: path.join(out, `${tag}-still.png`), clip: box });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(URL + '?hero-frozen');
      await page.waitForSelector(LIVE, { state: 'attached', timeout: 60000 });
      await artIntoView(page, tag, 100);
      box = await page.locator(ART).boundingBox();
      for (const t of times) {
        await page.evaluate((t) => window.__heroMotion.seek(t), t);
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(out, `${tag}-t${String(t).replace('.', '_')}.png`), clip: box });
      }
      await page.screenshot({ path: path.join(out, `${tag}-page.png`) });
      // the first frame against the still: hide the layers and compare
      await page.evaluate(() => window.__heroMotion.seek(0));
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(out, `${tag}-first-live.png`), clip: box });
      await page.evaluate(() => { document.querySelector('[data-testid="hero-motion"]').style.display = 'none'; });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(out, `${tag}-first-still.png`), clip: box });
      await ctx.close();
      console.log('frames', tag);
    }
  }
  if (mode === 'all' || mode === 'checks') {
    const requestsFor = async (ctxOpts, init, tag) => {
      const ctx = await browser.newContext(ctxOpts);
      if (init) await ctx.addInitScript(init);
      const page = await ctx.newPage();
      await watchConsole(page, res.console);
      const urls = [];
      page.on('request', (r) => urls.push(r.url()));
      await page.goto(URL);
      await page.waitForLoadState('load'); await page.waitForFunction(() => { const i = document.querySelector("[data-testid=home-art] img"); return i && i.complete && i.naturalWidth > 0; });
      await page.waitForTimeout(3000);
      const motion = await page.getAttribute('[data-testid="hero-motion"]', 'data-motion');
      const live = await page.$(LIVE);
      await ctx.close();
      return { tag, motion, live: Boolean(live), layerRequests: urls.filter((u) => LAYER.test(u)).length };
    };
    res.reducedMotion = await requestsFor({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, null, 'desktop');
    res.reducedMotionPhone = await requestsFor({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }, null, 'phone');
    res.saveData = await requestsFor({ viewport: { width: 1440, height: 900 } }, () => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }), 'desktop');
    res.lowPower = await requestsFor({ viewport: { width: 390, height: 844 } }, () => { Object.defineProperty(navigator, 'deviceMemory', { value: 2 }); Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4 }); }, 'phone');
    for (const [w, h, tag, dpr] of [[1440, 900, 'desktop', 1], [1440, 900, 'desktop-2x', 2], [390, 844, 'phone', 3]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
      const page = await ctx.newPage();
      await watchConsole(page, res.console);
      const bytes = [];
      page.on('response', async (r) => { try { const u = r.url(); if (/\/art\/hero|hero-motion/.test(u)) { const enc = (await r.allHeaders())['content-length']; bytes.push([u, enc ? +enc : (await r.body()).length]); } } catch (e) {} });
      await page.goto(URL);
      await page.waitForSelector(LIVE, { state: 'attached', timeout: 60000 });
      await page.waitForTimeout(1500);
      const kb = Math.round(bytes.reduce((a, [, b]) => a + b, 0) / 1024);
      const t1 = await page.evaluate(() => window.__heroMotion.time());
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1200);
      const ta = await page.evaluate(() => window.__heroMotion.time());
      await page.waitForTimeout(1000);
      const tb = await page.evaluate(() => window.__heroMotion.time());
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(800);
      const tc = await page.evaluate(() => window.__heroMotion.time());
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForTimeout(300);
      const h1 = await page.evaluate(() => window.__heroMotion.time());
      await page.waitForTimeout(800);
      const h2 = await page.evaluate(() => window.__heroMotion.time());
      res['full-' + tag] = { heroKB: kb, files: bytes.length, running: t1 > 0, stoppedOffscreen: Math.abs(tb - ta) < 0.001, resumed: tc > tb, stoppedWhenHidden: Math.abs(h2 - h1) < 0.001, sheets: [...new Set(bytes.map(([u]) => (u.match(/@(\dx)/) || [])[1]).filter(Boolean))] };
      await ctx.close();
    }
    // the words and buttons never change while the people move
    for (const [w, h, tag] of VIEWS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.goto(URL + '?hero-frozen');
      await page.waitForSelector(LIVE, { state: 'attached', timeout: 60000 });
      const rects = await page.evaluate(() => {
        const sky = document.querySelector('#home-hero h1').parentElement, outR = [];
        [...sky.children].forEach((e) => {
          const els = e.querySelectorAll('a').length && e.tagName !== 'P' ? [...e.querySelectorAll('a')] : [e];
          els.forEach((el) => {
            const rg = document.createRange(); rg.selectNodeContents(el);
            const qs = el.tagName === 'A' ? [el.getBoundingClientRect()] : [...rg.getClientRects()];
            qs.forEach((q) => { if (q.width > 1) outR.push({ x: Math.max(0, q.left - 16), y: Math.max(0, q.top - 16 + window.scrollY), width: q.width + 32, height: q.height + 32 }); });
          });
        });
        return outR;
      });
      fs.mkdirSync(path.join(out, 'textcheck'), { recursive: true });
      let widest = 0;
      for (const t of [0, 1.5, 3, 4.5, 6.5, 9, 11.5, 13, 17, 19.5, 22, 25, 29, 34]) {
        await page.evaluate((t) => window.__heroMotion.seek(t), t);
        await page.waitForTimeout(80);
        widest = Math.max(widest, await page.evaluate(() => document.documentElement.scrollWidth));
        await page.screenshot({ path: path.join(out, 'textcheck', `${tag}-t${t}.png`), clip: { x: 0, y: 0, width: w, height: h } });
      }
      res['sideways-' + tag] = { viewport: w, widestPage: widest, scrollsSideways: widest > w };
      fs.writeFileSync(path.join(out, 'textcheck', `${tag}-rects.json`), JSON.stringify(rects));
      await ctx.close();
    }
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(res, null, 1));
    console.log(JSON.stringify(res, null, 1));
  }
  await browser.close();
})();
