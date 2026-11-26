"use client";

import { useRef, type ReactNode } from "react";
import { useScrolled } from "../../../ui/hooks";
import styles from "./shell.module.css";

/**
 * The sticky 64 px header. A 1 px rule appears under it only after the page has scrolled
 * a few pixels (a sentinel at the top of the page leaves the viewport), so the hero stays calm.
 */
export function HeaderFrame({ children }: { children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const scrolled = useScrolled(sentinel);
  return (
    <>
      <div ref={sentinel} className={styles.sentinel} aria-hidden="true" />
      <header className={styles.top} data-scrolled={scrolled || undefined}>
        {children}
      </header>
    </>
  );
}
