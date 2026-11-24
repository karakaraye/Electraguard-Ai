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

/** Envelope with a count. Hidden at 0. The count bumps when it goes up. */
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
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="m3 8 9 6 9-6" />
      </svg>
      {state === "sending" ? <span className={styles.ring} aria-hidden="true" /> : null}
      <span ref={dot} className={styles.dot} aria-hidden="true">
        {state === "failed" ? (
          <svg width="10" height="10" viewBox="0 0 16 16" focusable="false">
            <path d="M8 1.5 15 14.25H1z" fill="currentColor" />
          </svg>
        ) : (
          count
        )}
      </span>
    </button>
  );
}
