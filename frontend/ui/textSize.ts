"use client";

import { useSyncExternalStore } from "react";

/** In-app text size (O-20). "large" scales the root font size by 1.15, so every rem-based size grows with it. */
export type TextSize = "normal" | "large";

const STORAGE_KEY = "eg.textSize";
const listeners = new Set<() => void>();
let memory: TextSize | null = null;

function read(): TextSize {
  if (memory) return memory;
  try {
    memory = window.localStorage.getItem(STORAGE_KEY) === "large" ? "large" : "normal";
  } catch {
    memory = "normal";
  }
  return memory;
}

/** Saves the text size on this device. */
export function setTextSize(size: TextSize) {
  memory = size;
  try {
    window.localStorage.setItem(STORAGE_KEY, size);
  } catch {
    // Private mode: keep the choice for this visit only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTextSize(): TextSize {
  return useSyncExternalStore(subscribe, read, () => "normal");
}

/** The root font size for a text size; empty restores the stylesheet's own size. */
export function rootFontSize(size: TextSize): string {
  return size === "large" ? "115%" : "";
}
