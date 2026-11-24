"use client";

import { useId, type ReactNode } from "react";
import { useT } from "../../lib/i18n/client";
import { GroupError, GroupLegend, type ChoiceGroupChrome } from "../ChoiceTile/ChoiceTile";
import { CheckIcon } from "../icons";
import { haptic } from "../motion";
import styles from "../ChoiceTile/ChoiceTile.module.css";

export type YesNoProps = ChoiceGroupChrome & {
  name: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  /** Override the "Yes" and "No" words (for example "I saw it" / "Someone told me"). */
  yesLabel?: string;
  noLabel?: string;
  /** Icon before the "Yes" label (for example a danger triangle). */
  yesIcon?: ReactNode;
  /** Status outline for the "Yes" answer (never colour alone: pair it with an icon). */
  yesTone?: "danger";
  /** One answer per row on phones (long answers); side by side from 600 px. */
  stacked?: boolean;
  disabled?: boolean;
  "data-testid"?: string;
};

/** Two large answers, announced and operated as a radio group. */
export function YesNo({
  legend,
  headingLevel,
  hint,
  error,
  name,
  value,
  onChange,
  yesLabel,
  noLabel,
  yesIcon,
  yesTone,
  stacked,
  disabled,
  "data-testid": testId = "yes-no",
}: YesNoProps) {
  const t = useT();
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const choices = [
    { key: "yes", label: yesLabel ?? t("ui.yes"), answer: true, icon: yesIcon, tone: yesTone },
    { key: "no", label: noLabel ?? t("ui.no"), answer: false, icon: undefined, tone: undefined },
  ];
  return (
    <fieldset
      className={styles.group}
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
      aria-invalid={error ? true : undefined}
      data-invalid={error ? "" : undefined}
      disabled={disabled}
      data-testid={testId}
    >
      <GroupLegend legend={legend} headingLevel={headingLevel} hint={hint} hintId={hintId} />
      {/* The error sits under the question, never below a long list where it can be hidden. */}
      {error && errorId ? <GroupError error={error} id={errorId} /> : null}
      <div className={styles.yesNo} data-stacked={stacked || undefined}>
        {choices.map((choice) => {
          const checked = value === choice.answer;
          return (
            <label
              key={choice.key}
              className={styles.tile}
              data-checked={checked || undefined}
              data-disabled={disabled || undefined}
              data-tone={choice.tone}
              data-testid={`${testId}-${choice.key}`}
            >
              <input
                className={styles.input}
                type="radio"
                name={name}
                value={choice.key}
                checked={checked}
                onChange={() => {
                  haptic(8);
                  onChange(choice.answer);
                }}
              />
              <i className={styles.sweep} aria-hidden="true" />
              {choice.icon ? (
                <span className={styles.answerIcon} aria-hidden="true">
                  {choice.icon}
                </span>
              ) : null}
              <span className={styles.tileText}>
                <span className={styles.tileLabel}>{choice.label}</span>
              </span>
              <span className={styles.tick} aria-hidden="true">
                <CheckIcon size={14} strokeWidth={3} />
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
