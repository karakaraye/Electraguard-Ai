"use client";

import { useEffect, useRef } from "react";
import { SCENE_MARKUP, SCENE_VIEWBOX } from "./scene";
import "./scene-colours.css";
import "./scene-motion.css";

/**
 * How much of the scene moves (landing plan §6):
 * - "full": walkers, the queue, the voter's journey, the observer's report, plus the ambient layer;
 * - "ambient": breathing, swaying trees and birds only (low-power phones);
 * - "still": one composed frame (reduced motion, Save Data, or before the page has loaded).
 */
export type SceneMotion = "full" | "ambient" | "still";

type NavigatorHints = Navigator & {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
};

/** Read the person's own settings and the phone's capacity. Never shown as a control. */
export function sceneMotionFor(win: Window): SceneMotion {
  if (win.matchMedia("(prefers-reduced-motion: reduce)").matches) return "still";
  const nav = win.navigator as NavigatorHints;
  if (nav.connection?.saveData) return "still";
  const memory = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  if (memory <= 2 || cores <= 4) return "ambient";
  return "full";
}

export type LivingSceneProps = {
  /** "day" for the hero; "evening" for the footer (result sheet on the wall, lamps). */
  variant?: "day" | "evening";
  /** Fix the motion level (previews and tests). Otherwise it follows the person's settings. */
  motion?: SceneMotion;
  /** Which part of the wide drawing stays in view when the frame is narrower than the scene. */
  focus?: "xMinYMax" | "xMidYMax" | "xMaxYMax";
  className?: string;
  "data-testid"?: string;
};

/**
 * The polling-day scene with its people moving (landing plan §4.2). Inline SVG, so it paints
 * with the page and needs no extra request; decorative, so it is hidden from screen readers
 * (every idea it shows is also written in the page text). It starts still on the server and
 * switches to its motion level after load, and pauses when off-screen or when the tab is hidden.
 */
export function LivingScene({ variant = "day", motion, focus = "xMidYMax", className, "data-testid": testId = "living-scene" }: LivingSceneProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;

    // Motion level: set on the element, not in React state, so the server markup never differs.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => svg.setAttribute("data-motion", motion ?? sceneMotionFor(window));
    apply();
    reduce.addEventListener("change", apply);

    // Pause when the scene is off-screen or the tab is hidden: it never drains a battery.
    let visible = true;
    const sync = () => svg.toggleAttribute("data-paused", !visible || document.hidden);
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      sync();
    });
    observer.observe(svg);
    document.addEventListener("visibilitychange", sync);

    return () => {
      reduce.removeEventListener("change", apply);
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [motion]);

  return (
    <svg
      ref={ref}
      className={`living-scene${className ? ` ${className}` : ""}`}
      viewBox={SCENE_VIEWBOX}
      preserveAspectRatio={`${focus} slice`}
      data-motion="still"
      data-variant={variant}
      aria-hidden="true"
      focusable="false"
      data-testid={testId}
      dangerouslySetInnerHTML={{ __html: SCENE_MARKUP }}
    />
  );
}
