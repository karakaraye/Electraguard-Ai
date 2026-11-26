"use client";

import { useEffect, useRef } from "react";
import { animate } from "../motion";
import styles from "./OutboxBadge.module.css";

export type OutboxBadgeProps = {
  count: number;
  state?: "waiting" | "sending" | "failed";
  onClick?: () => void;
  /** Accessible name, for example "2 reports waiting to send". Already translated. */
  label: string;
  "data-testid"?: string;
};

/** Envelope with a 16 px count at its top right. Hidden at 0. The count bumps when it goes up; the ring turns round the count while sending; the count is red when sending failed. */
export function OutboxBadge({ count, state = "waiting", onClick, label, "data-testid": testId = "outbox-badge" }: OutboxBadgeProps) {
  const dot = useRef<HTMLSpanElement>(null);
  const previous = useRef(count);

  useEffect(() => {
    if (count > previous.current) {
      animate(
        dot.current,
        [{ transform: "scale(0.6)" }, { transform: "scale(1.25)", offset: 0.6 }, { transform: "scale(1)" }],
        { duration: 300, easing: "pop" },
      );
    }
    previous.current = count;
  }, [count]);

  if (count <= 0) return null;

  return (
    <button type="button" className={styles.badge} onClick={onClick} aria-label={label} data-state={state} data-testid={testId}>
      <span className={styles.envelope}>
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
