"use client";

import { useId, type ReactNode } from "react";
import { useT } from "../../lib/i18n/client";
import { ChoiceTile, GroupError, GroupLegend, type ChoiceGroupChrome } from "../ChoiceTile/ChoiceTile";
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
  /** Icon for the No answer, drawn in the same disc as yesIcon. */
  noIcon?: ReactNode;
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
  noIcon,
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
    { key: "no", label: noLabel ?? t("ui.no"), answer: false, icon: noIcon, tone: undefined },
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
        {choices.map((choice) => (
          <ChoiceTile
            key={choice.key}
            name={name}
            value={choice.key}
            checked={value === choice.answer}
            disabled={disabled}
            tone={choice.tone}
            onChange={() => onChange(choice.answer)}
            label={choice.label}
            icon={choice.icon}
            data-testid={`${testId}-${choice.key}`}
          />
        ))}
      </div>
    </fieldset>
  );
}
