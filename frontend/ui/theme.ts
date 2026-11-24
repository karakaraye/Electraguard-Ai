"use client";

import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "eg.theme";
const listeners = new Set<() => void>();
let memory: ThemePreference | null = null;

function isTheme(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function read(): ThemePreference | null {
  try {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    return isTheme(stored) ? stored : memory;
  } catch {
    return memory;
  }
}

/** Saves the appearance choice on this device. */
export function setThemePreference(theme: ThemePreference) {
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
    () => read() ?? fallback,
    () => fallback,
  );
}
