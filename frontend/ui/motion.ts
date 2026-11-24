/**
 * One helper for every scripted movement (design spec C1, rule 6).
 * Web Animations API only: no animation library. Movement is skipped, and the
 * final frame applied, when the person prefers reduced motion or the page is hidden.
 */

export type MotionToken = "press" | "fade" | "step" | "sheet" | "exit" | "tick" | "scene";

const DURATIONS: Record<MotionToken, number> = {
  press: 80,
  fade: 160,
  step: 240,
  sheet: 320,
  exit: 200,
  tick: 400,
  scene: 800,
};

const EASINGS = {
  out: "cubic-bezier(0.2, 0, 0, 1)",
  enter: "cubic-bezier(0.05, 0.7, 0.1, 1)",
  exit: "cubic-bezier(0.3, 0, 0.8, 0.15)",
  pop: "cubic-bezier(0.2, 1.4, 0.4, 1)",
  linear: "linear",
} as const;

export type MotionEasing = keyof typeof EASINGS | (string & {});

export type AnimateOptions = {
  /** A duration token name, or milliseconds. Defaults to "step" (240 ms). */
  duration?: MotionToken | number;
  /** A named easing (out, enter, exit, pop, linear) or any CSS easing string. */
  easing?: MotionEasing;
  delay?: number;
  fill?: FillMode;
};

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function resolveEasing(easing: MotionEasing | undefined): string {
  if (!easing) return EASINGS.out;
  return (EASINGS as Record<string, string>)[easing] ?? easing;
}

/**
 * Plays keyframes on an element. Returns the Animation, or null when motion is
 * skipped. When skipped, the last keyframe's values are applied as inline style so
 * the element still ends where the animation would have left it.
 */
export function animate(
  el: Element | null | undefined,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: AnimateOptions = {},
): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== "function") return null;
  const hidden = typeof document !== "undefined" && document.hidden;
  if (prefersReducedMotion() || hidden) {
    applyFinalFrame(el as HTMLElement, keyframes);
    return null;
  }
  const { duration = "step", easing, delay = 0, fill = "both" } = options;
  const ms = typeof duration === "number" ? duration : DURATIONS[duration];
  return (el as HTMLElement).animate(keyframes, { duration: ms, easing: resolveEasing(easing), delay, fill });
}

function applyFinalFrame(el: HTMLElement, keyframes: Keyframe[] | PropertyIndexedKeyframes) {
  let last: Record<string, unknown> | undefined;
  if (Array.isArray(keyframes)) {
    last = keyframes[keyframes.length - 1] as Record<string, unknown> | undefined;
  } else {
    last = {};
    for (const [key, value] of Object.entries(keyframes)) {
      last[key] = Array.isArray(value) ? value[value.length - 1] : value;
    }
  }
  if (!last) return;
  for (const [key, value] of Object.entries(last)) {
    if (key === "offset" || key === "easing" || key === "composite" || value == null) continue;
    const prop = key === "cssFloat" ? "float" : key;
    (el.style as unknown as Record<string, string>)[prop] = String(value);
  }
}

const VIBRATION_KEY = "eg.vibration";

/**
 * Short vibration (Android). Feature-detected: does nothing on iOS, with reduced
 * motion, or when the in-app Vibration setting (localStorage "eg.vibration") is "off".
 * 8 for a choice, [16, 60, 16] for sent or saved, [40] for the danger screen.
 */
export function haptic(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (prefersReducedMotion()) return;
  try {
    if (window.localStorage.getItem(VIBRATION_KEY) === "off") return;
  } catch {
    // Storage can be blocked; vibration then stays on.
  }
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw without a user gesture. Ignore.
  }
}

/*
 * Pause every running CSS animation while the page is hidden (spec C1 rule 4):
 * nothing loops in the background and drains the battery. Installed once, on the client.
 */
let visibilityInstalled = false;
if (typeof document !== "undefined" && !visibilityInstalled) {
  visibilityInstalled = true;
  const root = document.documentElement;
  const sync = () => root.toggleAttribute("data-page-hidden", document.hidden);
  // Wait until the page has loaded so React hydration never sees these attributes.
  const install = () => {
    sync();
    document.addEventListener("visibilitychange", sync);
  };
  if (document.readyState === "complete") window.setTimeout(install, 0);
  else window.addEventListener("load", install, { once: true });
}
