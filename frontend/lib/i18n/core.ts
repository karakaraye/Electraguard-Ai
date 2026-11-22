import en from "../../messages/en.json";
import { defaultLocale, localeTags, type Locale } from "./config";
import { formatMessage, type MessageVars } from "./format";

export type Messages = { [key: string]: string | Messages };

/** English is bundled: it is the fallback for every missing key. */
export const fallbackMessages: Messages = en as Messages;

export type Translate = (key: string, vars?: MessageVars) => string;

const warned = new Set<string>();

function lookup(messages: Messages, key: string): string | undefined {
  if (typeof messages[key] === "string") return messages[key] as string;
  let node: string | Messages | undefined = messages;
  for (const part of key.split(".")) {
    if (!node || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

function warnMissing(locale: Locale, key: string, inFallback: boolean) {
  if (process.env.NODE_ENV === "production") return;
  const id = `${locale}:${key}`;
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(
    inFallback
      ? `[i18n] Missing key "${key}" in every locale.`
      : `[i18n] Missing key "${key}" for "${locale}", showing English.`,
  );
}

export function createTranslator(locale: Locale, messages: Messages): Translate {
  const tag = localeTags[locale];
  return (key, vars) => {
    const own = lookup(messages, key);
    if (own !== undefined) return formatMessage(own, vars, tag);
    const fallback = lookup(fallbackMessages, key);
    if (fallback !== undefined) {
      if (locale !== defaultLocale) warnMissing(locale, key, false);
      return formatMessage(fallback, vars, localeTags[defaultLocale]);
    }
    warnMissing(locale, key, true);
    return key;
  };
}

/**
 * Loads one locale's message file. English is bundled; the others are separate
 * chunks fetched on demand. A missing or broken file falls back to English.
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === defaultLocale) return fallbackMessages;
  try {
    const mod = await import(`../../messages/${locale}.json`);
    return (mod.default ?? mod) as Messages;
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] No message file for "${locale}", showing English.`);
    }
    return fallbackMessages;
  }
}
