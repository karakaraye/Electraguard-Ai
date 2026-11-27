import Link from "next/link";
import { Suspense, use, type CSSProperties } from "react";
import type { Translate } from "../../../lib/i18n";
import type { Cell, GuideSummary } from "../../../lib/api/types";
import { SMS_SHORT_CODE } from "../../../lib/config";
import { ButtonLink } from "../../../ui/Button/Button";
import { TestNumberNote } from "../../../ui/TestNumberNote/TestNumberNote";
import { ArrowRightIcon, PhoneIcon } from "../../../ui/icons";
import { formatWatDateTime } from "../../../ui/format";
import type { Locale } from "../../../lib/i18n";
import { formatNumber, localeTags } from "../../../lib/i18n";
import { HeroArt } from "../_components/landing/HeroArt";
import { ReceiptCheck, type CheckState } from "../_components/ReceiptCheck";
import { CountUp } from "../_components/landing/CountUp";
import { ArtEmptyResults, ArtRumour } from "../_components/landing/ExtraArt";
import { InView } from "../_components/landing/InView";
import { Story } from "../_components/landing/Story";
import { ArtReceipt, ArtReport, ArtReview, ArtTotals } from "../_components/landing/StoryArt";
import { WayApp, WaySms, WayUssd } from "../_components/landing/WaysArt";
import waysStyles from "../_components/landing/ways.module.css";
import storyStyles from "../_components/landing/story.module.css";
import { CATEGORY_ROWS, USSD_SERVICE_CODE } from "../_lib/public";
import styles from "./home.module.css";

export type HomeResults =
  | { kind: "published"; total: Cell; publishedAt: string | null; cutoff: string; organisations: number; categories?: Array<{ category: string; count: number }> }
  | { kind: "empty" }
  | { kind: "unavailable" };

type Awaitable<T> = T | Promise<T>;

/** Waits for a streamed value (server) or takes a value as it is (previews render this view in the browser). */
function useSettled<T>(value: Awaitable<T>): T {
  return value instanceof Promise ? use(value) : value;
}

export type HomeViewProps = {
  t: Translate;
  locale: Locale;
  /** A promise on the live page, so the results stream in after the rest of the page. */
  results: Awaitable<HomeResults>;
  /** null when the guide list could not be read (the section then links to /guide only). */
  guides: Awaitable<GuideSummary[] | null>;
  check?: { state: CheckState; code: string };
  /** The "Report what you saw" line in each language, for the language picker drawn in step 1 of the story. */
  reportLines?: Partial<Record<Locale, string>>;
};

/** Link text with its arrow kept on the last word, so the arrow never wraps alone. */
function withArrow(text: string) {
  const cut = text.lastIndexOf(" ");
  const head = cut > 0 ? `${text.slice(0, cut)} ` : "";
  return (
    <>
      {head}
      <span className={styles.nowrap}>
        {cut > 0 ? text.slice(cut + 1) : text}
        <ArrowRightIcon size={20} className={styles.moreArrow} />
      </span>
    </>
  );
}

const REPORT_HREF = "/o/new/what?as=citizen";

