"use client";

import { useEffect, useRef } from "react";
import { formatNumber } from "../../../../lib/i18n";
import { sceneMotionFor } from "../living-scene/LivingScene";

const DURATION = 800;

/**
 * The published total. The server writes the real number, so it reads correctly with scripts off.
 * With full motion it counts up from zero once, when it first scrolls into view (800 ms). The
 * number it ends on is always the real one; only the way it arrives is animated.
 */
export function CountUp({ value, tag, className }: { value: number; tag: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const text = formatNumber(value, tag);

  useEffect(() => {
    const el = ref.current;
    if (!el || value <= 0 || sceneMotionFor(window) !== "full") return;
    let frame = 0;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      const begin = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - begin) / DURATION);
        const eased = 1 - Math.pow(1 - k, 3);
        el.textContent = formatNumber(k < 1 ? Math.round(value * eased) : value, tag);
        if (k < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    el.textContent = formatNumber(0, tag);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          run();
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      el.textContent = formatNumber(value, tag);
    };
  }, [value, tag]);

  return (
    <>
      <span className="eg-sr-only">{text}</span>
      <span ref={ref} className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: text }} />
    </>
  );
}
