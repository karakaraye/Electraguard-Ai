"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useT } from "../../lib/i18n/client";
import { CloseIcon } from "../icons";
import styles from "./Sheet.module.css";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Short text under the title. */
  description?: ReactNode;
  children?: ReactNode;
  /** Actions pinned to the bottom of the sheet. */
  footer?: ReactNode;
  /**
   * The phone's Back button closes the sheet before leaving the screen
   * (hackathon plan 4.12). Adds one history entry while open.
   */
  closeOnBrowserBack?: boolean;
  "data-testid"?: string;
};

const SHEET_STATE = "egSheet";

/**
 * Bottom sheet on phones, centred dialog from 600 px. Built on the native modal
 * <dialog>: the rest of the page is inert, Escape closes it, and focus returns
 * to whatever opened it. The Close button is always visible.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeOnBrowserBack = true,
  "data-testid": testId = "sheet",
}: SheetProps) {
  const t = useT();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();

    let poppedByBrowser = false;
    const onPop = () => {
      poppedByBrowser = true;
      onCloseRef.current();
    };
    if (closeOnBrowserBack) {
      window.history.pushState({ ...(window.history.state ?? {}), [SHEET_STATE]: id }, "");
      window.addEventListener("popstate", onPop);
    }

    return () => {
      if (closeOnBrowserBack) {
        window.removeEventListener("popstate", onPop);
        if (!poppedByBrowser && window.history.state?.[SHEET_STATE] === id) window.history.back();
      }
      if (dialog.open) dialog.close();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, closeOnBrowserBack, id]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.sheet}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-desc` : undefined}
      data-testid={testId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.panel}>
        <span className={styles.grip} aria-hidden="true" />
        <header className={styles.header}>
          <h2 className={styles.title} id={`${id}-title`}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} data-testid={`${testId}-close`}>
            <CloseIcon size={20} />
            <span>{t("ui.close")}</span>
          </button>
        </header>
        <div className={styles.body}>
          {description ? (
            <div className={styles.description} id={`${id}-desc`}>
              {description}
            </div>
          ) : null}
          {children}
        </div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </dialog>
  );
}
