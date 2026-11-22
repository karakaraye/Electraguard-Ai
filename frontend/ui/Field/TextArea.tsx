"use client";

import { useState, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";
import { useT } from "../../lib/i18n/client";
import { FieldFrame } from "./FieldFrame";
import styles from "./Field.module.css";

export type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "children" | "maxLength"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  /** Character limit. Shows "n of max characters" and warns screen readers near the end. */
  maxLength?: number;
  ref?: Ref<HTMLTextAreaElement>;
  "data-testid"?: string;
};

const NEAR_LIMIT = 20;

/** Multi-line text with a visible character count. Grows with its content where supported. */
export function TextArea({
  label,
  hint,
  error,
  optional,
  maxLength,
  id,
  className,
  rows = 5,
  value,
  defaultValue,
  onChange,
  ref,
  ...rest
}: TextAreaProps) {
  const t = useT();
  const [ownLength, setOwnLength] = useState(() => String(defaultValue ?? "").length);
  const length = value !== undefined ? String(value).length : ownLength;
  const remaining = maxLength !== undefined ? maxLength - length : undefined;
  const near = remaining !== undefined && remaining <= NEAR_LIMIT;

  const footer =
    maxLength !== undefined ? (
      <div className={styles.countRow}>
        <span className={`${styles.count} eg-tnum`} data-near={near || undefined} aria-hidden="true">
          {t("ui.textarea.count", { count: length, max: maxLength })}
        </span>
        <span className="eg-sr-only" aria-live="polite">
          {near ? t("ui.textarea.remaining", { remaining: Math.max(0, remaining ?? 0) }) : ""}
        </span>
      </div>
    ) : null;

  return (
    <FieldFrame label={label} hint={hint} error={error} optional={optional} id={id} className={className} footer={footer}>
      {({ id: controlId, describedBy, invalid }) => (
        <textarea
          ref={ref}
          id={controlId}
          rows={rows}
          className={`${styles.control} ${styles.textarea}`}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          onChange={(event) => {
            setOwnLength(event.target.value.length);
            onChange?.(event);
          }}
          {...rest}
        />
      )}
    </FieldFrame>
  );
}