/** P-02 public home (landing plan §4): one polling day told in order, from the hero to the evening scene. */
export function HomeView({ t, locale, results, guides, check, reportLines }: HomeViewProps) {
  const lines: Partial<Record<Locale, string>> = { ...reportLines, [locale]: t("p02.report") };
  const steps = [
    { n: "1", art: <ArtReport locale={locale} lines={lines} outbox={t("p02.how.art.outbox")} /> },
    { n: "2", art: <ArtReceipt /> },
    { n: "3", art: <ArtReview suggested={t("p02.how.art.ai")} reviewed={t("p02.how.art.reviewed")} /> },
    { n: "4", art: <ArtTotals /> },
  ];
  const reportAction = (testId?: string) => (
    <div className={styles.actions}>
      <ButtonLink href={REPORT_HREF} data-testid={testId}>
        {t("p02.report")}
      </ButtonLink>
      <p className={styles.actionHint}>{t("p02.reportHint")}</p>
    </div>
  );

  return (
    <div className={styles.home}>
      {/* 4.2 The polling unit: the statement on the left, the render laid straight on the paper on the right. */}
      <section id="home-hero" className={styles.hero} aria-labelledby="p02-title">
        <HeroArt name="hero" className={styles.art} width={2200} height={920} phone={{ width: 780, height: 600 }} data-testid="home-art" />
        <div className={styles.sky}>
          <h1 id="p02-title" className={styles.title}>{t("p02.heading")}</h1>
          <p className={styles.lead}>{t("p02.lead")}</p>
          <div className={styles.heroActions}>
            <ButtonLink href={REPORT_HREF} data-testid="home-report">
              {t("p02.report")}
            </ButtonLink>
            <ButtonLink variant="secondary" href="/check" data-testid="home-check-rumour-hero">
              {t("pub.nav.check")}
            </ButtonLink>
          </div>
          <p className={styles.actionHint}>{t("p02.reportHint")}</p>
          <p className={styles.safety}>{t("pub.footer.emergency")}</p>
          <p className={styles.basic}>
            <PhoneIcon size={24} className={styles.basicIcon} />
            <span>
              {t("p02.basicPhone", { ussd: USSD_SERVICE_CODE, shortCode: SMS_SHORT_CODE })}
              <TestNumberNote label={t("pub.testNumbers")} />
              <Link href="/phone">{t("p02.tryPhone")}</Link>
            </span>
          </p>
        </div>
      </section>

      {/* 4.4 Already reported? The receipt check, one full-width strip. */}
      <section className={styles.check} id="check" aria-labelledby="p02-check">
        <div className={styles.checkText}>
          <h2 id="p02-check" className={styles.stripHeading}>{t("p02.check.title")}</h2>
          <p className={styles.stripText}>{t("p02.check.lead")}</p>
        </div>
        <div className={styles.checkForm}>
          <ReceiptCheck initial={check?.state} initialCode={check?.code} />
        </div>
      </section>

      {/* 4.5 Reviewed results: real numbers only, starting above the fold. */}
      <section className={styles.results} aria-labelledby="p02-results">
        <InView className={styles.resultsBlock}>
          <ResultsHead results={results} t={t} />
          <Suspense fallback={<div className={styles.resultsPending} />}>
            <ResultsBody results={results} t={t} locale={locale} />
          </Suspense>
        </InView>
      </section>

      {/* 4.3 How a report travels */}
      <Story className={storyStyles.story} labelledBy="p02-how">
        <div className={storyStyles.track} data-story-track>
          <div className={storyStyles.sticky} data-story-sticky>
            <h2 id="p02-how" className={storyStyles.title}>{t("p02.how.title")}</h2>
            <div className={storyStyles.rail} aria-hidden="true">
              <span className={storyStyles.railLine} />
              <span className={storyStyles.railFill} data-story-line />
              <ol className={storyStyles.nodes}>
                {steps.map((step) => (
                  <li key={step.n} className={storyStyles.node} data-story-node>{step.n}</li>
                ))}
              </ol>
            </div>
            <ol className={storyStyles.steps}>
              {steps.map((step) => (
                <li key={step.n} className={storyStyles.step} data-story-step data-testid={`story-step-${step.n}`}>
                  <div className={storyStyles.art}>{step.art}</div>
                  <div className={storyStyles.copy}>
                    <span className={storyStyles.no} aria-hidden="true">{step.n}</span>
                    <p className={storyStyles.sentence}>{t(`p02.how.${step.n}`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Story>

      <div className={styles.cta}>{reportAction()}</div>

      {/* 4.6 Three ways to report */}
      <section className={styles.ways} aria-labelledby="p02-ways">
        <h2 id="p02-ways" className={styles.heading}>{t("p02.ways.title")}</h2>
        <ul className={styles.wayList}>
          <li className={styles.wayItem}>
            <InView className={`${waysStyles.way} ${styles.wayArt}`} once={false}>
              <WayApp />
            </InView>
            <div className={styles.wayText}>
              <h3 id="way-web" className={styles.wayTitle}>{t("p02.ways.web.title")}</h3>
              <p className={styles.wayBody}>{t("p02.ways.web.body")}</p>
              <Link className={styles.more} href={REPORT_HREF} aria-describedby="way-web">
                {withArrow(t("p02.ways.web.link"))}
              </Link>
            </div>
          </li>
          <li className={styles.wayItem}>
            <InView className={`${waysStyles.way} ${styles.wayArt}`} once={false}>
              <WaySms />
            </InView>
            <div className={styles.wayText}>
              <h3 id="way-sms" className={styles.wayTitle}>{t("p02.ways.sms.title", { shortCode: SMS_SHORT_CODE })}</h3>
              <p className={styles.wayBody}>{t("p02.ways.sms.body")}</p>
              <TestNumberNote label={t("pub.testNumber")} />
              <Link className={styles.more} href="/phone?start=sms" aria-describedby="way-sms">
                {withArrow(t("p02.tryPhone"))}
              </Link>
            </div>
          </li>
          <li className={styles.wayItem}>
            <InView className={`${waysStyles.way} ${styles.wayArt}`} once={false}>
              <WayUssd />
            </InView>
            <div className={styles.wayText}>
              <h3 id="way-ussd" className={styles.wayTitle}>{t("p02.ways.ussd.title", { ussd: USSD_SERVICE_CODE })}</h3>
              <p className={styles.wayBody}>{t("p02.ways.ussd.body")}</p>
              <TestNumberNote label={t("pub.testNumber")} />
              <Link className={styles.more} href="/phone?start=ussd" aria-describedby="way-ussd">
                {withArrow(t("p02.tryPhone"))}
              </Link>
            </div>
          </li>
        </ul>
      </section>

      {/* 4.7 Heard a rumour? An outlined block with an outlined button. */}
      <section className={styles.rumour} aria-labelledby="p02-rumour">
        <InView className={styles.rumourCard} replayOnHover>
          <div className={styles.rumourArt}>
            <ArtRumour />
            <span className={styles.stamp}>{t("p02.rumour.stamp")}</span>
          </div>
          <div className={styles.rumourText}>
            <h2 id="p02-rumour" className={styles.heading}>{t("p08.homeCard.title")}</h2>
            <p className={styles.text}>{t("p08.homeCard.body")}</p>
            <ButtonLink variant="secondary" href="/check" data-testid="home-check-rumour">
              {t("p08.homeCard.link")}
            </ButtonLink>
            <p className={styles.note}>{t("p08.reviewers")}</p>
          </div>
        </InView>
      </section>

      {/* 4.8 Questions and guides */}
      <section className={styles.help} aria-labelledby="p02-help">
        <h2 id="p02-help" className={styles.heading}>{t("p02.help.title")}</h2>
        <ul className={styles.links}>
          <li>
            <Link href="/ask">
              <span className={styles.linkBody}>
                <span className={styles.linkTitle}>{t("p02.help.ask")}</span>
                <span className={styles.linkText}>{t("p02.help.askHint")}</span>
              </span>
              <ArrowRightIcon size={20} className={styles.linkArrow} />
            </Link>
          </li>
          <Suspense
            fallback={
            <li>
              <Link href="/guide">
                <span className={styles.linkBody}>
                  <span className={styles.linkTitle}>{t("p02.help.guides")}</span>
                  <span className={styles.linkText}>{t("p02.help.guidesHint")}</span>
                </span>
                <ArrowRightIcon size={20} className={styles.linkArrow} />
              </Link>
            </li>
            }
          >
            <GuideItems guides={guides} t={t} />
          </Suspense>
          <li>
            <Link href="/privacy">
              <span className={styles.linkBody}>
                <span className={styles.linkTitle}>{t("p02.help.privacy")}</span>
                <span className={styles.linkText}>{t("p02.help.privacyHint")}</span>
              </span>
              <ArrowRightIcon size={20} className={styles.linkArrow} />
            </Link>
          </li>
        </ul>
      </section>

      {/* After the story and again before the footer: the one action. */}
      <div className={styles.cta}>{reportAction()}</div>

      {/* 4.9 Evening at the polling unit: the day closes on "Reviewed totals are published here", straight above the footer. */}
      <div className={styles.evening}>
        <Suspense fallback={null}>
          <EveningCaption results={results} t={t} />
        </Suspense>
        <HeroArt name="evening-footer" className={styles.eveningArt} width={1600} height={333} data-testid="evening-scene" />
      </div>
    </div>
  );
}

/** The heading row of the results: the title, and the link to the full results once there is something to open. */
function ResultsHead({ results: pending, t }: { results: Awaitable<HomeResults>; t: Translate }) {
  const results = useSettled(pending);
  return (
    <div className={styles.resHead}>
      <h2 id="p02-results" className={styles.sectionTitle}>{t("p02.results.title")}</h2>
      {results.kind === "published" ? (
        <Link className={styles.resLink} href="/results">{t("p02.results.open")}</Link>
      ) : null}
    </div>
  );
}

/** The results block waits for the API on its own, so a slow or unreachable API never holds back the rest of the page. */
function ResultsBody({ results: pending, t, locale }: { results: Awaitable<HomeResults>; t: Translate; locale: Locale }) {
  const results = useSettled(pending);
  const tag = localeTags[locale];
  return (
    results.kind === "published" ? (
      <div className={styles.resGrid}>
        <div className={styles.resTotal}>
          <p className={styles.figure}>
            {results.total.suppressed ? (
              <span className={styles.figureSmall}>{t("p02.results.suppressed")}</span>
            ) : (
              <>
                <CountUp value={results.total.count} tag={tag} className={`${styles.number} eg-tnum`} />{" "}
                <span className={styles.unit}>{t("p02.results.unit", { count: results.total.count })}</span>
              </>
            )}
          </p>
          <p className={styles.meta}>
            {results.publishedAt ? t("p02.results.published", { time: formatWatDateTime(results.publishedAt, locale) }) : null}{" "}
            {t("p02.results.cutoff", { time: formatWatDateTime(results.cutoff, locale) })}
          </p>
          <p className={styles.notice}>{t("results.notice")}</p>
        </div>
        {results.categories && results.categories.length ? (
          <ol className={styles.bars} aria-label={t("p02.results.title")}>
            {results.categories.map((item, index) => {
              const max = results.categories![0].count || 1;
              const label = CATEGORY_ROWS.find((row) => row.value === item.category)?.key;
              const share = Math.max(4, Math.round((item.count / max) * 100)) / 100;
              return (
                <li key={item.category} className={styles.bar}>
                  <span className={styles.barLabel}>{label ? t(label) : item.category}</span>
                  <span className={`${styles.barCount} eg-tnum`}>{formatNumber(item.count, tag)}</span>
                  <span className={styles.barTrack} aria-hidden="true">
                    <span className={styles.barFill} style={{ "--v": share, "--i": index } as CSSProperties} />
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    ) : results.kind === "empty" ? (
      <div className={styles.resEmpty}>
        <div>
          <p className={styles.textStrong}>{t("p02.results.empty")}</p>
          <p className={styles.text}>{t("p02.results.emptyHint")}</p>
          <Link className={styles.more} href="/results">
            {withArrow(t("p02.results.how"))}
          </Link>
        </div>
        <div className={styles.emptyArt}>
          <ArtEmptyResults />
        </div>
      </div>
    ) : (
      <div>
        <p className={styles.textStrong}>{t("p02.results.unavailable")}</p>
        <Link className={styles.more} href="/results">
          {withArrow(t("p02.results.open"))}
        </Link>
      </div>
    )
  );
}

/** Up to five guides from the real guide list; while it loads, or if it cannot be read, a link to all guides. */
function GuideItems({ guides: pending, t }: { guides: Awaitable<GuideSummary[] | null>; t: Translate }) {
  const guides = useSettled(pending);
  return (
    guides && guides.length > 0 ? (
      guides.slice(0, 5).map((guide) => (
        <li key={guide.slug}>
          <Link href={`/guide/${guide.slug}`} lang={localeTags[guide.language]}>
            <span className={styles.linkBody}>
              <span className={styles.linkTitle}>{guide.title}</span>
              <span className={styles.linkText}>{t("p02.help.guide")}</span>
            </span>
            <ArrowRightIcon size={20} className={styles.linkArrow} />
          </Link>
        </li>
      ))
    ) : (
      <li>
        <Link href="/guide">
          <span className={styles.linkBody}>
            <span className={styles.linkTitle}>{t("p02.help.guides")}</span>
            <span className={styles.linkText}>{t("p02.help.guidesHint")}</span>
          </span>
          <ArrowRightIcon size={20} className={styles.linkArrow} />
        </Link>
      </li>
    )
  );
}

/** The closing line appears only once totals are published, so it never contradicts the empty results. */
function EveningCaption({ results: pending, t }: { results: Awaitable<HomeResults>; t: Translate }) {
  const results = useSettled(pending);
  return results.kind === "published" ? <p className={styles.eveningCaption}>{t("p02.eveningCaption")}</p> : null;
}
