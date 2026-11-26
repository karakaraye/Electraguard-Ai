"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useLocale, useT } from "../../../lib/i18n/client";
import { localeNames, locales, localeTags, type Locale } from "../../../lib/i18n/config";
import { CheckIcon, LanguageIcon } from "../../../ui/icons";
import styles from "./language.module.css";

/**
 * The header's language control: a 36 px chip (globe and the short code, so the bar never
 * reflows when the language changes) that opens a listbox. The public pages are rendered on the
 * server, so after the choice is stored the page is fetched again in the new language.
 */
export function LanguageMenu() {
  const t = useT();
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  function show() {
    setActive(Math.max(0, locales.indexOf(locale)));
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  async function choose(next: Locale) {
    close(true);
    await setLocale(next);
    start(() => router.refresh());
  }

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % locales.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + locales.length) % locales.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(locales.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void choose(locales[active]);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className={styles.root} aria-busy={pending || undefined} data-testid="public-language">
      <button
        ref={button}
        type="button"
        className={styles.chip}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${t("ui.language.label")}: ${localeNames[locale]}`}
        data-open={open || undefined}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            show();
          }
        }}
      >
        <LanguageIcon size={20} />
        <span aria-hidden="true">{locale.toUpperCase()}</span>
      </button>
      {open ? (
        <ul
          ref={list}
          id={`${id}-list`}
          className={styles.pop}
          role="listbox"
          tabIndex={-1}
          aria-label={t("ui.language.label")}
          aria-activedescendant={`${id}-${locales[active]}`}
          onKeyDown={onKey}
        >
          {locales.map((code, index) => (
            <li
              key={code}
              id={`${id}-${code}`}
              role="option"
              aria-selected={code === locale}
              lang={localeTags[code]}
              className={styles.option}
              data-active={index === active || undefined}
              onPointerEnter={() => setActive(index)}
              onClick={() => void choose(code)}
            >
              <span>{localeNames[code]}</span>
              {code === locale ? <CheckIcon size={20} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
