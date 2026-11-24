/*
 * The splash gate, shared by the server layout (which inlines the script) and the
 * client Splash component (which reads the attribute). No "use client" here.
 */

/** Set once the splash has been seen on this install (spec screen 1). */
export const SPLASH_SEEN_KEY = "eg.splashSeen";

/** Attribute the gate puts on <html> when this visit shows the splash. */
export const SPLASH_ATTR = "data-eg-splash";

/**
 * Runs before first paint (inline, in the observer layout). It decides whether this
 * visit shows the splash, so the screen underneath never flashes first:
 * first-run entry points only, once per install, never for automated tests.
 */
export function splashGateScript(paths: string[]): string {
  return `(function(){try{var p=location.pathname.replace(/\\/+$/,"")||"/";if(${JSON.stringify(
    paths,
  )}.indexOf(p)<0)return;if(navigator.webdriver)return;if(localStorage.getItem(${JSON.stringify(
    SPLASH_SEEN_KEY,
  )}))return;document.documentElement.setAttribute(${JSON.stringify(SPLASH_ATTR)},"");}catch(e){}})();`;
}
