"use client";

import { useId } from "react";
import { isLocale, localeNames, locales, localeTags, type Locale } from "../../lib/i18n/config";
import { useLocale, useT } from "../../lib/i18n/client";
import { CheckIcon, ChevronDownIcon, LanguageIcon } from "../icons";
import styles from "./LanguageSwitcher.module.css";

export type LanguageSwitcherProps = {
  /** "list": five large choices (first-open screen). "compact": one select (menus, settings). */
  variant?: "list" | "compact";
  /** Called after the language is saved, e.g. to move to the next screen. */
  onChanged?: (locale: Locale) => void;
  /** Render the legend as the screen's <h1> (first-open screen). */
  asHeading?: boolean;
  "data-testid"?: string;
};

/**
 * Each language in its own name, marked with its own lang attribute so screen
 * readers pronounce it correctly. The choice is stored on this device.
 */
export function LanguageSwitcher({ variant = "list", onChanged, asHeading, "data-testid": testId = "language-switcher" }: LanguageSwitcherProps) {
  const t = useT();
  const id = useId();
  const { locale, setLocale, loading } = useLocale();

  async function choose(next: Locale) {
    await setLocale(next);
    onChanged?.(next);
  }

  if (variant === "compact") {
    return (
      <div className={styles.compact} data-testid={testId}>
        <label className={styles.compactLabel} htmlFor={`${id}-select`}>
          <LanguageIcon size={20} />
          <span>{t("ui.language.label")}</span>
        </label>
        <div className={styles.selectWrap}>
          <select
            id={`${id}-select`}
            className={styles.select}
            value={locale}
            aria-busy={loading || undefined}
            onChange={(event) => {
              if (isLocale(event.target.value)) void choose(event.target.value);
            }}
          >
            {locales.map((code) => (
              <option key={code} value={code} lang={localeTags[code]}>
                {localeNames[code]}
              </option>
            ))}
          </select>
          <ChevronDownIcon className={styles.selectIcon} />
        </div>
      </div>
    );
  }

  return (
    <fieldset className={styles.group} data-testid={testId} aria-busy={loading || undefined}>
      <legend className={styles.legend}>
        {asHeading ? <h1 className={styles.heading}>{t("ui.language.choose")}</h1> : t("ui.language.choose")}
      </legend>
      <div className={styles.list}>
        {locales.map((code) => {
          const checked = code === locale;
          return (
            <label key={code} className={styles.option} data-checked={checked || undefined} lang={localeTags[code]} data-testid={`${testId}-${code}`}>
              <input
                className={styles.input}
                type="radio"
                name={`${id}-language`}
                value={code}
                checked={checked}
                onChange={() => void choose(code)}
              />
              <span className={styles.name}>{localeNames[code]}</span>
              <span className={styles.tick} aria-hidden="true">
                <CheckIcon size={16} strokeWidth={2.5} />
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
