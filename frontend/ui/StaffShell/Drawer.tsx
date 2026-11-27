"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Drawer.module.css";

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  children: ReactNode;
};

/** A sheet that slides in from the left edge, on the native modal <dialog> (focus trap, Escape, inert page). */
export function Drawer({ open, onClose, label, children }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      return () => {
        if (dialog.open) dialog.close();
        if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      };
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.drawer}
      aria-label={label}
      data-testid="staff-drawer"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
