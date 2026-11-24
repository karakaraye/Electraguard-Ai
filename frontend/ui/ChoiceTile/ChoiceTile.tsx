"use client";

import { useId, type ComponentType, type ReactNode } from "react";
import { useT } from "../../lib/i18n/client";
import { AlertIcon, CheckIcon, type IconProps } from "../icons";
import { haptic } from "../motion";
import styles from "./ChoiceTile.module.css";

export type ChoiceOption = {
  value: string;
  label: string;
  /** 40 px category pictogram (see icons/pictograms). */
  pictogram?: ComponentType<IconProps>;
  hint?: string;
  disabled?: boolean;
};

export type ChoiceGroupChrome = {
  /** The question. Rendered as the fieldset legend. */
  legend: ReactNode;
  /** Render the legend as a heading (the screen question is usually <h1>). */
  headingLevel?: 1 | 2;
  hint?: ReactNode;
  error?: ReactNode;
};

export type ChoiceTileGroupProps = ChoiceGroupChrome & {
  name: string;
  options: ChoiceOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Columns from 600 px up (always 2 on phones). */
  columns?: 2 | 3;
  "data-testid"?: string;
};

export function GroupLegend({ legend, headingLevel, hint, hintId }: ChoiceGroupChrome & { hintId?: string }) {
  const Heading = headingLevel === 1 ? "h1" : headingLevel === 2 ? "h2" : null;
  return (
    <>
      <legend className={`${styles.legend} ${Heading ? styles.legendHeading : ""}`}>
        {Heading ? <Heading className={styles.legendText}>{legend}</Heading> : legend}
      </legend>
      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
    </>
  );
}

export function GroupError({ error, id }: { error: ReactNode; id: string }) {
  const t = useT();
  return (
    <p className={styles.error} id={id}>
      <AlertIcon />
      <span>
        <span className="eg-sr-only">{t("ui.errorPrefix")} </span>
        {error}
      </span>
    </p>
  );
}

/**
 * Single-select grid of picture tiles. Built on native radio inputs, so arrow
 * keys, Space and screen readers work as a radio group without extra code.
 * The selected tile gets a 2 px ink border and a tick: never colour alone.
 */
export function ChoiceTileGroup({
  legend,
  headingLevel,
  hint,
  error,
  name,
  options,
  value,
  onChange,
  columns = 3,
  "data-testid": testId = "choice-tiles",
}: ChoiceTileGroupProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <fieldset
      className={styles.group}
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
      data-invalid={error ? "" : undefined}
      data-testid={testId}
    >
      <GroupLegend legend={legend} headingLevel={headingLevel} hint={hint} hintId={hintId} />
      <div className={styles.grid} data-columns={columns}>
        {options.map((option) => {
          const checked = value === option.value;
          const Pictogram = option.pictogram;
          return (
            <label
              key={option.value}
              className={styles.tile}
              data-checked={checked || undefined}
              data-disabled={option.disabled || undefined}
              data-testid={`${testId}-${option.value}`}
            >
              <input
                className={styles.input}
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                disabled={option.disabled}
                onChange={() => {
                  haptic(8);
                  onChange(option.value);
                }}
              />
              <i className={styles.sweep} aria-hidden="true" />
              {Pictogram ? (
                <span className={styles.disc}>
                  <Pictogram size={30} />
                </span>
              ) : null}
              <span className={styles.tileText}>
                <span className={styles.tileLabel}>{option.label}</span>
                {option.hint ? <span className={styles.tileHint}>{option.hint}</span> : null}
              </span>
              <span className={styles.tick} aria-hidden="true">
                <CheckIcon size={14} strokeWidth={3} />
              </span>
            </label>
          );
        })}
      </div>
      {error && errorId ? <GroupError error={error} id={errorId} /> : null}
    </fieldset>
  );
}
