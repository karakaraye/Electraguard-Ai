"use client";

import { useId } from "react";
import { useT } from "../../lib/i18n/client";
import { GroupError, GroupLegend, type ChoiceGroupChrome } from "../ChoiceTile/ChoiceTile";
import { Field } from "../Field/Field";
import { fromWat, useNow, watParts } from "../hooks";
import { AlertIcon, CheckIcon, ClockIcon } from "../icons";
import styles from "./WhenPicker.module.css";

export type WhenMode = "now" | "today" | "day";

export type WhenValue = { mode: WhenMode; date?: string; time?: string };

export type WhenPickerProps = Omit<ChoiceGroupChrome, "legend" | "error"> & {
  legend?: ChoiceGroupChrome["legend"];
  name: string;
  value: WhenValue;
  onChange: (value: WhenValue) => void;
  /** Show "required" errors (after the person presses Continue). Future times always show. */
  showErrors?: boolean;
  /** "Another day" needs a time too (REP-01 occurred_at is a full date and time). */
  requireDayTime?: boolean;
  /** Earliest date allowed (YYYY-MM-DD, WAT). */
  minDate?: string;
  /** Current time used for the future check (corrected by the server clock). Defaults to the phone clock. */
  now?: number | null;
  "data-testid"?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The observed time as an instant (epoch ms), or null when incomplete.
 * Times are West Africa Time; "Another day" without a time means noon that day.
 */
export function whenToInstant(value: WhenValue, now: number = Date.now()): number | null {
  if (value.mode === "now") return now;
  if (value.mode === "today") {
    if (!value.time) return null;
    return fromWat(watParts(now).date, value.time);
  }
  if (!value.date) return null;
  return fromWat(value.date, value.time || "12:00");
}

export type WhenProblem = "future" | "timeRequired" | "dateRequired" | null;

export function whenProblem(value: WhenValue, now: number = Date.now(), requireDayTime = false): WhenProblem {
  if (value.mode === "today" && !value.time) return "timeRequired";
  if (value.mode === "day" && !value.date) return "dateRequired";
  if (value.mode === "day" && requireDayTime && !value.time) return "timeRequired";
  const instant = whenToInstant(value, now);
  if (instant !== null && instant > now + 60_000) return "future";
  return null;
}

/**
 * When did it happen? Just now (default) / Earlier today / Another day, then
 * native time and date inputs. Always labelled West Africa Time. Future times
 * are blocked by the input limits and by validation.
 */
export function WhenPicker({
  legend,
  headingLevel,
  hint,
  name,
  value,
  onChange,
  showErrors,
  requireDayTime,
  minDate,
  now: nowOverride,
  "data-testid": testId = "when-picker",
}: WhenPickerProps) {
  const t = useT();
  const id = useId();
  const phoneNow = useNow();
  const now = nowOverride === undefined ? phoneNow : nowOverride;
  const today = now !== null ? watParts(now) : null;
  const problem = now !== null ? whenProblem(value, now, requireDayTime) : null;
  const visibleProblem = problem === "future" || showErrors ? problem : null;
  const olderThanWeek =
    value.mode === "day" && value.date && now !== null && now - fromWat(value.date, value.time || "12:00") > 7 * DAY_MS;

  const errorText =
    visibleProblem === "future"
      ? t("ui.when.future")
      : visibleProblem === "timeRequired"
        ? t("ui.when.required")
        : visibleProblem === "dateRequired"
          ? t("ui.when.dateRequired")
          : null;
  const errorId = `${id}-error`;

  const modes: { mode: WhenMode; label: string; detail?: string }[] = [
    { mode: "now", label: t("ui.when.justNow"), detail: today ? `${today.time} WAT` : undefined },
    { mode: "today", label: t("ui.when.earlierToday") },
    { mode: "day", label: t("ui.when.anotherDay") },
  ];

  return (
    <fieldset className={styles.group} data-testid={testId} aria-describedby={errorText ? errorId : undefined}>
      <GroupLegend legend={legend ?? t("ui.when.legend")} headingLevel={headingLevel} hint={hint} />
      {/* The error sits under the question, never below a long list where it can be hidden. */}
      {errorText ? <GroupError error={errorText} id={errorId} /> : null}
      <div className={styles.modes}>
        {modes.map((option) => {
          const checked = value.mode === option.mode;
          return (
            <label key={option.mode} className={styles.mode} data-checked={checked || undefined} data-testid={`${testId}-${option.mode}`}>
              <input
                className={styles.input}
                type="radio"
                name={name}
                value={option.mode}
                checked={checked}
                onChange={() => onChange({ mode: option.mode, date: value.date, time: value.time })}
              />
              <span className={styles.radio} aria-hidden="true">
                <CheckIcon size={14} strokeWidth={2.75} />
              </span>
              <span className={styles.modeText}>
                <span className={styles.modeLabel}>{option.label}</span>
                {option.detail ? <span className={`${styles.modeDetail} eg-tnum`}>{option.detail}</span> : null}
              </span>
            </label>
          );
        })}
      </div>

      {value.mode !== "now" ? (
        <div className={styles.inputs}>
          {value.mode === "day" ? (
            <Field
              label={t("ui.when.date")}
              type="date"
              numeric
              max={today?.date}
              min={minDate}
              value={value.date ?? ""}
              onChange={(event) => onChange({ ...value, date: event.target.value })}
              aria-invalid={visibleProblem === "dateRequired" || visibleProblem === "future" || undefined}
              data-testid={`${testId}-date`}
            />
          ) : null}
          <Field
            label={value.mode === "day" && !requireDayTime ? t("ui.when.timeOptional") : t("ui.when.time")}
            type="time"
            numeric
            max={value.mode === "today" || value.date === today?.date ? today?.time : undefined}
            value={value.time ?? ""}
            onChange={(event) => onChange({ ...value, time: event.target.value })}
            aria-invalid={visibleProblem === "timeRequired" || visibleProblem === "future" || undefined}
            data-testid={`${testId}-time`}
          />
        </div>
      ) : null}

      <p className={styles.zone}>
        <ClockIcon size={20} />
        <span>{t("ui.when.zone")}</span>
      </p>

      {olderThanWeek && !errorText ? (
        <p className={styles.note} role="status">
          <AlertIcon size={20} />
          <span>{t("ui.when.olderThanWeek")}</span>
        </p>
      ) : null}

    </fieldset>
  );
}
