import type { Locale, Translate } from "../../../lib/i18n";
import { localeTags } from "../../../lib/i18n";
import { NOTICE_VERSION } from "../../../lib/config";
import { formatWatDate } from "../_lib/public";
import { AlertIcon, ClockIcon, EyeIcon, FileIcon, InfoIcon, KeyIcon, ListIcon, LockIcon, MessageIcon, MicIcon, PlaceIcon, ShieldCheckIcon, SlidersIcon, type IconProps } from "../../../ui/icons";
import type { ComponentType } from "react";
import page from "./page.module.css";
import styles from "./privacy.module.css";

/** Each section: a heading and either one paragraph or a list (keys under p06.<id>). */
const SECTIONS: Array<{ id: string; items?: number; icon: ComponentType<IconProps> }> = [
  { id: "who", icon: InfoIcon },
  { id: "never", items: 3, icon: ShieldCheckIcon },
  { id: "keep", items: 4, icon: FileIcon },
  { id: "location", icon: PlaceIcon },
  { id: "see", icon: EyeIcon },
  { id: "public", icon: ListIcon },
  { id: "ai", icon: SlidersIcon },
  { id: "speech", icon: MicIcon },
  { id: "rights", items: 4, icon: KeyIcon },
  { id: "keepFor", icon: ClockIcon },
  { id: "security", icon: LockIcon },
  { id: "danger", icon: AlertIcon },
  { id: "contact", icon: MessageIcon },
];

/** P-06 privacy notice in plain language (hackathon plan 2.4 and 7). Same text in all five languages. */
export function PrivacyView({ t, locale }: { t: Translate; locale: Locale }) {
  return (
    <div className={page.page}>
      <header className={page.header}>
        <h1 className={page.title}>{t("p06.title")}</h1>
        <p className={page.lead}>{t("p06.lead")}</p>
        <p className={page.small}>{t("p06.updated", { date: formatWatDate(NOTICE_VERSION, localeTags[locale]) })}</p>
      </header>
      <div className={styles.layout}>
        <nav className={styles.toc} aria-label={t("p05.contents")}>
          <p className={styles.tocTitle}>{t("p05.contents")}</p>
          <ul>
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{t(`p06.${section.id}.h`)}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.body}>
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className={styles.section} aria-labelledby={`${section.id}-h`} data-tone={section.id === "danger" ? "danger" : undefined}>
              <h2 id={`${section.id}-h`} className={styles.heading}>
                <span className={styles.disc} aria-hidden="true">
                  <section.icon size={22} />
                </span>
                <span>{t(`p06.${section.id}.h`)}</span>
              </h2>
              {section.items ? (
                <ul>
                  {Array.from({ length: section.items }, (_, i) => (
                    <li key={i}>{t(`p06.${section.id}.${i + 1}`)}</li>
                  ))}
                </ul>
              ) : (
                <p>{t(`p06.${section.id}.p`)}</p>
              )}
            </section>
          ))}
          <p className={page.small}>{t("p06.languages")}</p>
        </div>
      </div>
    </div>
  );
}
