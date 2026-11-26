"use client";

import { useId, useState } from "react";
import type { Cell, PublicResultsResponse, SnapshotRecord, SnapshotStatus } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { Banner, Button, EmptyState, Field, Sheet, Skeleton, StatusBadge, Switch, useNow, type StatusTone } from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { RetryIcon } from "../../../../ui/icons";
import { ResultsView } from "../../../(public)/_views/ResultsView";
import styles from "./PublishView.module.css";

/** The shortest gap the screen asks for. The server enforces the organisation's own public delay. */
export const MIN_CUTOFF_MINUTES = 60;

export type PublishResult = { ok: true } | { ok: false; message: string };

export type PublishNotice = { tone: "ok" | "attn"; text: string };

/** Opens parts of the screen in a given state on first render. Used by the preview and tests only. */
export interface PublishSeed {
  /** "YYYY-MM-DDTHH:mm" in West Africa Time. */
  cutoff?: string;
  dialog?: "publish" | "discard" | "schedule";
  sheetMessage?: string;
}

export interface PublishViewProps {
  snapshots: SnapshotRecord[];
  selectedId: string | null;
  /** null when the current setting is not known: the API has no way to read it. */
  hourly: boolean | null;
  loading: boolean;
  error: string | null;
  notice?: PublishNotice | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  onSelect?: (id: string) => void;
  /** `cutoff` is an ISO time with an offset, or undefined to let the server use the latest allowed time. */
  onGenerate?: (cutoff: string | undefined) => Promise<PublishResult>;
  onApprove?: (record: SnapshotRecord) => Promise<PublishResult>;
  onDiscard?: (record: SnapshotRecord) => Promise<PublishResult>;
  onSetHourly?: (hourly: boolean) => Promise<PublishResult>;
  onLoadMore?: () => void;
  onRetry?: () => void;
  onDismissNotice?: () => void;
  seed?: PublishSeed | null;
  "data-testid"?: string;
}

const STATUS_TONE: Record<SnapshotStatus, StatusTone> = {
  draft: "wait",
  published: "ok",
  superseded: "wait",
  discarded: "attn",
};

