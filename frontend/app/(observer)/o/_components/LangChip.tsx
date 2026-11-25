"use client";

import { isLocale, localeNames, localeTags, locales } from "../../../../lib/i18n/config";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { LanguageIcon } from "../../../../ui/icons";
import styles from "./obs1.module.css";

/** The compact language choice for the app bar: the globe and the language's own name. */
export function LangChip() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  return (
    <label className={styles.langChip} data-testid="lang-chip">
      <LanguageIcon size={20} aria-hidden="true" />
      <span aria-hidden="true">{localeNames[locale]}</span>
      <select
        className={styles.langSelect}
        aria-label={t("ui.language.label")}
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) void setLocale(event.target.value);
        }}
      >
        {locales.map((code) => (
          <option key={code} value={code} lang={localeTags[code]}>
            {localeNames[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
