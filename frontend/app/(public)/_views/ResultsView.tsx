import Link from "next/link";
import type { Cell, PublicResultsResponse, PublicSnapshot } from "../../../lib/api/types";
import type { Locale, Translate } from "../../../lib/i18n";
import { formatNumber, localeTags } from "../../../lib/i18n";
import { EmptyState } from "../../../ui/EmptyState/EmptyState";
import { formatWatDateTime, formatWatTime } from "../../../ui/format";
import { CountBar, maxCount } from "../_components/CountBar";
import { CATEGORY_ROWS, OUTCOME_KEYS } from "../_lib/public";
import styles from "./results.module.css";

type View = Omit<PublicSnapshot, "organisation" | "snapshot_id" | "audit_chain_head"> &
  Partial<Pick<PublicSnapshot, "organisation" | "snapshot_id" | "audit_chain_head">>;

export type ResultsState =
  | { kind: "ok"; data: PublicResultsResponse; view: string | undefined }
  | { kind: "empty" }
  | { kind: "error" };

type CategoryKey = keyof PublicSnapshot["by_state"][number]["by_category"];

function percent(value: number, tag: string) {
  const supported = Intl.NumberFormat.supportedLocalesOf([tag]).length ? tag : "en-NG";
  return new Intl.NumberFormat(supported, { maximumFractionDigits: 1 }).format(value);
}

/** Largest first; suppressed ("fewer than 5") rows go last, in their original order. */
function byCount<T>(items: T[], cell: (item: T) => { count: number | null; suppressed?: boolean }): T[] {
  const value = (item: T) => {
    const c = cell(item);
    return c.suppressed || c.count === null ? -1 : c.count;
  };
  return items.map((item, index) => ({ item, index })).sort((a, b) => value(b.item) - value(a.item) || a.index - b.index).map((x) => x.item);
}

function BarTable({
  caption,
  first,
  second,
  rows,
  extra,
}: {
  caption: string;
  first: string;
  second: string;
  rows: Array<{ key: string; label: string; cell: Cell; text: string; extra?: string; tnum?: boolean; fewer?: string }>;
  extra?: string;
}) {
  const max = maxCount(rows.map((r) => r.cell));
  return (
    <table className={styles.table}>
      <caption className="eg-sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{first}</th>
          {extra ? <th scope="col" className={styles.num}>{extra}</th> : null}
          <th scope="col" className={styles.barCol}>{second}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <BarRow key={row.key} row={row} withExtra={Boolean(extra)} max={max} />
        ))}
      </tbody>
    </table>
  );
}

function BarRow({
  row,
  withExtra,
  max,
}: {
  row: { label: string; cell: Cell; text: string; extra?: string; tnum?: boolean; fewer?: string };
  withExtra: boolean;
  max: number;
}) {
  return (
    <tr>
      <th scope="row" className={row.tnum ? "eg-tnum" : undefined}>{row.label}</th>
      {withExtra ? <td className={`${styles.num} eg-tnum`}>{row.extra ?? ""}</td> : null}
      <td>
        <CountBar cell={row.cell} max={max} fewer={row.fewer ?? ""} text={row.text} />
      </td>
    </tr>
  );
}

