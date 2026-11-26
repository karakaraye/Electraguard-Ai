"use client";

import { useState } from "react";
import type { AssignItemResult, AssignmentListResponse, AssignmentRow, Category, ReviewerWorkload } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { Banner, Button, EmptyState, SegmentedControl, Skeleton, StatusBadge, type StatusTone } from "../../../../ui";
import { formatWatTime } from "../../../../ui/format";
import { RetryIcon } from "../../../../ui/icons";
import { CATEGORY_ROWS } from "../../../(public)/_lib/public";
import { urgencyTone } from "./QueueTableView";
import styles from "./AssignView.module.css";

const CATEGORY_KEY = Object.fromEntries(CATEGORY_ROWS.map((row) => [row.value, row.key])) as Record<Category, string>;
/** ASG-02 takes 1 to 100 items per request. */
export const ASSIGN_MAX = 100;

export type AssignScope = "none" | "any";
export type AssignTarget = "suggested" | string;

export interface AssignViewProps {
  data: AssignmentListResponse | null;
  loading: boolean;
  error: string | null;
  assigning: boolean;
  scope?: AssignScope;
  onScopeChange?: (scope: AssignScope) => void;
  /** Per-row results of the last assignment, by report id. */
  results?: Record<string, AssignItemResult>;
  onAssign?: (items: Array<{ report_id: string; reviewer_id: AssignTarget; version: number }>) => void;
  onRefresh?: () => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  "data-testid"?: string;
}

