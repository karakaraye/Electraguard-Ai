"use client";

import type { ReactNode, Ref, SelectHTMLAttributes } from "react";
import { useT } from "../../lib/i18n/client";
import { ChevronDownIcon } from "../icons";
import { FieldFrame } from "./FieldFrame";
import styles from "./Field.module.css";

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  options: SelectOption[];
  /** First, empty option text. Defaults to "Choose one". Pass false to omit it. */
  placeholder?: string | false;
  ref?: Ref<HTMLSelectElement>;
  "data-testid"?: string;
};

/** Native select (best on low-end Android: the system picker is fast and accessible). */
export function Select({ label, hint, error, optional, options, placeholder, id, className, ref, ...rest }: SelectProps) {
  const t = useT();
  return (
    <FieldFrame label={label} hint={hint} error={error} optional={optional} id={id} className={className}>
      {({ id: controlId, describedBy, invalid }) => (
        <div className={styles.selectWrap}>
          <select
            ref={ref}
            id={controlId}
            className={`${styles.control} ${styles.select}`}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...rest}
          >
            {placeholder === false ? null : <option value="">{placeholder ?? t("ui.select.choose")}</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon className={styles.selectIcon} />
        </div>
      )}
    </FieldFrame>
  );
}
