"use client";

import type { ReactNode } from "react";
import { useT } from "../../lib/i18n/client";
import { Button } from "../Button/Button";
import { CheckIcon } from "../icons";
import { StatusShape } from "../StatusBadge/StatusBadge";
import styles from "./SuggestionCard.module.css";

export type SuggestionState = "pending" | "accepted" | "corrected";

export type SuggestionCardProps = {
  /** What is being suggested: "Category", "Urgency". */
  field: string;
  /** The suggested value. */
  value: ReactNode;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  state?: SuggestionState;
  /** The reviewer's value after a correction. */
  correctedValue?: ReactNode;
  onAccept?: () => void;
  onCorrect?: () => void;
  /** While the decision is being saved. */
  saving?: boolean;
  "data-testid"?: string;
};

/**
 * Machine suggestion for a reviewer. Always labelled "Suggested", never shown
 * as a decision; a person accepts or corrects it.
 */
export function SuggestionCard({
  field,
  value,
  confidence,
  reasons,
  state = "pending",
  correctedValue,
  onAccept,
  onCorrect,
  saving,
  "data-testid": testId = "suggestion-card",
}: SuggestionCardProps) {
  const t = useT();
  return (
    <section className={styles.card} data-state={state} data-testid={testId} aria-label={`${t("ui.suggestion.label")}: ${field}`}>
      <p className={styles.eyebrow}>{t("ui.suggestion.notDecided")}</p>
      <div className={styles.head}>
        <span className={styles.flag}>
          <StatusShape tone="info" size={14} />
          {t("ui.suggestion.label")}
        </span>
        <span className={styles.field}>{field}</span>
      </div>

      <p className={styles.value} data-struck={state === "corrected" || undefined}>
        {value}
      </p>
      {state === "corrected" && correctedValue ? <p className={styles.value}>{correctedValue}</p> : null}

      <p className={styles.confidence}>{t("ui.suggestion.confidence", { level: confidence })}</p>

      {reasons.length ? (
        <div className={styles.reasons}>
          <p className={styles.reasonsTitle}>{t("ui.suggestion.reasons")}</p>
          <ul className={styles.reasonList}>
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state === "pending" ? (
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onAccept} loading={saving} data-testid={`${testId}-accept`}>
            {t("ui.suggestion.accept")}
          </Button>
          <Button variant="quiet" onClick={onCorrect} disabled={saving} data-testid={`${testId}-correct`}>
            {t("ui.suggestion.correct")}
          </Button>
        </div>
      ) : (
        <p className={styles.decision} role="status">
          <CheckIcon size={18} />
          {state === "accepted" ? t("ui.suggestion.accepted") : t("ui.suggestion.corrected")}
        </p>
      )}
    </section>
  );
}