/** S-04 assign: who carries what, and the cases still waiting for a reviewer. */
export function AssignView({
  data,
  loading,
  error,
  assigning,
  scope = "none",
  onScopeChange,
  results = {},
  onAssign,
  onRefresh,
  onLoadMore,
  loadingMore,
  "data-testid": testId = "assign-view",
}: AssignViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<AssignTarget>("suggested");

  const items = data?.items ?? [];
  const reviewers = data?.reviewers ?? [];
  const selectable = items.filter((item) => !results[item.id]?.ok);
  const allSelected = selectable.length > 0 && selectable.every((item) => selected.has(item.id));
  const tooMany = selected.size > ASSIGN_MAX;
  const failures = Object.values(results).filter((r) => !r.ok).length;
  const successes = Object.values(results).filter((r) => r.ok).length;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function assign(rows: AssignmentRow[], reviewer: AssignTarget) {
    if (!onAssign || rows.length === 0 || rows.length > ASSIGN_MAX) return;
    onAssign(rows.map((row) => ({ report_id: row.id, reviewer_id: reviewer, version: row.version })));
    setSelected(new Set());
  }

  const reasonLabel = (reason: NonNullable<AssignmentRow["suggested_reviewer"]>["reason"]) =>
    reason === "fewest_open_cases_in_area" ? t("s04.reasonFewestInArea") : reason === "same_area" ? t("s04.reasonArea") : t("s04.reasonFewest");

  return (
    <div className={styles.page} data-testid={testId}>
      {error ? (
        <Banner
          tone="danger"
          title={error}
          critical
          action={onRefresh ? <Button variant="secondary" icon={<RetryIcon />} onClick={onRefresh}>{t("staff.retry")}</Button> : undefined}
        />
      ) : null}
      {successes > 0 || failures > 0 ? (
        <Banner
          tone={failures ? "attn" : "ok"}
          title={[successes ? t("s04.assignedSuccess", { count: successes }) : "", failures ? t("s04.failedCount", { count: failures }) : ""].filter(Boolean).join(" ")}
          data-testid="s04-summary"
        />
      ) : null}

      <Workload reviewers={reviewers} loading={loading && !data} />

      <section className={styles.cases} aria-labelledby="s04-cases">
        <div className={styles.casesHead}>
          <h2 id="s04-cases" className={styles.sectionTitle}>{t("s04.casesTitle")}</h2>
          <div className={styles.row}>
            {onScopeChange ? (
              <SegmentedControl
                label={t("s04.casesTitle")}
                value={scope}
                onChange={(value) => onScopeChange(value as AssignScope)}
                options={[
                  { value: "none", label: t("s04.scope.unassigned") },
                  { value: "any", label: t("s04.scope.all") },
                ]}
                data-testid="s04-scope"
              />
            ) : null}
            {onRefresh ? <Button variant="quiet" icon={<RetryIcon />} onClick={onRefresh}>{t("s04.refresh")}</Button> : null}
          </div>
        </div>

        {items.length > 0 ? (
          <div className={styles.bulk} data-testid="s04-bulk">
            <span className={`${styles.count} eg-tnum`} aria-live="polite">{t("s04.selected", { count: selected.size })}</span>
            <label className={styles.target}>
              <span>{t("s04.assignTo")}</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)} data-testid="s04-target">
                <option value="suggested">{t("s04.target.suggested")}</option>
                {reviewers.map((rev) => (
                  <option key={rev.id} value={rev.id}>
                    {`${rev.display_name} · ${t("s04.openCases", { count: rev.open_cases, urgent: rev.urgent_open })}`}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="onInk"
              disabled={selected.size === 0 || tooMany || assigning}
              loading={assigning}
              onClick={() => assign(items.filter((item) => selected.has(item.id)), target)}
              data-testid="s04-assign"
            >
              {t("s04.bulkAssign", { count: selected.size })}
            </Button>
            {tooMany ? <span className={styles.warn} role="status">{t("s04.maxNote", { max: ASSIGN_MAX })}</span> : null}
          </div>
        ) : null}

        {loading && items.length === 0 && !error ? (
          <div className={styles.loading} role="status" aria-busy="true" aria-label={t("staff.loading")}>
            <Skeleton lines={6} height={44} delay={0} />
          </div>
        ) : !error && items.length === 0 ? (
          <EmptyState title={scope === "none" ? t("s04.emptyUnassigned") : t("s04.emptyAll")} data-testid="s04-empty" />
        ) : items.length > 0 ? (
          <div className={styles.scroller} role="region" aria-labelledby="s04-cases" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.checkCol}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((item) => item.id)))}
                      aria-label={t("s04.selectAll")}
                      data-testid="s04-select-all"
                    />
                  </th>
                  <th scope="col" className={styles.wide}>{t("s02.columns.urgency")}</th>
                  <th scope="col">{t("s02.columns.reference")}</th>
                  <th scope="col" className={styles.wide}>{t("s02.columns.category")}</th>
                  <th scope="col" className={styles.wide}>{t("s02.columns.location")}</th>
                  <th scope="col" className={styles.wide}>{t("s04.columns.received")}</th>
                  <th scope="col">{t("s04.columns.reviewer")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const result = results[item.id];
                  const done = result?.ok === true;
                  return (
                    <tr key={item.id} data-selected={selected.has(item.id) ? "" : undefined} data-done={done ? "" : undefined}>
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggle(item.id)}
                          disabled={done}
                          aria-label={t("s04.selectRow", { ref: item.receipt_code })}
                        />
                      </td>
                      <td className={`${styles.wide} ${styles.nowrap}`}>
                        <StatusBadge tone={urgencyTone(item.urgency.level)} label={t(`s02.urgency.${item.urgency.level}`)} />
                      </td>
                      <th scope="row" className={`${styles.ref} eg-tnum`}>
                        <span className={styles.refStack}>
                          {item.receipt_code}
                          <span className={styles.phoneOnly}>
                            <StatusBadge tone={urgencyTone(item.urgency.level)} label={t(`s02.urgency.${item.urgency.level}`)} />
                          </span>
                        </span>
                      </th>
                      <td className={styles.wide}>{t(CATEGORY_KEY[item.category.value])}</td>
                      <td className={styles.wide}>
                        {item.area ? (
                          <span className={styles.place}>
                            <span>{item.area.lga_name ?? item.area.state_name}</span>
                            {item.area.lga_name ? <span className={styles.sub}>{item.area.state_name}</span> : null}
                          </span>
                        ) : (
                          <span className={styles.sub}>{t("s02.noPlace")}</span>
                        )}
                      </td>
                      <td className={`${styles.wide} ${styles.nowrap} eg-tnum`}>{formatWatTime(item.received_at, locale)}</td>
                      <td className={styles.reviewerCell}>
                        {result || item.assigned_reviewer ? (
                          <RowResult result={result} current={item.assigned_reviewer?.display_name ?? null} />
                        ) : item.suggested_reviewer ? (
                          <div className={styles.suggestion}>
                            <span className={styles.chip}>{t("s04.suggestedBadge", { name: item.suggested_reviewer.display_name })}</span>
                            <span className={styles.sub}>{reasonLabel(item.suggested_reviewer.reason)}</span>
                            {!done ? (
                              <Button
                                variant="secondary"
                                disabled={assigning}
                                onClick={() => assign([item], item.suggested_reviewer!.id)}
                                data-testid={`s04-take-${item.id}`}
                              >
                                {t("s04.takeSuggested")}
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <span className={styles.sub}>{t("s04.noSuggestion")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {data?.next_cursor && onLoadMore ? (
          <div className={styles.more}>
            <Button variant="secondary" onClick={onLoadMore} loading={loadingMore}>{t("s02.loadMore")}</Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function RowResult({ result, current }: { result?: AssignItemResult; current: string | null }) {
  const t = useT();
  if (!result) {
    return current ? <span>{t("s04.result.assigned", { name: current })}</span> : <span className={styles.sub}>{t("s04.result.none")}</span>;
  }
  if (result.ok) return <StatusBadge tone="ok" label={t("s04.result.assigned", { name: result.assigned_reviewer.display_name })} />;
  const code = result.error.code;
  const [tone, label]: [StatusTone, string] =
    code === "already_assigned" ? ["attn", t("s04.result.already")]
      : code === "stale_version" ? ["attn", t("s04.result.stale")]
        : ["danger", t("s04.result.failed")];
  return <StatusBadge tone={tone} label={label} />;
}

/** Each reviewer's open cases as a bar; the urgent part is drawn solid. */
function Workload({ reviewers, loading }: { reviewers: ReviewerWorkload[]; loading: boolean }) {
  const t = useT();
  const max = Math.max(1, ...reviewers.map((r) => r.open_cases));
  const sorted = [...reviewers].sort((a, b) => b.open_cases - a.open_cases || a.display_name.localeCompare(b.display_name));
  return (
    <section className={styles.workload} aria-labelledby="s04-workload">
      <h2 id="s04-workload" className={styles.sectionTitle}>{t("s04.workloadTitle")}</h2>
      {loading ? (
        <Skeleton lines={4} height={28} delay={0} />
      ) : reviewers.length === 0 ? (
        <p className={styles.sub}>{t("s04.noReviewers")}</p>
      ) : (
        <ul className={styles.bars}>
          {sorted.map((rev) => (
            <li key={rev.id}>
              <span className={styles.who}>
                <span className={styles.name}>{rev.display_name}</span>
                {rev.active_now ? (
                  <span className={styles.active}>
                    <span className={styles.dot} aria-hidden="true" />
                    {t("s04.activeNow")}
                  </span>
                ) : null}
                <span className={styles.sub}>{t("s04.areas", { count: rev.areas.length })}</span>
              </span>
              <span className={styles.track} aria-hidden="true">
                <span className={styles.open} style={{ width: `${(rev.open_cases / max) * 100}%` }}>
                  <span className={styles.urgent} style={{ width: rev.open_cases ? `${(rev.urgent_open / rev.open_cases) * 100}%` : 0 }} />
                </span>
              </span>
              <span className={`${styles.figures} eg-tnum`}>{t("s04.openCases", { count: rev.open_cases, urgent: rev.urgent_open })}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.legend}>
        <span className={styles.keyUrgent} aria-hidden="true" />
        {t("s02.urgency.urgent")}
        <span className={styles.keyOpen} aria-hidden="true" />
        {t("s04.legendOpen")}
      </p>
    </section>
  );
}
