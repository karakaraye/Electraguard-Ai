import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./BottomNav.module.css";

export type BottomNavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  current?: boolean;
  /** Needs-you count. Shown as a dot with a number. */
  badge?: number;
  /** Words for the badge in the accessible name, for example "2 need you". Already translated. */
  badgeLabel?: string;
};

export type BottomNavProps = {
  items: BottomNavItem[];
  /** Accessible name of the landmark (message ui.nav.main). */
  label: string;
};

/** Three-item bottom navigation, 70px tall, with a needs-you badge. */
export function BottomNav({ items, label }: BottomNavProps) {
  return (
    <nav className={styles.nav} aria-label={label} data-testid="bottom-nav">
      <ul className={styles.list} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => (
          <li key={`${item.href}-${item.label}`}>
            <Link href={item.href} className={styles.link} aria-current={item.current ? "page" : undefined}>
              <span className={styles.icon} aria-hidden="true">
                {item.icon}
                {item.badge ? <span className={`${styles.badge} eg-tnum`}>{item.badge}</span> : null}
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
