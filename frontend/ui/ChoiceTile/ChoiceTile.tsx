"use client";

import { useId, type ComponentType, type ReactNode } from "react";
import { useT } from "../../lib/i18n/client";
import { AlertIcon, CheckIcon, type IconProps } from "../icons";
import { haptic } from "../motion";
import styles from "./ChoiceTile.module.css";

export type ChoiceOption = {
  value: string;
  label: string;
  /** Category pictogram (see icons/pictograms), drawn in the tile's icon disc. */
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
  /** Columns from 720 px up. Always one column on phones. */
  columns?: 1 | 2 | 3;
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

export type ChoiceTileProps = {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  description?: ReactNode;
  /** Pictogram or icon drawn in the 40 px disc. Without it the tile has no disc. */
  icon?: ReactNode;
  /** A danger answer: red edge and disc, always with an icon or word. */
  tone?: "danger";
  disabled?: boolean;
  /** Radio by default; "checkbox" for pick-many lists that share the look. */
  type?: "radio" | "checkbox";
  "data-testid"?: string;
};

/**
 * One tile for every choice step: 64 px minimum, an optional icon disc, the label (and a
 * one-line description), and a 24 px tick that fills when chosen. The native input fills the
 * tile, so keyboard, screen readers and arrow keys behave as a normal radio group.
 */
export function ChoiceTile({
  name,
  value,
  checked,
  onChange,
  label,
  description,
  icon,
  tone,
  disabled,
  type = "radio",
  "data-testid": testId,
}: ChoiceTileProps) {
  return (
    <label
      className={styles.tile}
      data-checked={checked || undefined}
      data-disabled={disabled || undefined}
      data-bare={icon ? undefined : ""}
      data-tone={tone}
      data-testid={testId}
    >
      <input
        className={styles.input}
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => {
          haptic(8);
          onChange();
        }}
      />
      {icon ? (
        <span className={styles.disc} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={styles.tileText}>
        <span className={styles.tileLabel}>{label}</span>
        {description ? <span className={styles.tileHint}>{description}</span> : null}
      </span>
      <span className={styles.tick} aria-hidden="true">
        <CheckIcon strokeWidth={2.5} />
      </span>
    </label>
  );
}

/**
 * Single-select list of ChoiceTiles. Built on native radio inputs, so arrow
 * keys, Space and screen readers work as a radio group without extra code.
 * The selected tile gets a 2 px ink edge and a filled tick: never colour alone.
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
  columns = 1,
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
      {/* The error sits under the question, never below a long list where it can be hidden. */}
      {error && errorId ? <GroupError error={error} id={errorId} /> : null}
      <div className={styles.grid} data-columns={columns}>
        {options.map((option) => {
          const Pictogram = option.pictogram;
          return (
            <ChoiceTile
              key={option.value}
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              label={option.label}
              description={option.hint}
              icon={Pictogram ? <Pictogram size={24} /> : undefined}
              data-testid={`${testId}-${option.value}`}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
