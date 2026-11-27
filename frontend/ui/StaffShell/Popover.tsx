"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./Popover.module.css";

export type StaffPopoverProps = {
  /** The button that opens it. Gets aria props and the click handler. */
  trigger: (props: {
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "dialog";
    "aria-controls": string;
  }) => ReactNode;
  /** Receives a close function. */
  children: (close: () => void) => ReactNode;
  /** Where the panel opens relative to the trigger. */
  placement?: "below-start" | "below-end" | "above-start";
  label: string;
  className?: string;
  "data-testid"?: string;
};

/** A small floating panel: closes on Escape, on an outside click and when focus leaves it. */
export function StaffPopover({ trigger, children, placement = "below-start", label, className, "data-testid": testId }: StaffPopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  // Set when the panel was closed from inside; the effect below then hands focus back to the button.
  const [returnFocus, setReturnFocus] = useState(false);
  useEffect(() => {
    if (open || !returnFocus) return;
    rootRef.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
    const id = window.setTimeout(() => setReturnFocus(false), 0);
    return () => window.clearTimeout(id);
  }, [open, returnFocus]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setReturnFocus(true);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`${styles.root} ${className ?? ""}`}>
      {trigger({
        onClick: () => setOpen((value) => !value),
        "aria-expanded": open,
        "aria-haspopup": "dialog",
        "aria-controls": id,
      })}
      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={styles.panel}
          data-placement={placement}
          data-testid={testId}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (next && !rootRef.current?.contains(next)) setOpen(false);
          }}
        >
          {children(() => {
            setOpen(false);
            setReturnFocus(true);
          })}
        </div>
      ) : null}
    </div>
  );
}
