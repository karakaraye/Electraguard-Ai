"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { CodeBatch, CodeCard, CodeStatus, ObserverCodeRow, RevokeReason } from "../../../../lib/api/types";
import { localeTags, type Locale } from "../../../../lib/i18n/config";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { BrandMark, Banner, Button, EmptyState, Field, Select, Sheet, Skeleton, StatusBadge, type StatusTone } from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { useMediaQuery } from "../../../../ui/hooks";
import { PlusIcon, RetryIcon } from "../../../../ui/icons";
import styles from "./AdminCodesView.module.css";

const REASONS: RevokeReason[] = ["lost_phone", "left_programme", "suspected_misuse", "other"];
const STATUSES: CodeStatus[] = ["unclaimed", "active", "locked", "revoked"];
const LABEL_MAX = 80;
const COUNT_MAX = 500;

/** What a sheet action reports back. The message is already in the reader's language. */
export type CodesActionResult =
  | { ok: true }
  | { ok: false; message?: string; fields?: { label?: string; count?: string } };

/**
 * The cards on screen. The setup PINs inside exist only in the response that made them, so the page
 * keeps this in memory until the admin presses Done and never writes it anywhere.
 */
export interface CardSet {
  cards: CodeCard[];
  /** "batch" is a whole batch; "single" is one card from a reissue or a PIN reset. */
  kind: "batch" | "single";
  label?: string;
}

/** Opens a sheet on first render. Used by the preview and by tests; the real page never sets it. */
export interface CodesDialogSeed {
  kind: "create" | "print" | "revoke" | "reissue" | "reset";
  batchId?: string;
  code?: string;
  label?: string;
  count?: string;
  reason?: RevokeReason;
  message?: string;
  fields?: { label?: string; count?: string };
}

type Dialog =
  | { kind: "create" }
  | { kind: "print"; batch: CodeBatch }
  | { kind: "revoke" | "reissue" | "reset"; row: ObserverCodeRow };

type Filter = "all" | CodeStatus;
export type CodesFilter = Filter;

export interface AdminCodesViewProps {
  batches: CodeBatch[];
  codes: ObserverCodeRow[];
  cardSet: CardSet | null;
  loading: boolean;
  error: string | null;
  onCreateBatch?: (label: string, count: number) => Promise<CodesActionResult>;
  onPrintBatch?: (batchId: string) => Promise<CodesActionResult>;
  onRevoke?: (code: string, reason: RevokeReason) => Promise<CodesActionResult>;
  onReissue?: (code: string, reason: RevokeReason) => Promise<CodesActionResult>;
  onResetPin?: (code: string) => Promise<CodesActionResult>;
  onCloseCards?: () => void;
  onRetry?: () => void;
  initialDialog?: CodesDialogSeed | null;
  /** Start states for the preview and tests; the real page never sets these. */
  initialSearch?: string;
  initialFilter?: Filter;
  initialNotice?: string | null;
  "data-testid"?: string;
}

const statusTone: Record<CodeStatus, StatusTone> = { unclaimed: "wait", active: "ok", locked: "attn", revoked: "danger" };

function formatDay(value: string, locale: Locale) {
  const tag = localeTags[locale];
  const supported = Intl.DateTimeFormat.supportedLocalesOf([tag]);
  return new Intl.DateTimeFormat(supported.length ? tag : "en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(
    new Date(`${value}T12:00:00+01:00`),
  );
}

/** "48291705" reads more easily as "4829 1705". */
function groupPin(pin: string) {
  return pin.length === 8 ? `${pin.slice(0, 4)} ${pin.slice(4)}` : pin;
}

