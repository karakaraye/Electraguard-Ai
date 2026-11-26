import Link from "next/link";
import type { ReactNode } from "react";
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

/** Bottom navigation: 56 px plus the safe area, 24 px icons, the current item on a sunk 56 x 32 pill. */
export function BottomNav({ items, label }: BottomNavProps) {
  return (
    <nav className={styles.nav} aria-label={label} data-testid="bottom-nav">
      <ul className={styles.list} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
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
