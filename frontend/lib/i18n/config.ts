export const locales = ["en", "pcm", "ha", "yo", "ig"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Each language in its own name (design contract 5, LanguageSwitcher). */
export const localeNames: Record<Locale, string> = {
  en: "English",
  pcm: "Naijá",
  ha: "Hausa",
  yo: "Yorùbá",
  ig: "Igbo",
};

/** BCP 47 tags used for <html lang>, Intl formatting and plural rules. */
export const localeTags: Record<Locale, string> = {
  en: "en-NG",
  pcm: "pcm",
  ha: "ha",
  yo: "yo",
  ig: "ig",
};

/** Device storage: localStorage for the client, a cookie so server components can read it. */
export const LOCALE_STORAGE_KEY = "eg.locale";
export const LOCALE_COOKIE = "eg_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
