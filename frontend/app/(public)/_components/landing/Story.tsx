"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { sceneMotionFor } from "../living-scene/LivingScene";
import "../../../../ui/motion";

/**
 * "How a report travels" (landing plan §4.3). The server renders four steps, each a drawing and
 * its plain sentence, stacked: that is the finished page with scripts off or motion off.
 *
 * With full motion this adds the movement on top, by setting attributes on the DOM nodes:
 *  - wide screens (pinned): the section sticks for about two and a half screens. One scroll
 *    listener (passive, once per frame) works out the progress, writes it to a CSS variable on the
 *    report-path line and marks the step that is playing ([data-active]);
 *  - phones and short windows (stacked): nothing sticks; each step plays once when it comes into view.
 * Reduced motion, Save Data and low-power phones leave the still pictures in place.
 */
export function Story({ className, labelledBy, children }: { className: string; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const steps = Array.from(root.querySelectorAll<HTMLElement>("[data-story-step]"));
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-story-node]"));
    const line = root.querySelector<HTMLElement>("[data-story-line]");
    const sticky = root.querySelector<HTMLElement>("[data-story-sticky]");
    const track = root.querySelector<HTMLElement>("[data-story-track]");
    const wide = window.matchMedia("(min-width: 900px) and (min-height: 560px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let teardown: (() => void) | null = null;

    const clear = () => {
      steps.forEach((step) => {
        step.removeAttribute("data-on");
        step.removeAttribute("data-active");
      });
      nodes.forEach((node) => node.removeAttribute("data-active"));
      root.removeAttribute("data-pin");
      root.style.removeProperty("--head-h");
      line?.style.removeProperty("--p");
    };

    const setup = () => {
      teardown?.();
      teardown = null;
      clear();
      const motion = sceneMotionFor(window);
      root.setAttribute("data-motion", motion);
      if (motion !== "full") return;

      if (wide.matches && sticky && track) {
        // The header sticks on this page: the section sticks just under it, whatever its height.
        const header = document.querySelector("header");
        root.style.setProperty("--head-h", `${header ? header.getBoundingClientRect().height : 65}px`);
        root.setAttribute("data-pin", "");
        let frame = 0;
        let last = -1;
        let current = -1;
        const update = () => {
          frame = 0;
          const rect = track.getBoundingClientRect();
          const top = parseFloat(getComputedStyle(sticky).top) || 0;
          const range = Math.max(1, rect.height - sticky.offsetHeight);
          const p = Math.min(1, Math.max(0, (top - rect.top) / range));
          if (Math.abs(p - last) > 0.002) {
            last = p;
            // The line reaches node i (of four, evenly spaced) exactly when step i starts: p = i / 4.
            line?.style.setProperty("--p", Math.min(1, (p * 4) / 3).toFixed(3));
          }
          const started = rect.top < window.innerHeight * 0.75 && rect.bottom > 0;
          const next = started ? Math.min(steps.length - 1, Math.floor(p * steps.length)) : -1;
          if (next === current) return;
          current = next;
          steps.forEach((step, i) => {
            step.toggleAttribute("data-active", i === next);
            // A step that has started keeps playing through to its last frame.
            if (i <= next) step.setAttribute("data-on", "");
          });
          nodes.forEach((node, i) => node.toggleAttribute("data-active", i <= next));
        };
        const onScroll = () => {
          if (!frame) frame = requestAnimationFrame(update);
        };
        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });
        teardown = () => {
          window.removeEventListener("scroll", onScroll);
          window.removeEventListener("resize", onScroll);
          if (frame) cancelAnimationFrame(frame);
        };
        return;
      }

      // Stacked: each step plays once, when it comes into view.
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.setAttribute("data-on", "");
            observer.unobserve(entry.target);
          }
        },
        { threshold: 0.35 },
      );
      steps.forEach((step) => {
        const rect = step.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.6 && rect.bottom > 0) step.setAttribute("data-on", "");
        else observer.observe(step);
      });
      teardown = () => observer.disconnect();
    };

    setup();
    wide.addEventListener("change", setup);
    reduce.addEventListener("change", setup);
    return () => {
      teardown?.();
      wide.removeEventListener("change", setup);
      reduce.removeEventListener("change", setup);
    };
  }, []);

  return (
    <section ref={ref} className={className} aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}
