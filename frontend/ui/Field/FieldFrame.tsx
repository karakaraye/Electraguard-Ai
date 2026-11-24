"use client";

import { useId, type ReactNode } from "react";
import { useT } from "../../lib/i18n/client";
import { AlertIcon } from "../icons";
import styles from "./Field.module.css";

export type FieldFrameProps = {
  label: ReactNode;
  /** Help under the label, before the control. */
  hint?: ReactNode;
  /** Error under the control. Its presence marks the control invalid. */
  error?: ReactNode;
  /** Adds "(optional)" after the label. Required is the default and is not marked. */
  optional?: boolean;
  id?: string;
  className?: string;
  /** Extra content under the control (character count). */
  footer?: ReactNode;
  "data-testid"?: string;
  children: (control: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
};

/** Label above, hint below the label, control, then error with an icon. */
export function FieldFrame({ label, hint, error, optional, id, className, footer, "data-testid": testId, children }: FieldFrameProps) {
  const t = useT();
  const autoId = useId();
  const controlId = id ?? `f${autoId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div
      className={`${styles.field} ${className ?? ""}`}
      data-invalid={error ? "" : undefined}
      aria-invalid={error ? "true" : undefined}
      data-testid={testId}
    >
      <label className={styles.label} htmlFor={controlId}>
        {label}
        {optional ? <span className={styles.optional}> ({t("ui.optional")})</span> : null}
      </label>
      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
      {children({ id: controlId, describedBy, invalid: Boolean(error) })}
      {footer}
      {error ? (
        <p className={styles.error} id={errorId}>
          <AlertIcon />
          <span>
            <span className="eg-sr-only">{t("ui.errorPrefix")} </span>
            {error}
          </span>
        </p>
      ) : null}
    </div>
  );
}
