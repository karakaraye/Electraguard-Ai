import type { Locale, Translate } from "../../../lib/i18n";
import { localeTags } from "../../../lib/i18n";
import { NOTICE_VERSION } from "../../../lib/config";
import { formatWatDate } from "../_lib/public";
import page from "./page.module.css";
import styles from "./privacy.module.css";

/** Each section: a heading and either one paragraph or a list (keys under p06.<id>). */
const SECTIONS: Array<{ id: string; items?: number }> = [
  { id: "who" },
  { id: "never", items: 3 },
  { id: "keep", items: 4 },
  { id: "see" },
  { id: "public" },
  { id: "ai" },
  { id: "speech" },
  { id: "rights", items: 4 },
  { id: "keepFor" },
  { id: "security" },
  { id: "danger" },
  { id: "contact" },
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
            <h2 id={`${section.id}-h`}>{t(`p06.${section.id}.h`)}</h2>
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
  );
}
