import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, localeTags, type Locale } from "./config";
import { createTranslator, loadMessages, type Messages, type Translate } from "./core";

/** The locale stored on this device (cookie), or English. Server components only. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

/**
 * Server-side translator. Pass `locale` and `messages` to <I18nProvider> so
 * client components render the same language on first paint.
 */
export async function getT(): Promise<{ t: Translate; locale: Locale; lang: string; messages: Messages }> {
  const locale = await getLocale();
  const messages = await loadMessages(locale);
  return { t: createTranslator(locale, messages), locale, lang: localeTags[locale], messages };
}
