"use client";

import { useT } from "../../lib/i18n/client";
import styles from "./Stepper.module.css";

export type StepperProps = {
  current: number;
  total: number;
  "data-testid"?: string;
};

/** "Step 3 of 7" with a thin progress rule. The rule is decorative; the text carries the meaning. */
export function Stepper({ current, total, "data-testid": testId = "stepper" }: StepperProps) {
  const t = useT();
  const safeTotal = Math.max(1, total);
  const step = Math.min(Math.max(1, current), safeTotal);
  return (
    <div className={styles.stepper} data-testid={testId}>
      <p className={`${styles.text} eg-tnum`}>{t("ui.stepper.progress", { current: step, total: safeTotal })}</p>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.fill} style={{ transform: `scaleX(${step / safeTotal})` }} />
      </div>
    </div>
  );
}
