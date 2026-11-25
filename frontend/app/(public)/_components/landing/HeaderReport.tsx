"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

/**
 * The compact "Report what you saw" button in the header. It exists on the home page only and
 * appears once the hero has scrolled away, so the one action is never out of reach (landing plan
 * §12). On the home page the header also sticks to the top; elsewhere it scrolls as before.
 */
export function HeaderReport({ href, label, className }: { href: string; label: string; className: string }) {
  const pathname = usePathname();
  const home = pathname === "/";
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!home) return;
    const link = ref.current;
    const header = link?.closest("header");
    const hero = document.getElementById("home-hero");
    if (!link || !header || !hero) return;
    header.setAttribute("data-sticky", "");
    const observer = new IntersectionObserver(([entry]) => {
      link.toggleAttribute("data-shown", !entry.isIntersecting && entry.boundingClientRect.bottom < 80);
    });
    observer.observe(hero);
    return () => {
      observer.disconnect();
      header.removeAttribute("data-sticky");
      link.removeAttribute("data-shown");
    };
  }, [home]);

  if (!home) return null;
  return (
    <Link ref={ref} href={href} className={className} data-testid="header-report">
      {label}
    </Link>
  );
}
