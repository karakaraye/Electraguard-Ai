"use client";

import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { FieldFrame } from "./FieldFrame";
import styles from "./Field.module.css";

export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "children"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  /** Tabular figures for codes, PINs and numbers. */
  numeric?: boolean;
  ref?: Ref<HTMLInputElement>;
  "data-testid"?: string;
};

/** Text input with label above, hint under the label and error under the field. */
export function Field({ label, hint, error, optional, numeric, id, className, ref, ...input }: FieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error} optional={optional} id={id} className={className}>
      {({ id: controlId, describedBy, invalid }) => (
        <input
          ref={ref}
          id={controlId}
          className={`${styles.control} ${numeric ? "eg-tnum" : ""}`}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          {...input}
        />
      )}
    </FieldFrame>
  );
}
