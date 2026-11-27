// Recording helpers: slow, deliberate pacing, a visible tap marker, one video file per clip.
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { BASE, knownPhone, launch } from "./common.mjs";

export const OUT = process.env.EG_VIDEO_OUT ?? "C:/Users/Windows/Desktop/CAIRN/.worktrees/demo-video";
export const CLIPS = join(OUT, "clips");
export const STATE = join(OUT, "state");
mkdirSync(CLIPS, { recursive: true });
mkdirSync(STATE, { recursive: true });

export const DESKTOP = { width: 1280, height: 720 }; // upscaled to 1920x1080 when the clips are joined
export const PHONE = { width: 390, height: 844 };

const marker = () => {
  // A soft ring that follows the pointer so viewers can see where the reviewer or observer taps.
  const ring = document.createElement("div");
  Object.assign(ring.style, { position: "fixed", width: "26px", height: "26px", marginLeft: "-13px", marginTop: "-13px", borderRadius: "50%", border: "3px solid #e8be28", background: "rgba(232,190,40,.25)", zIndex: 2147483647, pointerEvents: "none", transition: "transform .12s", left: "-50px", top: "-50px" });
  const add = () => document.documentElement.appendChild(ring);
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", add);
  else add();
  addEventListener("mousemove", (e) => { ring.style.left = e.clientX + "px"; ring.style.top = e.clientY + "px"; }, true);
  addEventListener("mousedown", () => { ring.style.transform = "scale(.6)"; }, true);
  addEventListener("mouseup", () => { ring.style.transform = "scale(1)"; }, true);
};

/** Run one clip: opens a recording context, runs the scene, closes the context and names the file. */
export async function clip(name, { phone = false, storageState } = {}, scene) {
  const browser = await launch();
  const size = phone ? PHONE : DESKTOP;
  const tmp = join(OUT, "tmp-" + name);
  rmSync(tmp, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: size, recordVideo: { dir: tmp, size }, storageState, reducedMotion: "no-preference",
    ...(phone ? { hasTouch: false, isMobile: false, deviceScaleFactor: 1 } : {}),
  });
  await knownPhone(context);
  await context.addInitScript(marker);
  const page = await context.newPage();
  const started = Date.now();
  try {
    await scene(page, context);
    await page.waitForTimeout(1200);
  } finally {
    await context.close();
    await browser.close();
  }
  const file = readdirSync(tmp).find((f) => f.endsWith(".webm"));
  renameSync(join(tmp, file), join(CLIPS, `${name}.webm`));
  rmSync(tmp, { recursive: true, force: true });
  console.log(`clip ${name}: ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

export const beat = (page, ms = 1400) => page.waitForTimeout(ms);

/** Move the pointer to an element, rest on it, then click. */
export async function tap(page, target, { rest = 500, after = 900 } = {}) {
  const locator = typeof target === "string" ? page.locator(target).first() : target;
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await page.waitForTimeout(rest);
  await locator.click();
  await page.waitForTimeout(after);
}

export async function typeSlowly(page, target, text, delay = 55) {
  const locator = typeof target === "string" ? page.locator(target).first() : target;
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
  await locator.pressSequentially(text, { delay });
  await page.waitForTimeout(600);
}

/** Sign in without recording and keep the session for a clip that starts signed in. */
export async function stateFor(key, signIn) {
  const browser = await launch();
  const context = await browser.newContext({ viewport: DESKTOP });
  await knownPhone(context);
  const page = await context.newPage();
  await signIn(page);
  const path = join(STATE, `${key}.json`);
  await context.storageState({ path });
  await browser.close();
  return path;
}

export { BASE };
