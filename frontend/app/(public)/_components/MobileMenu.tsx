"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useLocale } from "../../../lib/i18n/client";
import { localeNames, locales, localeTags, type Locale } from "../../../lib/i18n/config";
import { BrandMark } from "../../../ui/BrandMark/BrandMark";
import { AlertIcon, CloseIcon, MenuIcon } from "../../../ui/icons";
import { NavLinks } from "./NavLinks";
import styles from "./menu.module.css";

export type MobileMenuProps = {
  items: Array<{ href: string; label: string }>;
  menuLabel: string;
  closeLabel: string;
  homeLabel: string;
  hereLabel: string;
  languageLabel: string;
  navLabel: string;
  emergency: string;
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Phone navigation: an icon-only 44 px button that opens a top sheet over a scrim. The page behind
 * does not scroll, focus stays inside the sheet, and Escape, the scrim and the close button all
 * close it and return focus to the menu button. Motion is transform and opacity only.
 */
export function MobileMenu(props: MobileMenuProps) {
  const { items, menuLabel, closeLabel, homeLabel, hereLabel, languageLabel, navLabel, emergency } = props;
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) opener.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    closer.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const wide = window.matchMedia("(min-width: 1040px)");
    const onWide = () => wide.matches && setOpen(false);
    wide.addEventListener("change", onWide);
    return () => {
      document.body.style.overflow = overflow;
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !sheet.current) return;
    const nodes = Array.from(sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function choose(next: Locale) {
    await setLocale(next);
    start(() => router.refresh());
  }

  return (
    <>
      <button
        ref={opener}
        type="button"
        className={styles.opener}
        aria-label={menuLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-sheet` : undefined}
        onClick={() => setOpen(true)}
        data-testid="public-menu"
      >
        <MenuIcon size={24} />
      </button>
      {open ? (
        <div className={styles.layer} onKeyDown={onKeyDown}>
          <div className={styles.scrim} onClick={() => close()} aria-hidden="true" />
          <div ref={sheet} id={`${id}-sheet`} className={styles.sheet} role="dialog" aria-modal="true" aria-label={menuLabel}>
            <div className={styles.bar}>
              <Link href="/" className={styles.home} aria-label={homeLabel} onClick={() => close(false)}>
                <BrandMark size="bar" />
              </Link>
              <button ref={closer} type="button" className={styles.opener} aria-label={closeLabel} onClick={() => close()}>
                <CloseIcon size={24} />
              </button>
            </div>
            <nav aria-label={navLabel}>
              <NavLinks items={items} className={styles.rows} hereLabel={hereLabel} onNavigate={() => close(false)} />
            </nav>
            <div className={styles.rule} />
            <div role="radiogroup" aria-labelledby={`${id}-lang`} className={styles.langs}>
              <p id={`${id}-lang`} className={styles.langLabel}>{languageLabel}</p>
              {locales.map((code) => {
                const checked = code === locale;
                return (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    lang={localeTags[code]}
                    className={styles.radio}
                    data-checked={checked || undefined}
                    onClick={() => void choose(code)}
                  >
                    <span className={styles.dot} aria-hidden="true" />
                    {localeNames[code]}
                  </button>
                );
              })}
            </div>
            <p className={styles.emergency}>
              <AlertIcon size={18} aria-hidden="true" />
              <span>{emergency}</span>
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
