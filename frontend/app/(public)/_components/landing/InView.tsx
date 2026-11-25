"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { sceneMotionFor } from "../living-scene/LivingScene";
import "../../../../ui/motion";

export type InViewProps = {
  className?: string;
  children: ReactNode;
  /** true: `data-in` is set the first time the box is seen and stays. false: it follows visibility, so loops pause off-screen. */
  once?: boolean;
  /** Mouse only: moving the pointer onto the box plays its one-time motion again. */
  replayOnHover?: boolean;
  "data-testid"?: string;
};

/**
 * Motion switch for one box (landing plan §6). The server markup is the finished, still picture.
 * After load this sets two attributes on the DOM node (never React state, so nothing can mismatch):
 *   data-motion  "full" | "ambient" | "still", from the person's own settings and the phone's capacity;
 *   data-in      present while (or once) the box is on screen.
 * The CSS starts a drawing's motion only under [data-motion="full"], and holds it until [data-in].
 */
export function InView({ className, children, once = true, replayOnHover = false, "data-testid": testId }: InViewProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => el.setAttribute("data-motion", sceneMotionFor(window));
    apply();
    reduce.addEventListener("change", apply);

    const show = (on: boolean) => {
      if (on) el.setAttribute("data-in", "");
      else if (!once) el.removeAttribute("data-in");
    };
    // Set at once when already on screen, so a box that starts in view never flashes its first frame.
    const first = el.getBoundingClientRect();
    show(first.top < window.innerHeight * 0.9 && first.bottom > 0);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) show(entry.isIntersecting);
        if (once && el.hasAttribute("data-in")) observer.disconnect();
      },
      { threshold: 0.25 },
    );
    observer.observe(el);

    const replay = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || el.getAttribute("data-motion") !== "full") return;
      el.removeAttribute("data-in");
      void el.offsetWidth;
      el.setAttribute("data-in", "");
    };
    if (replayOnHover) el.addEventListener("pointerenter", replay);

    return () => {
      reduce.removeEventListener("change", apply);
      observer.disconnect();
      el.removeEventListener("pointerenter", replay);
    };
  }, [once, replayOnHover]);

  return (
    <div ref={ref} className={className} data-testid={testId}>
      {children}
    </div>
  );
}