function compact(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

/** S-09 observer codes: make batches, print the cards, and revoke, reissue or reset what is out there. */
export function AdminCodesView({
  batches,
  codes,
  cardSet,
  loading,
  error,
  onCreateBatch,
  onPrintBatch,
  onRevoke,
  onReissue,
  onResetPin,
  onCloseCards,
  onRetry,
  initialDialog = null,
  initialSearch = "",
  initialFilter = "all",
  initialNotice = null,
  "data-testid": testId = "admin-codes-view",
}: AdminCodesViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const tableWidth = useMediaQuery("(min-width: 768px)", true);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [search, setSearch] = useState(initialSearch);
  const [notice, setNotice] = useState<string | null>(initialNotice);
  const [seed, setSeed] = useState<CodesDialogSeed | null>(initialDialog);
  const [dialog, setDialog] = useState<Dialog | null>(() => {
    if (!initialDialog) return null;
    if (initialDialog.kind === "create") return { kind: "create" };
    if (initialDialog.kind === "print") {
      const batch = batches.find((b) => b.id === initialDialog.batchId) ?? batches[0];
      return batch ? { kind: "print", batch } : null;
    }
    const row = codes.find((c) => c.observer_code === initialDialog.code) ?? codes.find((c) => c.status !== "revoked");
    return row ? { kind: initialDialog.kind, row } : null;
  });

  const batchLabel = useMemo(() => new Map(batches.map((b) => [b.id, b.label])), [batches]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: codes.length, unclaimed: 0, active: 0, locked: 0, revoked: 0 };
    for (const row of codes) c[row.status] += 1;
    return c;
  }, [codes]);

  const needle = compact(search);
  const rows = codes.filter((row) => (filter === "all" || row.status === filter) && (!needle || compact(row.observer_code).includes(needle)));
  const showSkeleton = loading && codes.length === 0 && batches.length === 0 && !error;

  function open(next: Dialog) {
    setSeed(null);
    setDialog(next);
  }

  const cardsRef = useRef<HTMLHeadingElement>(null);
  const hasCards = cardSet !== null;
  useEffect(() => {
    if (hasCards) cardsRef.current?.focus({ preventScroll: false });
  }, [hasCards]);

  return (
    <div className={styles.page} data-testid={testId}>
      {error ? (
        <Banner
          tone="danger"
          title={error}
          critical
          action={onRetry ? <Button variant="secondary" icon={<RetryIcon />} onClick={onRetry}>{t("s09.retry")}</Button> : undefined}
        />
      ) : null}
      {notice ? <Banner tone="ok" title={notice} onDismiss={() => setNotice(null)} data-testid="s09-notice" /> : null}

      {cardSet ? (
        <CardsPanel cardSet={cardSet} headingRef={cardsRef} onDone={() => onCloseCards?.()} />
      ) : null}

      <section className={styles.panel} aria-labelledby="s09-batches">
        <div className={styles.head}>
          <h2 id="s09-batches" className={styles.title}>{t("s09.batchList.title")}</h2>
          <Button variant="primary" icon={<PlusIcon />} onClick={() => open({ kind: "create" })} data-testid="s09-create">
            {t("s09.createBatch")}
          </Button>
        </div>

        {showSkeleton ? (
          <div className={styles.loading} role="status" aria-busy="true" aria-label={t("staff.loading")}>
            <Skeleton lines={3} height={72} delay={0} />
          </div>
        ) : batches.length === 0 ? (
          error ? null : <EmptyState title={t("s09.batchList.empty")} data-testid="s09-batches-empty" />
        ) : (
          <ul className={styles.batchGrid} aria-label={t("s09.batchList.title")}>
            {batches.map((b) => (
              <li key={b.id} className={styles.batch} data-testid={`s09-batch-${b.id}`}>
                <div className={styles.batchTop}>
                  <h3 className={styles.batchName}>{b.label}</h3>
                  <span className={`${styles.sub} eg-tnum`}>{t("s09.batchList.codes", { count: b.count })}</span>
                </div>
                <p className={styles.sub}>{t("s09.batchList.created", { when: formatWatDateTime(b.created_at, locale), who: b.created_by })}</p>
                <ul className={`${styles.stats} eg-tnum`} aria-label={t("s09.batchList.title")}>
                  <li>{t("s09.batchList.unclaimed", { count: b.unclaimed })}</li>
                  <li>{t("s09.batchList.active", { count: b.active })}</li>
                  <li>{t("s09.batchList.revoked", { count: b.revoked })}</li>
                </ul>
                <div className={styles.batchEnd}>
                  <span className={styles.sub}>
                    {b.printed_at ? t("s09.batchList.printed", { when: formatWatDateTime(b.printed_at, locale) }) : t("s09.batchList.notPrinted")}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => open({ kind: "print", batch: b })}
                    disabled={b.unclaimed === 0}
                    aria-label={t("s09.batchList.printFor", { label: b.label })}
                    data-testid={`s09-print-${b.id}`}
                  >
                    {t("s09.batchList.print")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="s09-codes">
        <div className={styles.head}>
          <h2 id="s09-codes" className={styles.title}>
            {t("s09.codesTable")}
            {codes.length > 0 ? <span className={`${styles.titleCount} eg-tnum`}>{t("s09.table.count", { count: codes.length })}</span> : null}
          </h2>
        </div>

        {codes.length > 0 ? (
          <div className={styles.tools}>
            <Field
              className={styles.search}
              label={t("s09.searchCodes")}
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              numeric
              placeholder={t("s09.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="s09-search"
            />
            <div className={styles.chipGroup} role="group" aria-label={t("s09.filter.label")}>
              {(["all", ...STATUSES] as Filter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.chip}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  data-testid={`s09-chip-${value}`}
                >
                  {value === "all" ? t("s09.filter.all") : t(`s09.status.${value}`)}
                  <span className={`${styles.chipCount} eg-tnum`}>{counts[value]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {showSkeleton ? (
          <div className={styles.loading} role="status" aria-busy="true" aria-label={t("staff.loading")}>
            <Skeleton lines={5} height={44} delay={0} />
          </div>
        ) : rows.length === 0 ? (
          error ? null : <EmptyState title={codes.length === 0 ? t("s09.table.empty") : t("s09.table.emptyFilter")} data-testid="s09-empty" />
        ) : tableWidth ? (
          <div className={styles.scroller}>
            <table className={styles.table}>
              <caption className="eg-sr-only">{t("s09.codesTable")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("s09.table.columns.code")}</th>
                  <th scope="col">{t("s09.table.columns.batch")}</th>
                  <th scope="col">{t("s09.table.columns.status")}</th>
                  <th scope="col">{t("s09.table.columns.activity")}</th>
                  <th scope="col"><span className="eg-sr-only">{t("s09.table.columns.actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.observer_code} data-off={row.status === "revoked" ? "" : undefined}>
                    <th scope="row" className={styles.codeCell}>
                      <CodeText row={row} />
                    </th>
                    <td className={styles.batchCell}>{batchLabel.get(row.batch_id) ?? <span className={styles.sub}>{t("s09.table.noBatch")}</span>}</td>
                    <td><StatusBadge tone={statusTone[row.status]} label={t(`s09.status.${row.status}`)} /></td>
                    <td className="eg-tnum">
                      <span className={styles.activity}>
                        <Day value={row.activated_on} locale={locale} />
                        {row.last_active_on ? <span className={styles.sub}>{t("s09.table.lastActiveOn", { date: formatDay(row.last_active_on, locale) })}</span> : null}
                      </span>
                    </td>
                    <td className={styles.actionsCell}>
                      <RowActions row={row} onOpen={(kind) => open({ kind, row })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className={styles.cards} aria-label={t("s09.codesTable")}>
            {rows.map((row) => (
              <li key={row.observer_code} className={styles.cardRow} data-off={row.status === "revoked" ? "" : undefined}>
                <div className={styles.cardTop}>
                  <CodeText row={row} />
                  <StatusBadge tone={statusTone[row.status]} label={t(`s09.status.${row.status}`)} />
                </div>
                <p className={styles.sub}>{batchLabel.get(row.batch_id) ?? t("s09.table.noBatch")}</p>
                <p className={`${styles.sub} eg-tnum`}>
                  {t("s09.table.columns.activated")}: <Day value={row.activated_on} locale={locale} />
                </p>
                <p className={`${styles.sub} eg-tnum`}>
                  {t("s09.table.columns.lastActive")}: <Day value={row.last_active_on} locale={locale} />
                </p>
                <RowActions row={row} onOpen={(kind) => open({ kind, row })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog?.kind === "create" ? (
        <CreateSheet
          seed={seed?.kind === "create" ? seed : null}
          onClose={() => setDialog(null)}
          onSubmit={async (label, count) => {
            const result = (await onCreateBatch?.(label, count)) ?? { ok: true as const };
            if (result.ok) setNotice(t("s09.notice.created"));
            return result;
          }}
        />
      ) : null}
      {dialog?.kind === "print" ? (
        <PrintSheet
          batch={dialog.batch}
          seed={seed?.kind === "print" ? seed : null}
          onClose={() => setDialog(null)}
          onSubmit={async () => {
            const result = (await onPrintBatch?.(dialog.batch.id)) ?? { ok: true as const };
            if (result.ok) setNotice(t("s09.notice.printed", { label: dialog.batch.label }));
            return result;
          }}
        />
      ) : null}
      {dialog && (dialog.kind === "revoke" || dialog.kind === "reissue") ? (
        <ReasonSheet
          kind={dialog.kind}
          code={dialog.row.observer_code}
          seed={seed?.kind === dialog.kind ? seed : null}
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            const code = dialog.row.observer_code;
            const run = dialog.kind === "revoke" ? onRevoke : onReissue;
            const result = (await run?.(code, reason)) ?? { ok: true as const };
            if (result.ok) setNotice(dialog.kind === "revoke" ? t("s09.notice.revoked", { code }) : t("s09.notice.reissued", { code }));
            return result;
          }}
        />
      ) : null}
      {dialog?.kind === "reset" ? (
        <ResetSheet
          code={dialog.row.observer_code}
          seed={seed?.kind === "reset" ? seed : null}
          onClose={() => setDialog(null)}
          onSubmit={async () => {
            const code = dialog.row.observer_code;
            const result = (await onResetPin?.(code)) ?? { ok: true as const };
            if (result.ok) setNotice(t("s09.notice.pinReset", { code }));
            return result;
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------- Row pieces ---------- */

function CodeText({ row }: { row: ObserverCodeRow }) {
  const t = useT();
  return (
    <span className={styles.codeStack}>
      <span className={`${styles.code} eg-tnum`}>{row.observer_code}</span>
      {row.replaced_by ? <span className={`${styles.sub} ${styles.replaced}`}>{t("s09.table.replacedBy", { code: row.replaced_by })}</span> : null}
    </span>
  );
}

function Day({ value, locale }: { value: string | null; locale: Locale }) {
  const t = useT();
  return value ? <>{formatDay(value, locale)}</> : <span className={styles.sub}>{t("s09.table.never")}</span>;
}

function RowActions({ row, onOpen }: { row: ObserverCodeRow; onOpen: (kind: "revoke" | "reissue" | "reset") => void }) {
  const t = useT();
  if (row.status === "revoked") return <span className={styles.sub} aria-hidden="true">&mdash;</span>;
  const code = row.observer_code;
  return (
    <div className={styles.rowActions}>
      <Button variant="quiet" onClick={() => onOpen("reset")} aria-label={t("s09.actions.resetPinFor", { code })} data-testid={`s09-reset-${code}`}>
        {t("s09.actions.resetPin")}
      </Button>
      <Button variant="quiet" onClick={() => onOpen("reissue")} aria-label={t("s09.actions.reissueFor", { code })} data-testid={`s09-reissue-${code}`}>
        {t("s09.actions.reissue")}
      </Button>
      <Button variant="quiet" onClick={() => onOpen("revoke")} aria-label={t("s09.actions.revokeFor", { code })} data-testid={`s09-revoke-${code}`}>
        {t("s09.actions.revoke")}
      </Button>
    </div>
  );
}

/* ---------- Cards: the screen version and the A4 print version ---------- */

function ScissorsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.6 7.6 20 18M8.6 16.4 20 6" />
    </svg>
  );
}

function CardGrid({ cards, className }: { cards: CodeCard[]; className: string }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <ul className={className}>
      {cards.map((card) => (
        <li key={card.observer_code} className={styles.card} data-testid="s09-card">
          <span className={styles.scissors} aria-hidden="true"><ScissorsIcon /></span>
          <span className="eg-sr-only">{t("s09.cards.cutLine")}</span>
          <div className={styles.cardMark}><BrandMark /></div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("s09.cards.code")}</span>
            <span className={`${styles.cardCode} eg-tnum`}>{card.observer_code}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("s09.cards.pin")}</span>
            <span className={`${styles.cardPin} eg-tnum`}>{groupPin(card.setup_pin)}</span>
          </div>
          <p className={styles.cardNote}>
            {t("s09.cards.expires", { when: formatWatDateTime(card.setup_expires_at, locale) })}
            <br />
            {t("s09.cards.how")}
          </p>
        </li>
      ))}
    </ul>
  );
}

function CardsPanel({ cardSet, headingRef, onDone }: { cardSet: CardSet; headingRef: React.Ref<HTMLHeadingElement>; onDone: () => void }) {
  const t = useT();
  const body = useSyncExternalStore(
    () => () => {},
    () => document.body,
    () => null,
  );
  const heading =
    cardSet.kind === "single" && cardSet.cards[0]
      ? t("s09.cards.headingFor", { code: cardSet.cards[0].observer_code })
      : t("s09.cards.heading", { count: cardSet.cards.length });

  return (
    <section className={styles.cardsPanel} aria-labelledby="s09-cards" data-testid="s09-cards">
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2 id="s09-cards" ref={headingRef} tabIndex={-1} className={styles.title}>{heading}</h2>
          {cardSet.label ? <p className={styles.sub}>{cardSet.label}</p> : null}
        </div>
        <div className={styles.headEnd}>
          <Button variant="primary" onClick={() => window.print()} data-testid="s09-print">{t("s09.cards.print")}</Button>
          <Button variant="secondary" onClick={onDone} data-testid="s09-cards-done">{t("s09.cards.close")}</Button>
        </div>
      </div>
      <Banner tone="attn" title={t("s09.printNotice")} data-testid="s09-once">
        {t("s09.cards.noticeMore")}
      </Banner>
      <CardGrid cards={cardSet.cards} className={styles.grid} />
      {/* The same cards for the printer: only this is left when the page is printed. */}
      {body
        ? createPortal(
            <div className={styles.printRoot} aria-hidden="true" data-testid="s09-print-sheet">
              <p className={styles.printNote}>{t("s09.printNotice")}</p>
              <CardGrid cards={cardSet.cards} className={styles.printGrid} />
            </div>,
            body,
          )
        : null}
    </section>
  );
}

/* ---------- Sheets ---------- */

function CreateSheet({
  seed,
  onClose,
  onSubmit,
}: {
  seed: CodesDialogSeed | null;
  onClose: () => void;
  onSubmit: (label: string, count: number) => Promise<CodesActionResult>;
}) {
  const t = useT();
  const formId = useId();
  const [label, setLabel] = useState(seed?.label ?? "");
  const [count, setCount] = useState(seed?.count ?? "50");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(seed?.message ?? null);
  const [fields, setFields] = useState<{ label?: string; count?: string }>(seed?.fields ?? {});

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = label.trim();
    const n = /^\d+$/.test(count.trim()) ? Number(count.trim()) : NaN;
    const problems: { label?: string; count?: string } = {};
    if (trimmed.length === 0 || trimmed.length > LABEL_MAX) problems.label = t("s09.create.errors.label");
    if (!Number.isInteger(n) || n < 1 || n > COUNT_MAX) problems.count = t("s09.create.errors.count");
    setFields(problems);
    setMessage(null);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    const result = await onSubmit(trimmed, n);
    setBusy(false);
    if (result.ok) return onClose();
    setMessage(result.message ?? null);
    setFields(result.fields ?? {});
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("s09.create.title")}
      description={t("s09.create.description")}
      data-testid="s09-create-sheet"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>{t("s09.cancel")}</Button>
          <Button type="submit" form={formId} variant="primary" loading={busy} data-testid="s09-create-submit">{t("s09.create.submit")}</Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
        {message ? <Banner tone="danger" title={message} critical data-testid="s09-create-error" /> : null}
        <Field
          label={t("s09.create.label")}
          hint={t("s09.create.labelHint")}
          autoComplete="off"
          maxLength={LABEL_MAX}
          value={label}
          error={fields.label}
          onChange={(e) => {
            setLabel(e.target.value);
            setFields((f) => ({ ...f, label: undefined }));
          }}
          data-testid="s09-label"
        />
        <Field
          label={t("s09.create.count")}
          hint={t("s09.create.countHint")}
          inputMode="numeric"
          autoComplete="off"
          numeric
          value={count}
          error={fields.count}
          onChange={(e) => {
            setCount(e.target.value);
            setFields((f) => ({ ...f, count: undefined }));
          }}
          data-testid="s09-count"
        />
      </form>
    </Sheet>
  );
}

/** The confirmation the server asks for (409 confirmation_required) before it resets unclaimed setup PINs. */
function PrintSheet({
  batch,
  seed,
  onClose,
  onSubmit,
}: {
  batch: CodeBatch;
  seed: CodesDialogSeed | null;
  onClose: () => void;
  onSubmit: () => Promise<CodesActionResult>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(seed?.message ?? null);

  async function confirm() {
    setBusy(true);
    setMessage(null);
    const result = await onSubmit();
    setBusy(false);
    if (result.ok) onClose();
    else setMessage(result.message ?? null);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("s09.confirmPrint.title", { label: batch.label })}
      description={t("s09.confirmPrint.body", { count: batch.unclaimed })}
      data-testid="s09-print-sheet-confirm"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>{t("s09.cancel")}</Button>
          <Button variant="danger" loading={busy} onClick={() => void confirm()} data-testid="s09-print-confirm">{t("s09.confirmPrint.confirm")}</Button>
        </>
      }
    >
      {message ? <Banner tone="danger" title={message} critical data-testid="s09-print-error" /> : null}
    </Sheet>
  );
}

function ReasonSheet({
  kind,
  code,
  seed,
  onClose,
  onSubmit,
}: {
  kind: "revoke" | "reissue";
  code: string;
  seed: CodesDialogSeed | null;
  onClose: () => void;
  onSubmit: (reason: RevokeReason) => Promise<CodesActionResult>;
}) {
  const t = useT();
  const [reason, setReason] = useState<RevokeReason>(seed?.reason ?? "lost_phone");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(seed?.message ?? null);

  async function confirm() {
    setBusy(true);
    setMessage(null);
    const result = await onSubmit(reason);
    setBusy(false);
    if (result.ok) onClose();
    else setMessage(result.message ?? null);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t(`s09.${kind}.title`, { code })}
      description={t(`s09.${kind}.body`)}
      data-testid={`s09-${kind}-sheet`}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>{t("s09.cancel")}</Button>
          <Button variant="danger" loading={busy} onClick={() => void confirm()} data-testid={`s09-${kind}-confirm`}>{t(`s09.${kind}.confirm`)}</Button>
        </>
      }
    >
      <div className={styles.form}>
        {message ? <Banner tone="danger" title={message} critical data-testid={`s09-${kind}-error`} /> : null}
        <Select
          label={t("s09.reason.label")}
          hint={t("s09.reason.hint")}
          placeholder={false}
          value={reason}
          onChange={(e) => setReason(e.target.value as RevokeReason)}
          options={REASONS.map((value) => ({ value, label: t(`s09.reason.${value}`) }))}
          data-testid={`s09-${kind}-reason`}
        />
      </div>
    </Sheet>
  );
}

/** A PIN reset takes no reason from the server, so this sheet only asks for confirmation. */
function ResetSheet({
  code,
  seed,
  onClose,
  onSubmit,
}: {
  code: string;
  seed: CodesDialogSeed | null;
  onClose: () => void;
  onSubmit: () => Promise<CodesActionResult>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(seed?.message ?? null);

  async function confirm() {
    setBusy(true);
    setMessage(null);
    const result = await onSubmit();
    setBusy(false);
    if (result.ok) onClose();
    else setMessage(result.message ?? null);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("s09.resetPin.title", { code })}
      description={t("s09.resetPin.body")}
      data-testid="s09-reset-sheet"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>{t("s09.cancel")}</Button>
          <Button variant="danger" loading={busy} onClick={() => void confirm()} data-testid="s09-reset-confirm">{t("s09.resetPin.confirm")}</Button>
        </>
      }
    >
      {message ? <Banner tone="danger" title={message} critical data-testid="s09-reset-error" /> : null}
    </Sheet>
  );
}

