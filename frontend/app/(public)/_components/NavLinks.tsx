"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navigation list that marks the current page with aria-current. With `hereLabel` the current
 * row also says so in words (the phone menu), for people who do not read the bar.
 */
export function NavLinks({
  items,
  className,
  hereLabel,
  onNavigate,
}: {
  items: Array<{ href: string; label: string }>;
  className?: string;
  hereLabel?: string;
  onNavigate?: () => void;
}) {
  const path = usePathname() ?? "/";
  return (
    <ul className={className}>
      {items.map((item) => {
        const current = item.href === "/" ? path === "/" : path === item.href || path.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link href={item.href} aria-current={current ? "page" : undefined} onClick={onNavigate}>
              <span>{item.label}</span>
              {current && hereLabel ? <small>{hereLabel}</small> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
