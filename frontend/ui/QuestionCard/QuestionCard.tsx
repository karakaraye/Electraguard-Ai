"use client";

import { useId } from "react";
import { Button } from "../Button/Button";
import { CheckIcon } from "../icons";
import styles from "./QuestionCard.module.css";

export type QuestionCardProps = {
  /** For example "Reviewer question - 09:41". Already translated and formatted. */
  eyebrow: string;
  question: string;
  /** Label of the answer field ("Your answer"). */
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sendLabel: string;
  sending?: boolean;
  sent?: boolean;
  /** Shown after sending ("Sent. The reviewer will see it."). */
  sentText?: string;
  maxLength?: number;
  "data-testid"?: string;
};

/** The one thing that needs the observer: a gold-wash card with the question and an answer field. */
export function QuestionCard({
  eyebrow,
  question,
  label,
  value,
  onChange,
  onSend,
  sendLabel,
  sending,
  sent,
  sentText,
  maxLength = 2000,
  "data-testid": testId = "question-card",
}: QuestionCardProps) {
  const id = useId();
  const empty = value.trim().length === 0;
  return (
    <section className={styles.card} aria-labelledby={`${id}-q`} data-testid={testId} data-sent={sent || undefined}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <p className={styles.question} id={`${id}-q`}>
        {question}
      </p>
      {sent ? (
        <p className={styles.sent} role="status">
          <span className={styles.sentIcon} aria-hidden="true">
            <CheckIcon size={14} strokeWidth={3} />
          </span>
          {sentText}
        </p>
      ) : (
        <>
          <label className={styles.label} htmlFor={`${id}-a`}>
            {label}
          </label>
          <textarea
            id={`${id}-a`}
            className={styles.field}
            value={value}
            maxLength={maxLength}
            rows={3}
            onChange={(event) => onChange(event.target.value)}
            data-testid={`${testId}-field`}
          />
          <Button onClick={onSend} disabled={empty} loading={sending} data-testid={`${testId}-send`}>
            {sendLabel}
          </Button>
        </>
      )}
    </section>
  );
}
