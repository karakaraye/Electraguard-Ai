"use client";

import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import styles from "./SegmentedControl.module.css";

export type SegmentedOption = { value: string; label: string };

export type SegmentedControlProps = {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  /** "sun" is the tinted thumb used on public pages. */
  tone?: "paper" | "sun";
  /** Names the group for screen readers. */
  label: string;
  "data-testid"?: string;
};

/** Tabs pattern: a track with a thumb that slides to the chosen option. */
export function SegmentedControl({
  options,
  value,
  onChange,
  tone = "paper",
  label,
  "data-testid": testId = "segmented",
}: SegmentedControlProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const move = (event: KeyboardEvent, from: number) => {
    let next = from;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (from + 1) % options.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (from - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      className={styles.track}
      role="tablist"
      aria-label={label}
      data-tone={tone}
      style={{ "--count": options.length, "--index": index } as CSSProperties}
      data-testid={testId}
    >
      <span className={styles.thumb} aria-hidden="true" />
      {options.map((option, i) => {
        const selected = i === index;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            data-selected={selected || undefined}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, i)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
