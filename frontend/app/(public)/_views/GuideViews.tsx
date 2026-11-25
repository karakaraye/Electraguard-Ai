import Link from "next/link";
import type { GuideDocument, GuideListResponse } from "../../../lib/api/types";
import type { Locale, Translate } from "../../../lib/i18n";
import { localeTags } from "../../../lib/i18n";
import { EmptyState } from "../../../ui/EmptyState/EmptyState";
import { ArrowLeftIcon, ChevronRightIcon, FileIcon } from "../../../ui/icons";
import { formatWatDate } from "../_lib/public";
import page from "./page.module.css";
import styles from "./guide.module.css";

/** A list row. The list endpoint may carry the approval date; it is shown when present. */
type GuideListItem = GuideListResponse["documents"][number] & { approved_on?: string };

export type GuideIndexState = { kind: "ok"; data: GuideListResponse } | { kind: "error" };
export type GuideDocState = { kind: "ok"; data: GuideDocument } | { kind: "not_found" } | { kind: "error" };

/** Plain-text body (GUIDE-01): blank line = new paragraph, "- " = list item. Rendered as text, never HTML. */
function Body({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        if (lines.every((line) => line.trimStart().startsWith("- "))) {
          return (
            <ul key={index}>
              {lines.map((line, i) => (
                <li key={i}>{line.trimStart().slice(2)}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block}</p>;
      })}
    </>
  );
}

/** P-05 guide list. */
export function GuideIndexView({ t, locale = "en", state }: { t: Translate; locale?: Locale; state: GuideIndexState }) {
  return (
    <div className={page.page}>
      <header className={page.header}>
        <h1 className={page.title}>{t("p05.title")}</h1>
        <p className={page.lead}>{t("p05.lead")}</p>
      </header>
      {state.kind === "error" ? (
        <EmptyState title={t("p05.error.title")} data-testid="guide-error" action={<Link className={page.link} href="/guide">{t("p03.retry")}</Link>}>
          <p>{t("p05.error.body")}</p>
        </EmptyState>
      ) : state.data.documents.length === 0 ? (
        <EmptyState title={t("p05.empty.title")} data-testid="guide-empty" action={<Link className={page.link} href="/ask">{t("p05.askInstead")}</Link>}>
          <p>{t("p05.empty.body")}</p>
        </EmptyState>
      ) : (
        <ul className={styles.list} data-testid="guide-list">
          {state.data.documents.map((doc) => (
            <li key={doc.slug}>
              <Link href={`/guide/${doc.slug}`} className={styles.card}>
                <span className={styles.cardDisc} aria-hidden="true">
                  <FileIcon size={24} />
                </span>
                <span className={styles.cardText}>
                  <span className={styles.listTitle} lang={localeTags[doc.language]}>{doc.title}</span>
                  <span className={styles.listMeta}>
                    <span className="eg-tnum">{t("p05.version", { version: doc.version })}</span>
                    {(doc as GuideListItem).approved_on ? (
                      <span className="eg-tnum">{t("p05.approvedShort", { date: formatWatDate((doc as GuideListItem).approved_on!, localeTags[locale]) })}</span>
                    ) : null}
                    {doc.fallback_language_used ? <span className={styles.chip}>{t("p05.chipEnglish")}</span> : null}
                  </span>
                </span>
                <ChevronRightIcon size={20} className={styles.cardChevron} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** P-05 one approved guide, rendered from its sections so ASK-01 source links land on the right part. */
export function GuideDocumentView({ t, locale, state }: { t: Translate; locale: Locale; state: GuideDocState }) {
  const back = (
    <Link className={`${page.link} ${styles.back}`} href="/guide">
      <ArrowLeftIcon size={20} />
      {t("p05.allGuides")}
    </Link>
  );
  if (state.kind !== "ok") {
    return (
      <div className={page.page}>
        {back}
        {state.kind === "not_found" ? (
          <EmptyState title={t("p05.notFound.title")} data-testid="guide-not-found" action={<Link className={page.link} href="/guide">{t("p05.allGuides")}</Link>}>
            <p>{t("p05.notFound.body")}</p>
          </EmptyState>
        ) : (
          <EmptyState title={t("p05.error.title")} data-testid="guide-error">
            <p>{t("p05.error.body")}</p>
          </EmptyState>
        )}
      </div>
    );
  }
  const doc = state.data;
  return (
    <div className={page.page}>
      {back}
      <article className={styles.article} lang={localeTags[doc.language]}>
        <header className={page.header}>
          <h1 className={page.title}>{doc.title}</h1>
          <p className={page.small} lang={localeTags[locale]}>
            {t("p05.approved", { date: formatWatDate(doc.approved_on, localeTags[locale]), version: doc.version })}
          </p>
          {doc.fallback_language_used ? (
            <p className={styles.fallback} lang={localeTags[locale]}>{t("p05.fallback")}</p>
          ) : null}
        </header>
        {doc.sections.length > 2 ? (
          <nav className={styles.toc} aria-label={t("p05.contents")} lang={localeTags[locale]}>
            <p className={styles.tocTitle}>{t("p05.contents")}</p>
            <ol>
              {doc.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} lang={localeTags[doc.language]}>{section.heading}</a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        {doc.sections.map((section) => (
          <section key={section.id} id={section.id} className={styles.section} aria-labelledby={`${section.id}-h`}>
            <h2 id={`${section.id}-h`}>{section.heading}</h2>
            <Body text={section.body} />
          </section>
        ))}
      </article>
      <p>
        <Link className={page.link} href="/ask">{t("p05.ask")}</Link>
      </p>
    </div>
  );
}
