"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  defaultLocale,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  localeTags,
  type Locale,
} from "./config";
import { createTranslator, fallbackMessages, loadMessages, type Messages, type Translate } from "./core";

type State = { locale: Locale; messages: Messages; t: Translate; loading: boolean };

function makeState(locale: Locale, messages: Messages, loading = false): State {
  return { locale, messages, t: createTranslator(locale, messages), loading };
}

const englishState = makeState(defaultLocale, fallbackMessages);

/* ---------- Module store: one locale for the whole app, no provider required ---------- */

let state: State | null = null;
let requestId = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function readStoredLocale(): Locale | null {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

function applyDocumentLanguage(locale: Locale) {
  document.documentElement.lang = localeTags[locale];
}

function ensureState(seed: State | null): State {
  if (!state) {
    state = seed ?? englishState;
    const stored = readStoredLocale();
    if (stored && stored !== state.locale) {
      // The device choice wins over the server's guess; load it after first paint.
      queueMicrotask(() => void setLocale(stored));
    } else {
      applyDocumentLanguage(state.locale);
    }
  }
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Saves the choice on this device, sets <html lang> and loads the message file. */
export async function setLocale(locale: Locale): Promise<void> {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be blocked (private mode); the cookie still carries the choice.
  }
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  const current = ensureState(null);
  const id = ++requestId;
  if (current.locale !== locale) {
    state = { ...current, loading: true };
    emit();
  }
  const messages = await loadMessages(locale);
  if (id !== requestId) return;
  state = makeState(locale, messages);
  applyDocumentLanguage(locale);
  emit();
}

/* ---------- Optional server seed, to avoid an English flash on first paint ---------- */

const SeedContext = createContext<State | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  const seed = useMemo(() => makeState(locale, messages), [locale, messages]);
  return <SeedContext.Provider value={seed}>{children}</SeedContext.Provider>;
}

function useI18nState(): State {
  const seed = useContext(SeedContext);
  return useSyncExternalStore(
    subscribe,
    () => ensureState(seed),
    () => seed ?? englishState,
  );
}

/** Returns t(key, vars) for the current locale. Missing keys show English. */
export function useT(): Translate {
  return useI18nState().t;
}

/** Current locale, a setter, and whether a new language file is still loading. */
export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => Promise<void>; loading: boolean } {
  const current = useI18nState();
  return { locale: current.locale, setLocale, loading: current.loading };
}
