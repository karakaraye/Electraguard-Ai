"use client";

import { useLocale, useT } from "../../lib/i18n/client";
import { formatNumber, localeTags } from "../../lib/i18n";
import styles from "./MetricTile.module.css";

export type MetricTileProps = {
  label: string;
  /** null while the number is not available yet. */
  value: number | null;
  /** "Since 08:00 WAT", "Last hour". */
  period?: string;
  /**
   * Public privacy threshold: values from 1 to threshold-1 show "fewer than
   * {threshold}" instead of the number (hackathon plan 5.6). 0 is shown as 0.
   */
  threshold?: number;
  /** Text shown while value is null. */
  pendingText?: string;
  "data-testid"?: string;
};

/** A big number with its label and period. Plain: no gradients, no trend arrows. */
export function MetricTile({ label, value, period, threshold, pendingText, "data-testid": testId = "metric-tile" }: MetricTileProps) {
  const t = useT();
  const { locale } = useLocale();
  const suppressed = threshold !== undefined && value !== null && value > 0 && value < threshold;
  return (
    <div className={styles.tile} data-testid={testId}>
      <p className={styles.label}>{label}</p>
      <p className={`${styles.value} eg-tnum`} data-suppressed={suppressed || undefined}>
        {value === null
          ? (pendingText ?? "-")
          : suppressed
            ? t("ui.metric.fewerThan", { threshold: threshold! })
            : formatNumber(value, localeTags[locale])}
      </p>
      {period ? <p className={styles.period}>{period}</p> : null}
    </div>
  );
}