/** "YYYY-MM-DDTHH:mm" in West Africa Time to epoch ms, or null if it is not a time. */
function watInstant(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}:00+01:00`);
  return Number.isNaN(ms) ? null : ms;
}

/** The first 16 characters of the audit-chain code, in groups of four so a narrow screen can wrap it. */
export function fingerprint(hash: string): string {
  return (hash.slice(0, 16).match(/.{1,4}/g) ?? []).join(" ");
}

/** S-07 publish snapshots: preview exactly what the public page will show, then approve it. */
export function PublishView({
  snapshots,
  selectedId,
  hourly,
  loading,
  error,
  notice = null,
  hasMore = false,
  loadingMore = false,
  onSelect,
  onGenerate,
  onApprove,
  onDiscard,
  onSetHourly,
  onLoadMore,
  onRetry,
  onDismissNotice,
  seed = null,
  "data-testid": testId = "publish-view",
}: PublishViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const now = useNow();
  const cutoffId = useId();
  const hourlyLabelId = useId();

  const [cutoff, setCutoff] = useState(seed?.cutoff ?? "");
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [dialog, setDialog] = useState<"publish" | "discard" | "schedule" | null>(seed?.dialog ?? null);
  const [sheetMessage, setSheetMessage] = useState<string | null>(seed?.sheetMessage ?? null);
  const [working, setWorking] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const selected = snapshots.find((s) => s.id === selectedId) ?? snapshots[0] ?? null;

  /* ---- Cutoff checks, derived on every render ---- */
  const instant = cutoff ? watInstant(cutoff) : null;
  const localProblem = !cutoff
    ? null
    : instant === null
      ? t("s07.cutoffInvalid")
      : now !== null && instant > now - MIN_CUTOFF_MINUTES * 60_000
        ? t("s07.cutoffTooRecent", { minutes: MIN_CUTOFF_MINUTES })
        : null;
  const cutoffProblem = localProblem ?? serverProblem;

  async function generate() {
    if (!onGenerate || localProblem) return;
    setServerProblem(null);
    setGenerating(true);
    const result = await onGenerate(cutoff ? `${cutoff}:00+01:00` : undefined);
    setGenerating(false);
    if (!result.ok) setServerProblem(result.message);
  }

  function closeSheet() {
    setDialog(null);
    setSheetMessage(null);
  }

  async function confirm(kind: "publish" | "discard") {
    if (!selected) return;
    const act = kind === "publish" ? onApprove : onDiscard;
    if (!act) return;
    setWorking(true);
    setSheetMessage(null);
    const result = await act(selected);
    setWorking(false);
    if (result.ok) closeSheet();
    else setSheetMessage(result.message);
  }

  async function setHourly(next: boolean) {
    if (!onSetHourly) return;
    setScheduling(true);
    setSheetMessage(null);
    const result = await onSetHourly(next);
    setScheduling(false);
    if (result.ok) closeSheet();
    else if (dialog === "schedule") setSheetMessage(result.message);
  }

  return (
    <div className={styles.page} data-testid={testId}>
      {error ? (
        <Banner
          tone="danger"
          title={error}
          critical
          action={onRetry ? <Button variant="secondary" icon={<RetryIcon />} onClick={onRetry}>{t("s07.retry")}</Button> : undefined}
        />
      ) : null}
      {notice ? <Banner tone={notice.tone} title={notice.text} onDismiss={onDismissNotice} data-testid="s07-notice" /> : null}

      <div className={styles.top}>
        {/* ---------- Cutoff and preview ---------- */}
        <section className={styles.card} aria-labelledby={`${cutoffId}-title`}>
          <div className={styles.cardHead}>
            <h2 id={`${cutoffId}-title`} className={styles.cardTitle}>{t("s07.createTitle")}</h2>
            <p className={styles.hint}>{t("s07.cutoffHint", { minutes: MIN_CUTOFF_MINUTES })}</p>
          </div>
          <form
            className={styles.cutoffForm}
            onSubmit={(event) => {
              event.preventDefault();
              void generate();
            }}
            noValidate
          >
            <Field
              id={cutoffId}
              className={styles.cutoffField}
              label={t("s07.cutoffLabel")}
              type="datetime-local"
              numeric
              value={cutoff}
              onChange={(event) => {
                setCutoff(event.target.value);
                setServerProblem(null);
              }}
              error={cutoffProblem ?? undefined}
              data-testid="s07-cutoff"
            />
            <Button type="submit" variant="primary" loading={generating} disabled={Boolean(localProblem)} data-testid="s07-generate">
              {t("s07.createButton")}
            </Button>
          </form>
        </section>

        {/* ---------- Hourly release ---------- */}
        <section className={styles.card} aria-labelledby={hourlyLabelId}>
          <div className={styles.cardHead}>
            <h2 id={hourlyLabelId} className={styles.cardTitle}>{t("s07.scheduleTitle")}</h2>
            <p className={styles.hint}>{t("s07.scheduleHint")}</p>
          </div>
          {hourly === null ? (
            <>
              <p className={styles.hint}>{t("s07.scheduleUnknown")}</p>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setDialog("schedule")} disabled={scheduling} data-testid="s07-hourly-on">
                  {t("s07.schedule.confirmOn")}
                </Button>
                <Button variant="quiet" onClick={() => void setHourly(false)} loading={scheduling} data-testid="s07-hourly-off">
                  {t("s07.schedule.turnOff")}
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.switchRow}>
              <Switch
                checked={hourly}
                labelledBy={hourlyLabelId}
                busy={scheduling}
                data-testid="s07-hourly-switch"
                onToggle={() => (hourly ? void setHourly(false) : setDialog("schedule"))}
              />
              <StatusBadge tone={hourly ? "ok" : "wait"} label={hourly ? t("s07.scheduleOn") : t("s07.scheduleOff")} />
            </div>
          )}
        </section>
      </div>

      {loading && snapshots.length === 0 && !error ? (
        <div className={styles.loading} role="status" aria-busy="true" aria-label={t("staff.loading")}>
          <Skeleton lines={8} height={44} delay={0} />
        </div>
      ) : null}

      {/* ---------- The selected release ---------- */}
      {selected ? (
        <Detail
          key={selected.id}
          record={selected}
          onApprove={() => setDialog("publish")}
          onDiscard={() => setDialog("discard")}
        />
      ) : null}

      {/* ---------- History ---------- */}
      {!loading || snapshots.length > 0 ? (
        <section className={styles.card} aria-labelledby={`${cutoffId}-history`}>
          <div className={styles.cardHead}>
            <h2 id={`${cutoffId}-history`} className={styles.cardTitle}>{t("s07.snapshotsList")}</h2>
            {snapshots.length > 0 ? <p className={styles.hint}>{t("s07.history.fingerprintNote")}</p> : null}
          </div>
          {snapshots.length === 0 && !error ? (
            <EmptyState title={t("s07.history.empty")} data-testid="s07-empty">
              <p>{t("s07.history.emptyBody")}</p>
            </EmptyState>
          ) : null}
          {snapshots.length > 0 ? (
            <>
              <p className={styles.hint}>{t("s07.history.selectHint")}</p>
              <table className={styles.table} data-testid="s07-history">
                <caption className="eg-sr-only">{t("s07.history.caption")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("s07.columns.cutoff")}</th>
                    <th scope="col">{t("s07.columns.status")}</th>
                    <th scope="col" className={styles.num}>{t("s07.columns.total")}</th>
                    <th scope="col">{t("s07.columns.fingerprint")}</th>
                    <th scope="col">{t("s07.columns.by")}</th>
                    <th scope="col">{t("s07.columns.published")}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snap) => {
                    const isSelected = snap.id === selected?.id;
                    return (
                      <tr key={snap.id} data-selected={isSelected ? "" : undefined}>
                        <th scope="row" data-label={t("s07.columns.cutoff")}>
                          <button
                            type="button"
                            className={`${styles.rowButton} eg-tnum`}
                            aria-current={isSelected ? "true" : undefined}
                            onClick={() => onSelect?.(snap.id)}
                          >
                            {formatWatDateTime(snap.cutoff, locale)}
                          </button>
                        </th>
                        <td data-label={t("s07.columns.status")}>
                          <StatusBadge tone={STATUS_TONE[snap.status]} label={t(`s07.status.${snap.status}`)} />
                        </td>
                        <td className={`${styles.num} eg-tnum`} data-label={t("s07.columns.total")}>
                          <CellText cell={snap.preview.total} />
                        </td>
                        <td data-label={t("s07.columns.fingerprint")}>
                          <code className={styles.hash}>{fingerprint(snap.preview.audit_chain_head.hash)}</code>
                        </td>
                        <td data-label={t("s07.columns.by")} className={styles.by}>{snap.created_by}</td>
                        <td data-label={t("s07.columns.published")} className="eg-tnum">
                          {snap.published_at ? formatWatDateTime(snap.published_at, locale) : <span className={styles.none}>&ndash;</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hasMore ? (
                <div className={styles.more}>
                  <Button variant="secondary" loading={loadingMore} onClick={onLoadMore} data-testid="s07-more">
                    {t("s07.history.loadMore")}
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {/* ---------- Confirm sheets ---------- */}
      {dialog === "publish" && selected ? (
        <Sheet
          open
          onClose={closeSheet}
          title={t("s07.publish.confirmTitle")}
          description={t("s07.publish.confirmBody")}
          data-testid="s07-publish-sheet"
          footer={
            <>
              <Button variant="quiet" onClick={closeSheet}>{t("s07.cancel")}</Button>
              <Button variant="primary" loading={working} onClick={() => void confirm("publish")} data-testid="s07-publish-confirm">
                {t("s07.approvePublish")}
              </Button>
            </>
          }
        >
          <div className={styles.sheetBody}>
            {sheetMessage ? <Banner tone="danger" title={sheetMessage} critical /> : null}
            <p className={styles.sub}>{t("s07.detail.by", { name: selected.created_by, cutoff: formatWatDateTime(selected.cutoff, locale) })}</p>
          </div>
        </Sheet>
      ) : null}

      {dialog === "discard" && selected ? (
        <Sheet
          open
          onClose={closeSheet}
          title={t("s07.discardConfirm.title")}
          description={t("s07.discardConfirm.body")}
          data-testid="s07-discard-sheet"
          footer={
            <>
              <Button variant="quiet" onClick={closeSheet}>{t("s07.cancel")}</Button>
              <Button variant="danger" loading={working} onClick={() => void confirm("discard")} data-testid="s07-discard-confirm">
                {t("s07.discard")}
              </Button>
            </>
          }
        >
          {sheetMessage ? <Banner tone="danger" title={sheetMessage} critical /> : null}
        </Sheet>
      ) : null}

      {dialog === "schedule" ? (
        <Sheet
          open
          onClose={closeSheet}
          title={t("s07.schedule.confirmTitle")}
          description={t("s07.schedule.confirmBody")}
          data-testid="s07-schedule-sheet"
          footer={
            <>
              <Button variant="quiet" onClick={closeSheet}>{t("s07.cancel")}</Button>
              <Button variant="primary" loading={scheduling} onClick={() => void setHourly(true)} data-testid="s07-schedule-confirm">
                {t("s07.schedule.confirmOn")}
              </Button>
            </>
          }
        >
          {sheetMessage ? <Banner tone="danger" title={sheetMessage} critical /> : null}
        </Sheet>
      ) : null}
    </div>
  );
}

function CellText({ cell }: { cell: Cell }) {
  const t = useT();
  const { locale } = useLocale();
  if (cell.suppressed) return <span className={styles.none}>{t("p03.fewerThan")}</span>;
  return <>{new Intl.NumberFormat(locale === "en" ? "en-NG" : undefined).format(cell.count)}</>;
}

/** One release: the public page exactly as it will be drawn, beside what was left out. */
function Detail({ record, onApprove, onDiscard }: { record: SnapshotRecord; onApprove: () => void; onDiscard: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const titleId = useId();
  const draft = record.status === "draft";

  const data: PublicResultsResponse = {
    generated_at: record.published_at ?? record.cutoff,
    notice_key: "results.notice",
    snapshots: [record.preview],
    combined: null,
  };

  const statusNote =
    record.status === "draft"
      ? t("s07.detail.draftNote")
      : record.status === "published"
        ? t("s07.detail.publishedNote", { time: record.published_at ? formatWatDateTime(record.published_at, locale) : "" })
        : record.status === "discarded"
          ? t("s07.detail.discardedNote")
          : t("s07.detail.supersededNote");

  const left = [
    { key: "notClosed", count: record.excluded.not_closed },
    { key: "withdrawn", count: record.excluded.withdrawn },
    { key: "afterCutoff", count: record.excluded.after_cutoff },
    { key: "otherKinds", count: record.excluded.other_kinds },
  ] as const;

  return (
    <section className={styles.detail} aria-labelledby={titleId} data-testid="s07-detail" data-status={record.status}>
      <header className={styles.detailHead}>
        <div className={styles.detailText}>
          <div className={styles.titleRow}>
            <h2 id={titleId} className={styles.cardTitle}>{t("s07.previewTitle")}</h2>
            {/* Keyed by status: when a draft becomes published the chip changes in place. */}
            <span key={record.status} className={styles.chipMorph}>
              <StatusBadge tone={STATUS_TONE[record.status]} label={t(`s07.status.${record.status}`)} />
            </span>
          </div>
          <p className={styles.sub}>{t("s07.detail.by", { name: record.created_by, cutoff: formatWatDateTime(record.cutoff, locale) })}</p>
          <p className={styles.hint}>{statusNote}</p>
        </div>
        {draft ? (
          <div className={styles.actions}>
            <Button variant="primary" onClick={onApprove} data-testid="s07-approve">{t("s07.approvePublish")}</Button>
            <Button variant="quiet" onClick={onDiscard} data-testid="s07-discard">{t("s07.discard")}</Button>
          </div>
        ) : null}
      </header>

      <div className={styles.split}>
        <aside className={styles.excluded} aria-labelledby={`${titleId}-left`} data-testid="s07-exclusions">
          <h3 id={`${titleId}-left`} className={styles.miniTitle}>{t("s07.exclusions.title")}</h3>
          <p className={styles.hint}>{t("s07.exclusions.note")}</p>
          <ul className={styles.leftList}>
            {left.map((row) => (
              <li key={row.key} data-zero={row.count === 0 ? "" : undefined} className="eg-tnum">
                {t(`s07.exclusions.${row.key}`, { count: row.count })}
              </li>
            ))}
          </ul>
        </aside>

        <div className={styles.previewCol}>
          <div className={styles.previewCaption}>
            <h3 className={styles.miniTitle}>{t("s07.preview.title")}</h3>
            <p className={styles.hint}>{t("s07.preview.note")}</p>
          </div>
          <section className={styles.frame} aria-label={t("s07.preview.label")} data-testid="s07-preview">
            <ResultsView t={t} locale={locale} state={{ kind: "ok", data, view: undefined }} />
          </section>
        </div>
      </div>
    </section>
  );
}
