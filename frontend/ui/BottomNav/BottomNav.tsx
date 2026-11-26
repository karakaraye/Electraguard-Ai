"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Count } from "../Count/Count";
import styles from "./BottomNav.module.css";

export type BottomNavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  current?: boolean;
  /** The one action of the bar (Report): always the ink pill, never "current". */
  primary?: boolean;
  /** Needs-you count, drawn with the one Count component. */
  badge?: number;
  /** Words for the badge in the accessible name, for example "2 need you". Already translated. */
  badgeLabel?: string;
};

export type BottomNavProps = {
  items: BottomNavItem[];
  /** Accessible name of the landmark (message ui.nav.main). */
  label: string;
};

/*
 * Every screen mounts its own bar, so the pill's last place is remembered across the route change
 * (and forgotten a moment after the bar goes away for good) and the new bar slides from there.
 */
let lastPill: { x: number; y: number } | null = null;
let forgetPill: number | undefined;

/** Bottom navigation: 56 px plus the safe area, 24 px icons, the current item on a sunk 56 x 32 pill. */
export function BottomNav({ items, label }: BottomNavProps) {
  const list = useRef<HTMLUListElement>(null);
  const placed = useRef(false);
  // The sunk pill slides (200 ms, transform only) from the old item's icon to the new one.
  const [pill, setPill] = useState<{ x: number; y: number; ready: boolean } | null>(null);
  const currentKey = items.find((item) => item.current && !item.primary)?.href;
  useLayoutEffect(() => {
    window.clearTimeout(forgetPill);
    let frame = 0;
    const place = () => {
      const icon = list.current?.querySelector<HTMLElement>('a[aria-current="page"] > span');
      if (!icon || !list.current) return setPill(null);
      const a = icon.getBoundingClientRect();
      const b = list.current.getBoundingClientRect();
      if (a.width === 0) return setPill(null);
      const next = { x: Math.round(a.left - b.left), y: Math.round(a.top - b.top) };
      if (placed.current) {
        setPill({ ...next, ready: true });
      } else {
        placed.current = true;
        const from = lastPill && (lastPill.x !== next.x || lastPill.y !== next.y) ? lastPill : null;
        if (from) {
          // Start where the last screen's pill was, then slide on the next frame.
          setPill({ ...from, ready: false });
          frame = window.requestAnimationFrame(() => {
            frame = window.requestAnimationFrame(() => setPill({ ...next, ready: true }));
          });
        } else {
          setPill({ ...next, ready: false });
        }
      }
      lastPill = next;
    };
    place();
    window.addEventListener("resize", place);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      forgetPill = window.setTimeout(() => {
        lastPill = null;
      }, 600);
    };
  }, [currentKey, items.length]);
  return (
    <nav className={styles.nav} aria-label={label} data-testid="bottom-nav">
      <ul
        ref={list}
        className={styles.list}
        data-slide={pill ? "" : undefined}
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {pill ? (
          <li
            aria-hidden="true"
            className={styles.pill}
            data-ready={pill.ready || undefined}
            style={{ transform: `translate(${pill.x}px, ${pill.y}px)` }}
          />
        ) : null}
        {items.map((item) => (
          <li key={`${item.href}-${item.label}`}>
            <Link
              href={item.href}
              className={styles.link}
              data-primary={item.primary || undefined}
              aria-current={item.current && !item.primary ? "page" : undefined}
            >
              <span className={styles.icon} aria-hidden="true">
                {item.icon}
                {item.badge ? <Count value={item.badge} tone="needs" className={styles.badge} /> : null}
              </span>
              <span className={styles.label}>{item.label}</span>
              {item.badge && item.badgeLabel ? <span className="eg-sr-only">{item.badgeLabel}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
