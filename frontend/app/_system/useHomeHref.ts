"use client";

import { useSyncExternalStore } from "react";

/**
 * Where "Home" should lead from the current address: the observer app stays inside /o (the
 * only scope that works offline), staff stay inside /s, everyone else goes to the public home.
 */
export function homeFor(pathname: string): string {
  if (pathname === "/o" || pathname.startsWith("/o/")) return "/o";
  if (pathname === "/s" || pathname.startsWith("/s/")) return "/s/queue";
  return "/";
}

const never = () => () => {};

/** The server and the first browser render both say "/", so the markup agrees; the real target follows. */
export function useHomeHref(): string {
  return useSyncExternalStore(never, () => homeFor(window.location.pathname), () => "/");
}
