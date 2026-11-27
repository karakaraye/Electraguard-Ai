"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

/**
 * Navigation list that marks the current page with aria-current. With `hereLabel` the current
 * row also says so in words (the phone menu), for people who do not read the bar.
 */
export function NavLinks({
  items,
  className,
  hereLabel,
  onNavigate,
  indicatorClassName,
}: {
  items: Array<{ href: string; label: string }>;
  className?: string;
  hereLabel?: string;
  onNavigate?: () => void;
  /** Wide bar only: a 24 px ink bar that slides (200 ms, transform only) to the current item. */
  indicatorClassName?: string;
}) {
  const path = usePathname() ?? "/";
  const list = useRef<HTMLUListElement>(null);
  const [bar, setBar] = useState<{ x: number; ready: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!indicatorClassName) return;
    const place = () => {
      const current = list.current?.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!current || !list.current || current.offsetWidth === 0) return setBar(null);
      const x = current.offsetLeft + current.offsetWidth / 2 - 12;
      setBar((before) => ({ x, ready: before !== null }));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [path, indicatorClassName]);
  return (
    <ul className={className} ref={list} data-bar={bar ? "" : undefined} style={indicatorClassName ? { position: "relative" } : undefined}>
      {indicatorClassName ? (
        <span
          aria-hidden="true"
          className={indicatorClassName}
          data-ready={bar?.ready || undefined}
          style={{ transform: `translateX(${bar?.x ?? 0}px)`, opacity: bar ? 1 : 0 }}
        />
      ) : null}
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
