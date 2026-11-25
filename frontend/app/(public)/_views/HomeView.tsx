import Link from "next/link";
import type { Translate } from "../../../lib/i18n";
import type { Cell, GuideSummary } from "../../../lib/api/types";
import { SMS_SHORT_CODE } from "../../../lib/config";
import { ButtonLink } from "../../../ui/Button/Button";
import { BackgroundArt } from "../../../ui/BackgroundArt/BackgroundArt";
import { ArrowRightIcon, EyeIcon, FileIcon, ListIcon, PenIcon } from "../../../ui/icons";
import { formatWatDateTime } from "../../../ui/format";
import type { Locale } from "../../../lib/i18n";
import { formatNumber, localeTags } from "../../../lib/i18n";
import { ReceiptCheck, type CheckState } from "../_components/ReceiptCheck";
import { CATEGORY_ROWS, USSD_SERVICE_CODE } from "../_lib/public";
import styles from "./home.module.css";

export type HomeResults =
  | { kind: "published"; total: Cell; publishedAt: string | null; cutoff: string; organisations: number; categories?: Array<{ category: string; count: number }> }
  | { kind: "empty" }
  | { kind: "unavailable" };

export type HomeViewProps = {
  t: Translate;
  locale: Locale;
  results: HomeResults;
  /** null when the guide list could not be read (the section then links to /guide only). */
  guides: GuideSummary[] | null;
  check?: { state: CheckState; code: string };
};

/** P-02 public home: what this is, report as a citizen, check a receipt, see results. */
export function HomeView({ t, locale, results, guides, check }: HomeViewProps) {
  const tag = localeTags[locale];
  return (
    <div className={styles.home}>
      <section className={styles.hero} aria-labelledby="p02-title">
        <BackgroundArt variant="plate" data-testid="home-art" />
        <div className={styles.heroText}>
          <h1 id="p02-title" className={styles.title}>{t("p02.heading")}</h1>
          <p className={styles.lead}>{t("p02.lead")}</p>
          <div className={styles.actions}>
            <ButtonLink href="/o/new/what?as=citizen" data-testid="home-report">
              {t("p02.report")}
            </ButtonLink>
            <p className={styles.actionHint}>{t("p02.reportHint")}</p>
          </div>
          <p className={styles.basic}>
            {t("p02.basicPhone", { ussd: USSD_SERVICE_CODE, shortCode: SMS_SHORT_CODE })}
            {" "}
            <Link href="/phone">{t("p02.tryPhone")}</Link>
          </p>
        </div>
        <section className={styles.checkCard} id="check" aria-labelledby="p02-check">
          <h2 id="p02-check" className={styles.heading}>{t("p02.check.title")}</h2>
          <p className={styles.text}>{t("p02.check.lead")}</p>
          <ReceiptCheck initial={check?.state} initialCode={check?.code} />
        </section>
      </section>

      <div className={styles.grid}>

        <section className={`${styles.block} ${styles.resultsBlock}`} aria-labelledby="p02-results">
          <h2 id="p02-results" className={styles.heading}>{t("p02.results.title")}</h2>
          {results.kind === "published" ? (
            <>
              <p className={styles.figure}>
                {results.total.suppressed ? (
                  <span className={styles.figureSmall}>{t("p02.results.suppressed")}</span>
                ) : (
                  <>
                    <span className={`${styles.number} eg-tnum`}>{formatNumber(results.total.count, tag)}</span>{" "}
                    <span className={styles.unit}>{t("p02.results.unit", { count: results.total.count })}</span>
                  </>
                )}
              </p>
              {results.categories && results.categories.length ? (
                <ol className={styles.bars} aria-label={t("p02.results.title")}>
                  {results.categories.map((item) => {
                    const max = results.categories![0].count || 1;
                    const label = CATEGORY_ROWS.find((row) => row.value === item.category)?.key;
                    return (
                      <li key={item.category} className={styles.bar}>
                        <span className={styles.barLabel}>{label ? t(label) : item.category}</span>
                        <span className={`${styles.barCount} eg-tnum`}>{formatNumber(item.count, tag)}</span>
                        <span className={styles.barTrack} aria-hidden="true">
                          <span className={styles.barFill} style={{ inlineSize: `${Math.max(4, Math.round((item.count / max) * 100))}%` }} />
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
              <p className={styles.meta}>
                {results.publishedAt ? t("p02.results.published", { time: formatWatDateTime(results.publishedAt, locale) }) : null}{" "}
                {t("p02.results.cutoff", { time: formatWatDateTime(results.cutoff, locale) })}
              </p>
              <p className={styles.notice}>{t("results.notice")}</p>
              <Link className={styles.more} href="/results">
                {t("p02.results.open")}
                <ArrowRightIcon size={20} />
              </Link>
            </>
          ) : results.kind === "empty" ? (
            <>
              <p className={styles.textStrong}>{t("p02.results.empty")}</p>
              <p className={styles.text}>{t("p02.results.emptyHint")}</p>
              <Link className={styles.more} href="/results">
                {t("p02.results.how")}
                <ArrowRightIcon size={20} />
              </Link>
            </>
          ) : (
            <>
              <p className={styles.textStrong}>{t("p02.results.unavailable")}</p>
              <Link className={styles.more} href="/results">
                {t("p02.results.open")}
                <ArrowRightIcon size={20} />
              </Link>
            </>
          )}
        </section>
      </div>

      <section className={styles.how} aria-labelledby="p02-how">
        <h2 id="p02-how" className={styles.heading}>{t("p02.how.title")}</h2>
        <ol className={styles.steps}>
          {([
            ["1", PenIcon],
            ["2", FileIcon],
            ["3", EyeIcon],
            ["4", ListIcon],
          ] as const).map(([n, Icon]) => (
            <li key={n}>
              <span className={styles.stepDisc} aria-hidden="true">
                <Icon size={24} />
              </span>
              <span>{t(`p02.how.${n}`)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.help} aria-labelledby="p02-help">
        <h2 id="p02-help" className={styles.heading}>{t("p02.help.title")}</h2>
        <ul className={styles.links}>
          <li>
            <Link href="/ask">
              <span className={styles.linkTitle}>{t("p02.help.ask")}</span>
              <span className={styles.linkText}>{t("p02.help.askHint")}</span>
            </Link>
          </li>
          {guides && guides.length > 0 ? (
            guides.slice(0, 5).map((guide) => (
              <li key={guide.slug}>
                <Link href={`/guide/${guide.slug}`} lang={localeTags[guide.language]}>
                  <span className={styles.linkTitle}>{guide.title}</span>
                  <span className={styles.linkText}>{t("p02.help.guide")}</span>
                </Link>
              </li>
            ))
          ) : (
            <li>
              <Link href="/guide">
                <span className={styles.linkTitle}>{t("p02.help.guides")}</span>
                <span className={styles.linkText}>{t("p02.help.guidesHint")}</span>
              </Link>
            </li>
          )}
          <li>
            <Link href="/privacy">
              <span className={styles.linkTitle}>{t("p02.help.privacy")}</span>
              <span className={styles.linkText}>{t("p02.help.privacyHint")}</span>
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
