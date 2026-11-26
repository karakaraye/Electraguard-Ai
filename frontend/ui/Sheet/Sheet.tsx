"use client";

import { Children, Fragment, isValidElement, useEffect, useId, useRef, type ReactElement, type ReactNode } from "react";
import { useT } from "../../lib/i18n/client";
import { Button } from "../Button/Button";
import { CloseIcon } from "../icons";
import styles from "./Sheet.module.css";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Short text under the title. */
  description?: ReactNode;
  children?: ReactNode;
  /**
   * Actions pinned to the bottom of the sheet. One pattern everywhere: the secondary
   * (Cancel, quiet or secondary Button) comes first, then the confirm button (primary or danger),
   * side by side, wrapping onto two lines only when the labels need the room. The sheet enforces
   * this order whatever order the caller writes the buttons in, so no screen can drift from it.
   */
  footer?: ReactNode;
  /**
   * The phone's Back button closes the sheet before leaving the screen
   * (hackathon plan 4.12). Adds one history entry while open.
   */
  closeOnBrowserBack?: boolean;
  "data-testid"?: string;
};

const SHEET_STATE = "egSheet";

/** Flattens fragments so the footer's buttons can be put in the one agreed order. */
function flatten(node: ReactNode): ReactNode[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child) && child.type === Fragment ? flatten((child as ReactElement<{ children?: ReactNode }>).props.children) : [child],
  );
}

/** 0 = secondary actions (Cancel), 1 = the confirm action. */
function rank(child: ReactNode): number {
  if (isValidElement(child) && child.type === Button) {
    const variant = (child as ReactElement<{ variant?: string }>).props.variant;
    return variant === "secondary" || variant === "quiet" ? 0 : 1;
  }
  return 1;
}

function orderFooter(footer: ReactNode): ReactNode[] {
  return flatten(footer)
    .map((child, index) => ({ child, index }))
    .sort((a, b) => rank(a.child) - rank(b.child) || a.index - b.index)
    .map(({ child }) => child);
}

/**
 * A closing sheet steps back out of its history entry one tick later, so that a sheet which
 * unmounts and mounts again at once (React runs effects twice in development) keeps its entry
 * instead of the late step-back closing it.
 */
const pendingBack = new Map<string, number>();

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
      const pending = pendingBack.get(id);
      if (pending !== undefined) {
        // Mounted again straight after closing: the entry is still there, so keep it.
        window.clearTimeout(pending);
        pendingBack.delete(id);
      } else {
        window.history.pushState({ ...(window.history.state ?? {}), [SHEET_STATE]: id }, "");
      }
      window.addEventListener("popstate", onPop);
    }

    return () => {
      if (closeOnBrowserBack) {
        window.removeEventListener("popstate", onPop);
        if (!poppedByBrowser && window.history.state?.[SHEET_STATE] === id) {
          pendingBack.set(
            id,
            window.setTimeout(() => {
              pendingBack.delete(id);
              if (window.history.state?.[SHEET_STATE] === id) window.history.back();
            }, 0),
          );
        }
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
        {footer ? <div className={styles.footer}>{orderFooter(footer)}</div> : null}
      </div>
    </dialog>
  );
}
