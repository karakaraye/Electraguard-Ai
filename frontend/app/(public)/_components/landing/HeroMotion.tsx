"use client";

import { useEffect, useRef } from "react";
import { sceneMotionFor } from "../living-scene/LivingScene";
import { mountHeroMotion, type HeroMotionClasses, type HeroMotionHandle } from "./heroLayers";
import styles from "./heroMotion.module.css";

declare global {
  interface Window {
    /** For screenshots and tests only: jump the moving hero to a moment. */
    __heroMotion?: HeroMotionHandle;
  }
}

/**
 * The people in the hero, moving (landing plan 4.2 and 6). The server renders an empty stage
 * beside the still picture, so the first paint is the approved still and nothing can mismatch.
 * After the page has loaded and the browser is idle, the layers are fetched and mounted, unless
 * the person asked for reduced motion or Save Data (then nothing more is downloaded). There is
 * no control: the page follows the person's own settings.
 */
export function HeroMotion() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = ref.current;
    const root = stage?.parentElement;
    if (!stage || !root) return;
    let handle: HeroMotionHandle | null = null;
    let idle = 0;
    let timer = 0;

    const stop = () => {
      handle?.destroy();
      handle = null;
      if (window.__heroMotion) delete window.__heroMotion;
    };
    const start = () => {
      stop();
      const level = sceneMotionFor(window);
      stage.setAttribute("data-motion", level);
      if (level === "still") return;
      const frozen = new URLSearchParams(window.location.search).has("hero-frozen");
      handle = mountHeroMotion(stage, root, level, styles as unknown as HeroMotionClasses, { frozen });
      window.__heroMotion = handle;
    };
    const later = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(start, { timeout: 1500 });
      else timer = setTimeout(start, 200) as unknown as number;
    };
    if (document.readyState === "complete") later();
    else window.addEventListener("load", later, { once: true });

    // the phone and desktop pictures differ: rebuild when the page crosses the breakpoint
    const narrow = window.matchMedia("(max-width: 767px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const restart = () => {
      if (handle || stage.getAttribute("data-motion")) start();
    };
    narrow.addEventListener("change", restart);
    reduce.addEventListener("change", restart);

    return () => {
      window.removeEventListener("load", later);
      if (idle) window.cancelIdleCallback(idle);
      if (timer) clearTimeout(timer);
      narrow.removeEventListener("change", restart);
      reduce.removeEventListener("change", restart);
      stop();
    };
  }, []);

  return <div ref={ref} className={styles.stage} aria-hidden="true" data-testid="hero-motion" />;
}
