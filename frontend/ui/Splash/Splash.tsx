"use client";

import { useEffect, useRef, useState } from "react";
import { BackgroundArt } from "../BackgroundArt/BackgroundArt";
import { BrandMark } from "../BrandMark/BrandMark";
import { SunRings } from "../SunRings/SunRings";
import { SPLASH_ATTR as ATTR, SPLASH_SEEN_KEY } from "./gate";
import styles from "./Splash.module.css";

export type SplashProps = {
  /** "by Cairn", from the message files. The product name is a brand and is not translated. */
  credit: string;
  /** How long the splash stays when motion is allowed. Never more than 1.2 s (spec I-1). */
  holdMs?: number;
  /** Gallery only: draw the settled splash inside its frame and never leave. */
  preview?: boolean;
};

/**
 * Splash (spec screen 1, interaction I-1): the mark in the sun, the name, the credit and
 * the polling-day scene. Shown at most 1.2 s, once per install; a tap skips it; it never
 * blocks an offline start because the app shell underneath is already rendered.
 * Decorative for assistive technology: the screen underneath is the real first screen.
 */
export function Splash({ credit, holdMs = 1200, preview = false }: SplashProps) {
  const [phase, setPhase] = useState<"show" | "leaving" | "gone">("show");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (preview) return;
    const root = document.documentElement;
    // Not a splash visit: the overlay stays hidden by CSS (it only shows under the attribute).
    if (!root.hasAttribute(ATTR)) return;
    try {
      window.localStorage.setItem(SPLASH_SEEN_KEY, "1");
    } catch {
      // Private mode: the splash may show again next visit, which is harmless.
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timers.current.push(window.setTimeout(() => setPhase("leaving"), reduce ? 400 : Math.min(holdMs, 1200)));
    const current = timers.current;
    return () => current.forEach((id) => window.clearTimeout(id));
  }, [holdMs, preview]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const id = window.setTimeout(() => {
      document.documentElement.removeAttribute(ATTR);
      setPhase("gone");
    }, 320);
    return () => window.clearTimeout(id);
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div
      className={styles.splash}
      data-phase={phase}
      data-preview={preview || undefined}
      aria-hidden="true"
      onClick={preview ? undefined : () => setPhase("leaving")}
      data-testid="splash"
    >
      <div className={styles.centre}>
        <SunRings size={232} rings={3} step={24} ripple className={styles.rings}>
          <BrandMark variant="symbol" size="lg" className={styles.mark} />
        </SunRings>
        <div className={styles.words}>
          <p className={styles.name}>ElectraGuard AI</p>
          <p className={styles.credit}>{credit}</p>
        </div>
      </div>
      <BackgroundArt variant="soft" clear="none" />
    </div>
  );
}
