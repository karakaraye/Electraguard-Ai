"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Navigation list that marks the current page with aria-current. */
export function NavLinks({ items, className }: { items: Array<{ href: string; label: string }>; className?: string }) {
  const path = usePathname() ?? "/";
  return (
    <ul className={className}>
      {items.map((item) => {
        const current = item.href === "/" ? path === "/" : path === item.href || path.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link href={item.href} aria-current={current ? "page" : undefined}>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
