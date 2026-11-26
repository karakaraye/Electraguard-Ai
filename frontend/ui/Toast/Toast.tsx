"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { animate } from "../motion";
import styles from "./Toast.module.css";

export type ToastOptions = {
  text: string;
  /** An action such as Undo. The toast then stays for 5 seconds instead of 4. */
  actionLabel?: string;
  onAction?: () => void;
};

type ToastApi = { show: (toast: ToastOptions) => void; dismiss: () => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Returns show() and dismiss(). Outside a ToastProvider it does nothing, so components stay usable alone. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { show: () => {}, dismiss: () => {} };
}

type Active = ToastOptions & { id: number };

/**
 * One toast at a time: ink fill, bottom of the screen above the action bar, 4 seconds
 * (5 with an action). Announced politely. A new toast replaces the one showing.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Active | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const counter = useRef(0);
  const elRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setActive(null);
  }, []);

  const show = useCallback((toast: ToastOptions) => {
    window.clearTimeout(timer.current);
    counter.current += 1;
    setActive({ ...toast, id: counter.current });
    timer.current = window.setTimeout(() => setActive(null), toast.actionLabel ? 5000 : 4000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!active) return;
    const anim = animate(
      elRef.current,
      [
        { opacity: 0, transform: "translateY(24px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: "sheet", easing: "enter" },
    );
    return () => anim?.cancel();
  }, [active]);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="status" aria-live="polite" aria-atomic="true">
        {active ? (
          <div key={active.id} ref={elRef} className={styles.toast} data-testid="toast">
            <span className={styles.text}>{active.text}</span>
            {active.actionLabel ? (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  active.onAction?.();
                  dismiss();
                }}
              >
                {active.actionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
