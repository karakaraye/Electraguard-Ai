"use client";

import { useState } from "react";
import type { Category, ChecklistStage, Cluster, CoverageResponse, LateMaterialsResponse, OverviewResponse } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { Banner, Button, DataTable, MetricTile, Skeleton, StatusBadge, TextArea, type Column, type StatusTone } from "../../../../ui";
import { formatWatDateTime, formatWatTime } from "../../../../ui/format";
import { CheckIcon, RetryIcon } from "../../../../ui/icons";
import { CATEGORY_ROWS } from "../../../(public)/_lib/public";
import { QUESTIONS } from "../../../(observer)/o/_lib/checklist";
import styles from "./OpsView.module.css";

const CATEGORY_KEY = Object.fromEntries(CATEGORY_ROWS.map((row) => [row.value, row.key])) as Record<Category, string>;
const QUESTION_KEY: Record<string, string> = {
  ...Object.fromEntries(Object.values(QUESTIONS).flat().map((q) => [q.id, q.key])),
  materials_missing: "o15.q.materialsList",
};
export const STAGES: Array<{ value: ChecklistStage; key: string }> = [
  { value: "arrival", key: "o15.stage.arrival" },
  { value: "opening", key: "o15.stage.opening" },
  { value: "accreditation", key: "o15.stage.accreditation" },
  { value: "voting", key: "o15.stage.voting" },
  { value: "closing_counting", key: "o15.stage.closing" },
  { value: "results_posted", key: "o15.stage.results" },
];
const NOTE_MAX = 500;

/** One section's data: null while loading, or the error message when it failed. */
export type Section<T> = { data: T | null; loading: boolean; error: string | null };

export interface OpsViewProps {
  date: string;
  onDateChange?: (date: string) => void;
  today: string;
  stage: ChecklistStage;
  onStageChange?: (stage: ChecklistStage) => void;
  overview: Section<OverviewResponse>;
  clusters: Section<Cluster[]>;
  coverage: Section<CoverageResponse>;
  lateMaterials: Section<LateMaterialsResponse>;
  reviewing?: string | null;
  onReviewCluster?: (id: string, note?: string) => void;
  onRefresh?: () => void;
  "data-testid"?: string;
}

/** S-05 operations room: today's totals, where reports come from, clusters, coverage and late-materials risk. */
export function OpsView({
  date,
  onDateChange,
  today,
  stage,
  onStageChange,
  overview,
  clusters,
  coverage,
  lateMaterials,
  reviewing,
  onReviewCluster,
  onRefresh,
  "data-testid": testId = "ops-view",
}: OpsViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const totals = overview.data?.totals;
  const period = date === today ? t("s05.today") : date;

  return (
    <div className={styles.page} data-testid={testId}>
      <div className={styles.toolbar}>
        <label className={styles.dateField}>
          <span>{t("s05.filterDate")}</span>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && onDateChange?.(e.target.value)} data-testid="s05-date" />
        </label>
        {date !== today ? <Button variant="quiet" onClick={() => onDateChange?.(today)}>{t("s05.today")}</Button> : null}
        <span className={styles.updated}>
          {overview.data ? <span className="eg-tnum">{t("s05.updated", { time: formatWatTime(overview.data.generated_at, locale) })}</span> : null}
          {onRefresh ? <Button variant="quiet" icon={<RetryIcon />} onClick={onRefresh}>{t("s05.refresh")}</Button> : null}
        </span>
      </div>

      {overview.error ? <Banner tone="danger" title={overview.error} critical /> : null}

      <section aria-label={t("s05.totalsLabel")}>
        {overview.loading && !totals ? (
          <div className={styles.tiles}><Skeleton lines={2} height={72} delay={0} /></div>
        ) : totals ? (
          <div className={styles.tiles}>
            <MetricTile value={totals.reports} label={t("s05.totals.totalReports")} period={period} />
            <MetricTile value={totals.incidents_after_links} label={t("s05.totals.incidents")} period={period} />
            <MetricTile value={totals.urgent_open} label={t("s05.totals.urgentOpen")} period={period} />
            <MetricTile value={totals.open_questions} label={t("s05.totals.openQuestions")} period={period} />
            <div className={styles.flagTile}>
              <MetricTile value={totals.result_sheet_flags_open} label={t("s05.totals.resultFlags")} period={period} />
              <p className={styles.notResult}>{t("s05.notResult")}</p>
            </div>
            <MetricTile value={totals.withdrawn} label={t("s05.totals.withdrawn")} period={period} />
          </div>
        ) : null}
      </section>

      <div className={styles.split}>
        <ByLga overview={overview} />
        <Clusters clusters={clusters} reviewing={reviewing ?? null} onReview={onReviewCluster} />
      </div>

      <Coverage coverage={coverage} stage={stage} onStageChange={onStageChange} />
      <LateMaterials section={lateMaterials} />
    </div>
  );
}