/** P-03 transparency results: reviewed reports by state and category, outcome shares and a timeline. */
export function ResultsView({ t, locale, state }: { t: Translate; locale: Locale; state: ResultsState }) {
  const tag = localeTags[locale];
  const n = (value: number) => formatNumber(value, tag);
  const fewer = t("p03.fewerThan");
  const row = (key: string, label: string, cell: Cell, more: { extra?: string; tnum?: boolean } = {}) => ({
    key,
    label,
    cell,
    text: cell.suppressed ? "" : n(cell.count),
    fewer,
    ...more,
  });

  const header = (noticeText: string) => (
    <header className={styles.header}>
      <h1 className={styles.title}>{t("p03.title")}</h1>
      <p className={styles.lead}>{t("p03.lead")}</p>
      <p className={styles.notice} data-testid="results-notice">{noticeText}</p>
    </header>
  );

  if (state.kind !== "ok") {
    return (
      <div className={styles.page}>
        {header(t("results.notice"))}
        {state.kind === "empty" ? (
          <EmptyState title={t("p03.empty.title")} data-testid="results-empty">
            <p>{t("p03.empty.body")}</p>
          </EmptyState>
        ) : (
          <EmptyState
            title={t("p03.error.title")}
            data-testid="results-error"
            action={
              <Link className={styles.retry} href="/results">
                {t("p03.retry")}
              </Link>
            }
          >
            <p>{t("p03.error.body")}</p>
          </EmptyState>
        )}
      </div>
    );
  }

  const { data } = state;
  const choices: Array<{ id: string; label: string; view: View }> = [
    ...(data.combined ? [{ id: "combined", label: t("p03.view.combined"), view: data.combined as View }] : []),
    ...data.snapshots.map((snap) => ({ id: snap.organisation.id, label: snap.organisation.name, view: snap as View })),
  ];
  const chosen = choices.find((choice) => choice.id === state.view) ?? choices[0];
  const view = chosen.view;

  return (
    <div className={styles.page}>
      {header(t(data.notice_key))}

      {choices.length > 1 ? (
        <nav className={styles.views} aria-label={t("p03.view.label")}>
          <ul>
            {choices.map((choice) => (
              <li key={choice.id}>
                <Link href={`/results?view=${encodeURIComponent(choice.id)}`} aria-current={choice.id === chosen.id ? "page" : undefined}>
                  {choice.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <section className={styles.summary} aria-labelledby="p03-total" data-testid="results-summary">
        <h2 id="p03-total" className={styles.total}>
          {view.total.suppressed ? (
            t("p03.totalSuppressed")
          ) : (
            <>
              <span className={`${styles.totalNumber} eg-tnum`}>{n(view.total.count)}</span>{" "}
              <span className={styles.totalUnit}>{t("p03.totalUnit", { count: view.total.count })}</span>
            </>
          )}
        </h2>
        <dl className={styles.facts}>
          {chosen.id !== "combined" && view.organisation ? (
            <div>
              <dt>{t("p03.source")}</dt>
              <dd>{view.organisation.name}</dd>
            </div>
          ) : null}
          {view.published_at ? (
            <div>
              <dt>{t("p03.publishedLabel")}</dt>
              <dd className="eg-tnum">{formatWatDateTime(view.published_at, locale)}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t("p03.cutoffLabel")}</dt>
            <dd className="eg-tnum">{formatWatDateTime(view.cutoff, locale)}</dd>
          </div>
        </dl>
        <p className={styles.small}>{t("p03.delay", { minutes: view.delay_minutes })}</p>
        {chosen.id === "combined" ? <p className={styles.small}>{t("p03.combinedNote")}</p> : null}
      </section>

      <section className={styles.section} aria-labelledby="p03-states">
        <h2 id="p03-states" className={styles.heading}>{t("p03.byState.title")}</h2>
        {view.by_state.length === 0 ? (
          <p className={styles.small}>{t("p03.noRows")}</p>
        ) : (
          <BarTable
            caption={t("p03.byState.caption")}
            first={t("p03.col.state")}
            second={t("p03.col.reports")}
            rows={byCount(view.by_state, (s) => s.total).map((s) => row(s.state_code, s.state_name, s.total))}
          />
        )}
      </section>

      {view.by_state.length > 0 ? (
        <section className={styles.section} aria-labelledby="p03-categories">
          <h2 id="p03-categories" className={styles.heading}>{t("p03.categories.title")}</h2>
          <p className={styles.small}>{t("p03.categories.hint")}</p>
          <div className={styles.states}>
            {byCount(view.by_state, (s) => s.total).map((s, index) => (
              <details key={s.state_code} className={styles.state} open={index === 0}>
                <summary>
                  <span className={styles.stateName}>{s.state_name}</span>
                  <span className={`${styles.stateCount} eg-tnum`}>{s.total.suppressed ? fewer : n(s.total.count)}</span>
                </summary>
                <BarTable
                  caption={t("p03.categories.caption", { state: s.state_name })}
                  first={t("p03.col.category")}
                  second={t("p03.col.reports")}
                  rows={CATEGORY_ROWS.filter((cat) => s.by_category[cat.value as CategoryKey] !== undefined).map((cat) =>
                    row(cat.value, t(cat.key), s.by_category[cat.value as CategoryKey]!),
                  )}
                />
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="p03-outcomes">
        <h2 id="p03-outcomes" className={styles.heading}>{t("p03.outcomes.title")}</h2>
        <p className={styles.small}>{t("p03.outcomes.hint")}</p>
        <BarTable
          caption={t("p03.outcomes.caption")}
          first={t("p03.col.outcome")}
          extra={t("p03.col.share")}
          second={t("p03.col.reports")}
          rows={byCount(view.outcomes, (o) => ({ count: o.suppressed ? null : o.count, suppressed: o.suppressed })).map((o) =>
            o.suppressed
              ? row(o.outcome, t(OUTCOME_KEYS[o.outcome]), { count: null, suppressed: true })
              : row(o.outcome, t(OUTCOME_KEYS[o.outcome]), { count: o.count, suppressed: false }, { extra: t("p03.percent", { value: percent(o.share_percent, tag) }) }),
          )}
        />
      </section>

      {view.timeline.length > 0 ? (
        <section className={styles.section} aria-labelledby="p03-timeline">
          <h2 id="p03-timeline" className={styles.heading}>{t("p03.timeline.title")}</h2>
          <p className={styles.small}>{t("p03.timeline.hint")}</p>
          <BarTable
            caption={t("p03.timeline.caption")}
            first={t("p03.col.hour")}
            second={t("p03.col.reports")}
            rows={view.timeline.map((h) => row(h.hour_start, formatWatTime(h.hour_start, locale), h.count, { tnum: true }))}
          />
        </section>
      ) : null}

      {view.audit_chain_head ? (
        <section className={styles.audit} aria-labelledby="p03-audit">
          <h2 id="p03-audit" className={styles.subheading}>{t("p03.audit.title")}</h2>
          <p className={styles.small}>
            {t("p03.audit.body", { count: view.audit_chain_head.event_count, time: formatWatDateTime(view.audit_chain_head.at, locale) })}
          </p>
          <p className={`${styles.hash} eg-tnum`}>{view.audit_chain_head.hash}</p>
          <p className={styles.small}>{t("p03.audit.explain")}</p>
        </section>
      ) : null}
    </div>
  );
}
