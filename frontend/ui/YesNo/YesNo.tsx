"use client";

import { useId } from "react";
import { useT } from "../../lib/i18n/client";
import { GroupError, GroupLegend, type ChoiceGroupChrome } from "../ChoiceTile/ChoiceTile";
import { CheckIcon } from "../icons";
import styles from "../ChoiceTile/ChoiceTile.module.css";

export type YesNoProps = ChoiceGroupChrome & {
  name: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  /** Override the "Yes" and "No" words (for example "I saw it" / "Someone told me"). */
  yesLabel?: string;
  noLabel?: string;
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
  disabled,
  "data-testid": testId = "yes-no",
}: YesNoProps) {
  const t = useT();
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const choices = [
    { key: "yes", label: yesLabel ?? t("ui.yes"), answer: true },
    { key: "no", label: noLabel ?? t("ui.no"), answer: false },
  ];
  return (
    <fieldset
      className={styles.group}
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
      data-invalid={error ? "" : undefined}
      disabled={disabled}
      data-testid={testId}
    >
      <GroupLegend legend={legend} headingLevel={headingLevel} hint={hint} hintId={hintId} />
      <div className={styles.yesNo}>
        {choices.map((choice) => {
          const checked = value === choice.answer;
          return (
            <label
              key={choice.key}
              className={styles.tile}
              data-checked={checked || undefined}
              data-disabled={disabled || undefined}
              data-testid={`${testId}-${choice.key}`}
            >
              <input
                className={styles.input}
                type="radio"
                name={name}
                value={choice.key}
                checked={checked}
                onChange={() => onChange(choice.answer)}
              />
              <span className={styles.tileText}>
                <span className={styles.tileLabel}>{choice.label}</span>
              </span>
              <span className={styles.tick} aria-hidden="true">
                <CheckIcon size={16} strokeWidth={2.5} />
              </span>
            </label>
          );
        })}
      </div>
      {error && errorId ? <GroupError error={error} id={errorId} /> : null}
    </fieldset>
  );
}