function SectionHead({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
  return (
    <div className={styles.sectionHead}>
      <h2 id={id} className={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

function SectionBody<T>({ section, empty, children }: { section: Section<T>; empty: boolean; children: React.ReactNode }) {
  const t = useT();
  if (section.error) return <p className={styles.sectionError} role="alert">{section.error}</p>;
  if (section.loading && !section.data) return <Skeleton lines={4} height={28} delay={0} />;
  if (empty) return <p className={styles.muted}>{t("s05.empty")}</p>;
  return <>{children}</>;
}

/* ---------- Reports by LGA ---------- */

type LgaRow = OverviewResponse["by_lga"][number];

function ByLga({ overview }: { overview: Section<OverviewResponse> }) {
  const t = useT();
  const rows = overview.data?.by_lga ?? [];
  const max = Math.max(1, ...rows.map((r) => r.count));
  const columns: Column<LgaRow>[] = [
    { key: "lga_name", header: t("s05.lga.lga"), sortable: true, rowHeader: true },
    {
      key: "count",
      header: t("s05.lga.reports"),
      sortable: true,
      numeric: true,
      render: (row) => (
        <span className={styles.barCell}>
          <span className={styles.bar} aria-hidden="true">
            <span style={{ width: `${(row.count / max) * 100}%` }}>
              <span className={styles.barUrgent} style={{ width: row.count ? `${(row.urgent / row.count) * 100}%` : 0 }} />
            </span>
          </span>
          <span>{row.count}</span>
        </span>
      ),
    },
    { key: "urgent", header: t("s05.lga.urgent"), sortable: true, numeric: true },
  ];
  return (
    <section className={styles.card} aria-labelledby="s05-lga">
      <SectionHead id="s05-lga" title={t("s05.lgaBreakdown.title")} />
      <SectionBody section={overview} empty={rows.length === 0}>
        <DataTable
          caption={t("s05.lgaBreakdown.title")}
          captionHidden
          columns={columns}
          rows={rows}
          rowKey={(row) => row.lga_code}
          initialSort={{ key: "count", direction: "descending" }}
          data-testid="s05-lga-table"
        />
      </SectionBody>
    </section>
  );
}

/* ---------- Cluster warnings ---------- */

function Clusters({ clusters, reviewing, onReview }: { clusters: Section<Cluster[]>; reviewing: string | null; onReview?: (id: string, note?: string) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const list = clusters.data ?? [];
  const open = list.filter((c) => c.status === "open").length;
  return (
    <section className={styles.card} aria-labelledby="s05-clusters">
      <SectionHead id="s05-clusters" title={t("s05.clusters.title")}>
        {open ? <StatusBadge tone="attn" label={t("s05.clusters.openCount", { count: open })} /> : null}
      </SectionHead>
      <SectionBody section={clusters} empty={list.length === 0}>
        <ul className={styles.clusters}>
          {list.map((cluster) => {
            const minutes = Math.max(1, Math.round((Date.parse(cluster.window_end) - Date.parse(cluster.window_start)) / 60000));
            const reviewed = cluster.status === "reviewed";
            return (
              <li key={cluster.id} className={styles.cluster} data-reviewed={reviewed ? "" : undefined} data-testid={`s05-cluster-${cluster.id}`}>
                <div className={styles.clusterHead}>
                  <p className={styles.clusterTitle}>{t(CATEGORY_KEY[cluster.category])}</p>
                  {reviewed ? <StatusBadge tone="ok" label={t("s05.clusters.reviewedBadge")} /> : <StatusBadge tone="attn" label={t("s05.clusters.badge", { count: cluster.report_count, window: minutes })} />}
                </div>
                <p className={styles.muted}>
                  {[cluster.area.lga_name, cluster.area.state_name].filter(Boolean).join(", ")}
                  {" · "}
                  <span className="eg-tnum">{`${formatWatTime(cluster.window_start, locale)}–${formatWatTime(cluster.window_end, locale)}`}</span>
                </p>
                <p className={`${styles.muted} eg-tnum`}>{t("s05.clusters.baseline", { baseline: cluster.baseline })}</p>
                {reviewed ? (
                  <p className={styles.reviewed}>
                    <CheckIcon size={16} />
                    {cluster.reviewed_at
                      ? t("s05.clusters.reviewedBy", { name: cluster.reviewed_by ?? "", time: formatWatDateTime(cluster.reviewed_at, locale) })
                      : t("s05.clusters.reviewedBadge")}
                  </p>
                ) : onReview ? (
                  <form
                    className={styles.reviewForm}
                    onSubmit={(e) => {
                      e.preventDefault();
                      onReview(cluster.id, notes[cluster.id]?.trim() || undefined);
                    }}
                  >
                    <TextArea
                      id={`note-${cluster.id}`}
                      label={t("s05.clusters.reviewNote")}
                      maxLength={NOTE_MAX}
                      rows={2}
                      value={notes[cluster.id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [cluster.id]: e.target.value })}
                    />
                    <div>
                      <Button type="submit" variant="secondary" loading={reviewing === cluster.id}>{t("s05.clusters.reviewButton")}</Button>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      </SectionBody>
    </section>
  );
}

/* ---------- Coverage gaps ---------- */

type CoverageRow = CoverageResponse["rows"][number];

function Coverage({ coverage, stage, onStageChange }: { coverage: Section<CoverageResponse>; stage: ChecklistStage; onStageChange?: (stage: ChecklistStage) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const rows = coverage.data?.rows ?? [];
  const lgaRows = rows.filter((r): r is Extract<CoverageRow, { lga_code: string }> => "lga_code" in r);
  const expected = lgaRows.reduce((sum, r) => sum + r.expected_units, 0);
  const reported = lgaRows.reduce((sum, r) => sum + r.units_with_checklist, 0);
  const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
  const columns: Column<CoverageRow>[] = [
    { key: "name", header: t("s05.lga.lga"), rowHeader: true, sortable: true, sortValue: (r) => ("lga_code" in r ? r.lga_name : r.polling_unit_name), render: (r) => ("lga_code" in r ? r.lga_name : r.polling_unit_name) },
    { key: "expected", header: t("s05.coverage.colExpected"), numeric: true, sortable: true, sortValue: (r) => ("lga_code" in r ? r.expected_units : 1), render: (r) => ("lga_code" in r ? r.expected_units : 1) },
    {
      key: "reported",
      header: t("s05.coverage.colReported"),
      numeric: true,
      sortable: true,
      sortValue: (r) => ("lga_code" in r ? pct(r.units_with_checklist, r.expected_units) : r.has_checklist ? 100 : 0),
      render: (r) => {
        const value = "lga_code" in r ? pct(r.units_with_checklist, r.expected_units) : r.has_checklist ? 100 : 0;
        return (
          <span className={styles.barCell}>
            <span className={styles.bar} aria-hidden="true"><span style={{ width: `${value}%` }} /></span>
            <span>{`${value}%`}</span>
          </span>
        );
      },
    },
    { key: "missing", header: t("s05.coverage.colMissing"), numeric: true, sortable: true, sortValue: (r) => ("lga_code" in r ? r.units_without : r.has_checklist ? 0 : 1), render: (r) => ("lga_code" in r ? r.units_without : r.has_checklist ? 0 : 1) },
    { key: "no", header: t("s05.coverage.colNo"), numeric: true, sortable: true, sortValue: (r) => r.no_answers, render: (r) => r.no_answers },
  ];

  return (
    <section className={styles.card} aria-labelledby="s05-coverage">
      <SectionHead id="s05-coverage" title={t("s05.coverage.title")}>
        <label className={styles.inlineSelect}>
          <span>{t("s05.coverage.stage")}</span>
          <select value={stage} onChange={(e) => onStageChange?.(e.target.value as ChecklistStage)} data-testid="s05-stage">
            {STAGES.map((s) => <option key={s.value} value={s.value}>{t(s.key)}</option>)}
          </select>
        </label>
      </SectionHead>
      <SectionBody section={coverage} empty={rows.length === 0}>
        {lgaRows.length ? (
          <p className={`${styles.summary} eg-tnum`}>
            {t("s05.coverage.summary", { reported, expected, percent: pct(reported, expected), missing: expected - reported })}
          </p>
        ) : null}
        <DataTable
          caption={t("s05.coverage.title")}
          captionHidden
          columns={columns}
          rows={rows}
          rowKey={(r) => ("lga_code" in r ? r.lga_code : r.polling_unit_code)}
          initialSort={{ key: "missing", direction: "descending" }}
          data-testid="s05-coverage-table"
        />
        {coverage.data?.most_no_answers.length ? (
          <div className={styles.noAnswers}>
            <h3 className={styles.subTitle}>{t("s05.coverage.noAnswers")}</h3>
            <ul>
              {coverage.data.most_no_answers.map((unit) => (
                <li key={unit.polling_unit_code}>
                  <span className={styles.unit}>
                    <span>{unit.polling_unit_name}</span>
                    <span className={`${styles.muted} eg-tnum`}>{unit.polling_unit_code}</span>
                  </span>
                  <span className={styles.noList}>
                    <strong className="eg-tnum">{t("s05.coverage.noCount", { count: unit.no_count })}</strong>
                    <span className={styles.muted}>{unit.questions.map((q) => (QUESTION_KEY[q] ? t(QUESTION_KEY[q]) : q)).join(" · ")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {coverage.data ? <p className={`${styles.muted} eg-tnum`}>{t("s05.updated", { time: formatWatTime(coverage.data.as_of, locale) })}</p> : null}
      </SectionBody>
    </section>
  );
}

/* ---------- Late-materials risk ---------- */

type LateRow = LateMaterialsResponse["rows"][number];

function LateMaterials({ section }: { section: Section<LateMaterialsResponse> }) {
  const t = useT();
  const { locale } = useLocale();
  const data = section.data;
  const riskTone: Record<LateRow["risk"], StatusTone> = { high: "danger", medium: "attn", low: "wait" };
  const riskLabel = (risk: LateRow["risk"]) =>
    risk === "high" ? t("s05.lateMaterials.riskHigh") : risk === "medium" ? t("s05.lateMaterials.riskMedium") : t("s05.lateMaterials.riskLow");
  const columns: Column<LateRow>[] = [
    { key: "rank", header: t("s05.late.rank"), numeric: true, sortable: true },
    { key: "risk", header: t("s05.late.risk"), sortable: true, sortValue: (r) => ["high", "medium", "low"].indexOf(r.risk), render: (r) => <span className={styles.nowrap}><StatusBadge tone={riskTone[r.risk]} label={riskLabel(r.risk)} /></span> },
    { key: "place", header: t("s05.late.place"), rowHeader: true, render: (r) => <span className={styles.unit}><span>{r.ward_name}</span><span className={styles.muted}>{r.lga_name}</span></span> },
    { key: "predicted_transit_hours", header: t("s05.late.transit"), numeric: true, sortable: true, render: (r) => t("s05.lateMaterials.hours", { hours: r.predicted_transit_hours.toFixed(1) }) },
    { key: "factors", header: t("s05.late.factors"), render: (r) => <span className={styles.muted}>{r.factors.join(" · ")}</span> },
  ];
  return (
    <section className={styles.card} aria-labelledby="s05-late">
      <SectionHead id="s05-late" title={t("s05.lateMaterials.title")}>
        <span className={styles.suggested}>{t("ui.suggestion.label")}</span>
      </SectionHead>
      <SectionBody section={section} empty={(data?.rows.length ?? 0) === 0}>
        {data ? (
          <>
            <DataTable caption={t("s05.lateMaterials.title")} captionHidden columns={columns} rows={data.rows} rowKey={(r) => r.polling_unit_code} data-testid="s05-late-table" />
            <p className={`${styles.muted} eg-tnum`}>
              {[
                data.model_version ? t("s05.late.model", { version: data.model_version }) : null,
                typeof data.metrics?.mae_transit_hours === "number" ? t("s05.late.error", { hours: data.metrics.mae_transit_hours.toFixed(1), on: data.metrics.evaluated_on ?? "" }) : null,
                data.generated_at ? t("s05.updated", { time: formatWatDateTime(data.generated_at, locale) }) : null,
              ].filter(Boolean).join(" · ")}
            </p>
          </>
        ) : null}
      </SectionBody>
      {data?.data_source === "synthetic" ? <p className={styles.footnote} data-testid="s05-synthetic">{t("s05.syntheticNote")}</p> : null}
    </section>
  );
}
