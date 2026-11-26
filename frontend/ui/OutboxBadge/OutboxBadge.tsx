"use client";

import { useEffect, useRef } from "react";
import { animate, prefersReducedMotion } from "../motion";
import styles from "./OutboxBadge.module.css";

export type OutboxBadgeProps = {
  count: number;
  state?: "waiting" | "sending" | "failed";
  onClick?: () => void;
  /** Accessible name, for example "2 reports waiting to send". Already translated. */
  label: string;
  /**
   * Where a report was just saved from (the Send button's box). An envelope flies from there to this
   * badge (480 ms) and the count bumps as it lands. Leave out when nothing was just saved.
   */
  flyFrom?: DOMRect | null;
  "data-testid"?: string;
};

/** Envelope with a 16 px count at its top right. Hidden at 0. The count bumps when it goes up; the ring turns round the count while sending; the count is red when sending failed. */
export function OutboxBadge({ count, state = "waiting", onClick, label, flyFrom, "data-testid": testId = "outbox-badge" }: OutboxBadgeProps) {
  const dot = useRef<HTMLSpanElement>(null);
  const icon = useRef<HTMLSpanElement>(null);
  const previous = useRef(count);
  const flown = useRef<DOMRect | null>(null);

  useEffect(() => {
    const bump = () =>
      animate(dot.current, [{ transform: "scale(1)" }, { transform: "scale(1.3)", offset: 0.45 }, { transform: "scale(1)" }], { duration: 200, easing: "out" });
    let flight: Animation | null = null;
    let envelope: HTMLElement | null = null;
    if (flyFrom && flyFrom !== flown.current && icon.current) {
      flown.current = flyFrom;
      const to = icon.current.getBoundingClientRect();
      if (to.width > 0 && !prefersReducedMotion() && !document.hidden) {
        envelope = document.createElement("div");
        envelope.setAttribute("aria-hidden", "true");
        envelope.innerHTML =
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="m3 8 9 6 9-6"/></svg>';
        Object.assign(envelope.style, { position: "fixed", left: "0", top: "0", width: "24px", height: "24px", color: "var(--ink)", zIndex: "9999", pointerEvents: "none", willChange: "transform, opacity" });
        document.body.appendChild(envelope);
        const x0 = flyFrom.left + flyFrom.width / 2 - 12;
        const y0 = flyFrom.top + flyFrom.height / 2 - 12;
        const x1 = to.left + to.width / 2 - 12;
        const y1 = to.top + to.height / 2 - 12;
        // It rises from the button first, then arcs up and across to the badge.
        const midX = x0 + (x1 - x0) * 0.5;
        const midY = Math.max(8, y1 + (y0 - y1) * 0.4 - 36);
        flight = envelope.animate(
          [
            { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 },
            { transform: `translate(${midX}px, ${midY}px) scale(0.85)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${x1}px, ${y1}px) scale(0.5)`, opacity: 0.2 },
          ],
          { duration: 480, easing: "cubic-bezier(0.77, 0, 0.175, 1)", fill: "forwards" },
        );
        // The count has changed already for assistive tech; the bump marks the landing.
        let landedAlready = false;
        const landed = () => {
          landedAlready = true;
          envelope?.remove();
          bump();
        };
        flight.finished.then(landed, () => envelope?.remove());
        previous.current = count;
        return () => {
          // Cut short (the effect ran again before the envelope landed): allow it to be started afresh.
          if (!landedAlready) flown.current = null;
          flight?.cancel();
          envelope?.remove();
        };
      }
    }
    if (count > previous.current) bump();
    previous.current = count;
  }, [count, flyFrom]);

  if (count <= 0) return null;

  return (
    <button type="button" className={styles.badge} onClick={onClick} aria-label={label} data-state={state} data-testid={testId}>
      <span ref={icon} className={styles.envelope}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="m3 8 9 6 9-6" />
        </svg>
        <span ref={dot} className={`${styles.dot} eg-tnum`} aria-hidden="true">
          {state === "sending" ? <span className={styles.ring} /> : null}
          {count > 99 ? "99+" : count}
        </span>
      </span>
    </button>
  );
}
