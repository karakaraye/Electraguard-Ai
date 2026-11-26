"use client";

import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

/**
 * Light only. While this is set, every screen renders light and the stored choice is
 * ignored. The dark and device-follow tokens stay in tokens.css for later; set this to
 * null to bring the stored preference back.
 */
export const THEME_LOCK: ThemePreference | null = "light";

const STORAGE_KEY = "eg.theme";
const listeners = new Set<() => void>();
let memory: ThemePreference | null = null;

function isTheme(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function read(): ThemePreference | null {
  if (memory) return memory;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    memory = isTheme(stored) ? stored : null;
  } catch {
    memory = null;
  }
  return memory;
}

/** Saves the appearance choice on this device. */
export function setThemePreference(theme: ThemePreference) {
  if (THEME_LOCK) return;
  memory = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode: keep the choice for this visit only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The stored appearance, or `fallback` when none is stored. Observer screens
 * fall back to light (sunlight); staff screens fall back to the device setting.
 */
export function useThemePreference(fallback: ThemePreference): ThemePreference {
  return useSyncExternalStore(
    subscribe,
    () => THEME_LOCK ?? read() ?? fallback,
    () => THEME_LOCK ?? fallback,
  );
}
