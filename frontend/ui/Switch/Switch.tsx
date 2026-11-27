"use client";

import styles from "./Switch.module.css";

export type SwitchProps = {
  checked: boolean;
  /** Called when the person flips it. The caller decides the new value. */
  onToggle: () => void;
  /** Id of the element that names the switch. Use this or `aria-label`. */
  labelledBy?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  /** "danger" turns the on state red, for switches that stop something (pause intake). */
  tone?: "ink" | "danger";
  /** Waiting on the server: shown dimmed, not clickable. */
  busy?: boolean;
  disabled?: boolean;
  "data-testid"?: string;
};

/**
 * One on/off switch. Off: white knob on a pale track with a clear edge. On: ink
 * track, white knob. The button is 44 px square so a thumb always hits it.
 */
export function Switch({
  checked,
  onToggle,
  labelledBy,
  tone = "ink",
  busy,
  disabled,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  "data-testid": testId,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      aria-busy={busy || undefined}
      className={styles.switch}
      data-tone={tone}
      disabled={disabled || busy}
      onClick={onToggle}
      data-testid={testId}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    </button>
  );
}
