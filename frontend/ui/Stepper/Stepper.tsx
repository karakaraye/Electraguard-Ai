"use client";

import { useEffect } from "react";
import { useT } from "../../lib/i18n/client";
import styles from "./Stepper.module.css";

export type StepperProps = {
  current: number;
  total: number;
  /** The step the person came from, so the progress grows from there (see useStepTravel). */
  from?: number;
  "data-testid"?: string;
};

/*
 * Each report step is its own page, so the shell mounts afresh on every step. This remembers the
 * step just left, long enough to bridge the route change, so the new step knows which way the
 * person is travelling. It is forgotten as soon as the flow is left.
 */
let lastStep = 0;
let forget: number | undefined;

/** The previous step and the direction of travel (+1 forward, -1 back, 0 none) for a step shell. */
export function useStepTravel(step: number): { from: number; direction: -1 | 0 | 1 } {
  const from = lastStep;
  useEffect(() => {
    window.clearTimeout(forget);
    lastStep = step;
    return () => {
      forget = window.setTimeout(() => {
        lastStep = 0;
      }, 600);
    };
  }, [step]);
  return { from, direction: from > 0 && step !== from ? (step > from ? 1 : -1) : 0 };
}

/** "Step 3 of 7" and "Saved on this phone", over one segment per step. The rule is decorative; the text carries the meaning. */
export function Stepper({ current, total, from, "data-testid": testId = "stepper" }: StepperProps) {
  const t = useT();
  const safeTotal = Math.max(1, total);
  const step = Math.min(Math.max(1, current), safeTotal);
  return (
    <div className={styles.stepper} data-testid={testId}>
      <div className={styles.head}>
        <p className={`${styles.text} eg-tnum`}>{t("ui.stepper.progress", { current: step, total: safeTotal })}</p>
        <p className={styles.saved}>{t("ui.stepper.saved")}</p>
      </div>
      <div className={styles.track} aria-hidden="true">
        {Array.from({ length: safeTotal }, (_, i) => {
          const n = i + 1;
          return (
            <span
              key={n}
              className={styles.seg}
              data-on={n <= step || undefined}
              data-grow={from && from !== step && n <= Math.max(step, from) && n > Math.min(step, from) ? "" : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
