"use client";

import { useSyncExternalStore } from "react";
import { setVibration, vibrationOn } from "./motion";

/** The in-app Vibration setting (O-20) as a store, so the switch and haptic() always agree. */
const listeners = new Set<() => void>();

export function setVibrationPreference(on: boolean) {
  setVibration(on);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVibration(): boolean {
  return useSyncExternalStore(subscribe, vibrationOn, () => true);
}
