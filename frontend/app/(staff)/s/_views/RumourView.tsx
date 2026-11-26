"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Claim, ClaimMatchesResponse, ClaimStatus, Language, SeenOn } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import {
  Banner,
  Button,
  DataTable,
  EmptyState,
  Select,
  Sheet,
  Skeleton,
  StatusBadge,
  TextArea,
  type Column,
  type StatusTone,
} from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { useMediaQuery } from "../../../../ui/hooks";
import { PlusIcon, RetryIcon } from "../../../../ui/icons";
import { CATEGORY_ROWS } from "../../../(public)/_lib/public";
import styles from "./RumourView.module.css";

export const SEEN_ON: SeenOn[] = ["whatsapp", "facebook", "x", "tiktok", "sms", "radio", "in_person", "other"];
export const LANGUAGES: Language[] = ["en", "pcm", "ha", "yo", "ig"];
export const STATUSES: ClaimStatus[] = ["new", "matched", "response_draft", "response_approved", "dismissed"];
/** The API takes up to 4,000 characters of claim text, 1,500 of reply and 500 of note. */
export const CLAIM_MAX = 4000;
export const REPLY_MAX = 1500;
export const NOTE_MAX = 500;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const CATEGORY_KEY = Object.fromEntries(CATEGORY_ROWS.map((row) => [row.value, row.key])) as Record<string, string>;
const OUTCOME_KEY: Record<string, string> = {
  corroborated: "common.outcome.confirmed",
  insufficient_evidence: "common.outcome.notEnough",
  out_of_scope: "common.outcome.outside",
};
const REASON_KEYS = new Set(["violence_claim", "location_specific", "election_day"]);
const PROMPT_KEYS: Record<string, string> = {
  reverse_search: "s06.imageGuide.reverseSearch",
  check_date_vs_claim: "s06.imageGuide.checkDate",
  look_for_edits: "s06.imageGuide.lookEdits",
  check_source_account: "s06.imageGuide.checkSource",
};

export type ClaimStatusFilter = ClaimStatus | "all";

export interface NewClaimFields {
  text: string;
  seenOn: SeenOn;
  language: Language;
  image: File | null;
}

type Done = Promise<boolean> | boolean | void;

export interface RumourViewProps {
  claims: Claim[];
  selectedClaim: Claim | null;
  matches: ClaimMatchesResponse | null;
  matchesLoading?: boolean;
  matchesError?: string | null;
  loading: boolean;
  /** List-level problem (could not load). */
  error: string | null;
  /** Problem with the last action on the open claim, already in plain words. */
  actionError?: string | null;
  /** Problem with logging a new claim. */
  createError?: string | null;
  /** Short confirmation of the last action. */
  notice?: string | null;
  currentUserName?: string;
  statusFilter?: ClaimStatusFilter;
  hasMore?: boolean;
  loadingMore?: boolean;
  onStatusFilter?: (status: ClaimStatusFilter) => void;
  onLoadMore?: () => void;
  onRetry?: () => void;
  onSelectClaim?: (id: string) => void;
  onCreateClaim?: (fields: NewClaimFields) => Done;
  onSaveDraft?: (id: string, text: string, language: Language, version: number) => Done;
  onApprove?: (id: string, version: number) => Done;
  onReject?: (id: string, note: string, version: number) => Done;
  onDismiss?: (id: string, note: string, version: number) => Done;
  /** Clears the action error and notice when the person starts something new. */
  onClearMessages?: () => void;
  "data-testid"?: string;
}

export function statusTone(status: ClaimStatus): StatusTone {
  return status === "response_approved" ? "ok" : status === "response_draft" ? "attn" : status === "matched" ? "info" : "wait";
}

function levelTone(level: "high" | "medium" | "low", high: StatusTone): StatusTone {
  return level === "high" ? high : level === "medium" ? "attn" : "wait";
}

function excerpt(text: string | null, max: number) {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}

/** S-06 rumour desk: log claims, set them against closed field reports, and draft a reply a second coordinator approves. */
export function RumourView({
  claims,
  selectedClaim,
  matches,
  matchesLoading,
  matchesError,
  loading,
  error,
  actionError,
  createError,
  notice,
  currentUserName,
  statusFilter = "all",
  hasMore,
  loadingMore,
  onStatusFilter,
  onLoadMore,
  onRetry,
  onSelectClaim,
  onCreateClaim,
  onSaveDraft,
  onApprove,
  onReject,
  onDismiss,
  onClearMessages,
  "data-testid": testId = "rumour-view",
}: RumourViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const table = useMediaQuery("(min-width: 768px)", true);
  const [creating, setCreating] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const userPicked = useRef(false);

  // On a wide screen the first claim opens by itself, so the detail is never an empty box.
  useEffect(() => {
    if (table && !selectedClaim && claims.length > 0) onSelectClaim?.(claims[0].id);
  }, [table, selectedClaim, claims, onSelectClaim]);

  // After a person picks a row, bring the detail into view without a jump on first load.
  useEffect(() => {
    if (!userPicked.current || !selectedClaim) return;
    userPicked.current = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    detailRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [selectedClaim]);

  const sourceLabel = (value: SeenOn) => t(`s06.seenOn.${value}`);
  const statusLabel = (value: ClaimStatus) => t(`s06.status.${value}`);

  function pick(id: string) {
    userPicked.current = true;
    onClearMessages?.();
    onSelectClaim?.(id);
    setPhoneOpen(true);
  }

  const columns: Column<Claim>[] = [
    {
      key: "text",
      header: t("s06.columns.claim"),
      rowHeader: true,
      render: (row) => (
        <span className={styles.claimCell}>
          <span className={`${styles.excerpt} ${styles.truncate}`} title={row.text ?? undefined}>{excerpt(row.text, 110) || t("s06.detail.noText")}</span>
          <span className={`${styles.sub} ${styles.truncate}`}>{`${sourceLabel(row.seen_on)} · ${t(`s06.lang.${row.language}`)}`}</span>
        </span>
      ),
    },
    {
      key: "harm",
      header: t("s06.columns.harm"),
      sortable: true,
      sortValue: (row) => row.harm.score,
      render: (row) => <StatusBadge tone={levelTone(row.harm.level, "danger")} label={t(`s06.level.${row.harm.level}`)} />,
    },
    {
      key: "check",
      header: t("s06.columns.check"),
      sortable: true,
      sortValue: (row) => row.check_worthiness.score,
      render: (row) => <StatusBadge tone={levelTone(row.check_worthiness.level, "info")} label={t(`s06.level.${row.check_worthiness.level}`)} />,
    },
    {
      key: "status",
      header: t("s06.columns.status"),
      render: (row) => <StatusBadge tone={statusTone(row.status)} label={statusLabel(row.status)} />,
    },
    {
      key: "created_at",
      header: t("s06.columns.logged"),
      sortable: true,
      sortValue: (row) => Date.parse(row.created_at),
      render: (row) => <span className={`${styles.nowrap} eg-tnum`}>{formatWatDateTime(row.created_at, locale)}</span>,
    },
  ];

  const showDetailOnly = !table && phoneOpen && selectedClaim;

  return (
    <div className={styles.page} data-testid={testId}>
      {error ? (
        <Banner
          tone="danger"
          title={error}
          critical
          action={onRetry ? <Button variant="secondary" icon={<RetryIcon />} onClick={onRetry}>{t("staff.retry")}</Button> : undefined}
        />
      ) : null}
      {notice ? <Banner tone="ok" title={notice} data-testid="s06-notice" /> : null}

      {showDetailOnly ? (
        <div>
          <Button variant="quiet" onClick={() => setPhoneOpen(false)} data-testid="s06-back">{t("s06.back")}</Button>
        </div>
      ) : (
        <section className={styles.listSection} aria-labelledby="s06-claims">
          <div className={styles.head}>
            <div className={styles.headText}>
              <h2 id="s06-claims" className={`${styles.sectionTitle} eg-tnum`}>{t("s06.claimsList")}</h2>
              <span className={styles.sub}>{loading && claims.length === 0 ? "" : t("s06.count", { count: claims.length })}</span>
            </div>
            <div className={styles.headActions}>
              {onStatusFilter ? (
                <Select
                  label={t("s06.filter.label")}
                  value={statusFilter}
                  placeholder={false}
                  onChange={(event) => onStatusFilter(event.target.value as ClaimStatusFilter)}
                  options={[{ value: "all", label: t("s06.filter.all") }, ...STATUSES.map((value) => ({ value, label: statusLabel(value) }))]}
                  className={styles.filter}
                  data-testid="s06-filter"
                />
              ) : null}
              {onCreateClaim ? (
                <Button variant="primary" icon={<PlusIcon />} onClick={() => { onClearMessages?.(); setCreating(true); }} data-testid="s06-new">
                  {t("s06.newClaim")}
                </Button>
              ) : null}
            </div>
          </div>
          <p className={styles.sub}>{t("s06.suggestedNote")}</p>

          {loading && claims.length === 0 && !error ? (
            <div className={styles.loading} role="status" aria-busy="true" aria-label={t("staff.loading")}>
              <Skeleton lines={5} height={48} delay={0} />
            </div>
          ) : !error && claims.length === 0 ? (
            <EmptyState title={statusFilter === "all" ? t("s06.empty.title") : t("s06.empty.filtered")} data-testid="s06-empty">
              {statusFilter === "all" ? <p>{t("s06.empty.body")}</p> : null}
            </EmptyState>
          ) : claims.length > 0 ? (
            table ? (
              <div className={styles.tableFrame}>
                <DataTable
                  caption={t("s06.table.caption")}
                  captionHidden
                  columns={columns}
                  rows={claims}
                  rowKey={(row) => row.id}
                  selectedKey={selectedClaim?.id}
                  onRowActivate={(row) => pick(row.id)}
                  initialSort={{ key: "created_at", direction: "descending" }}
                  data-testid="s06-table"
                />
              </div>
            ) : (
              <ul className={styles.cards} aria-label={t("s06.table.caption")}>
                {claims.map((claim) => (
                  <li key={claim.id}>
                    <button type="button" className={styles.card} onClick={() => pick(claim.id)} data-testid={`s06-card-${claim.id}`}>
                      <span className={styles.excerpt}>{excerpt(claim.text, 140) || t("s06.detail.noText")}</span>
                      <span className={styles.chips}>
                        <span className={styles.levelPair}>
                          <span className={styles.levelCap}>{t("s06.columns.harm")}</span>
                          <StatusBadge tone={levelTone(claim.harm.level, "danger")} label={t(`s06.level.${claim.harm.level}`)} />
                        </span>
                        <span className={styles.levelPair}>
                          <span className={styles.levelCap}>{t("s06.columns.check")}</span>
                          <StatusBadge tone={levelTone(claim.check_worthiness.level, "info")} label={t(`s06.level.${claim.check_worthiness.level}`)} />
                        </span>
                        <StatusBadge tone={statusTone(claim.status)} label={statusLabel(claim.status)} />
                      </span>
                      <span className={styles.sub}>{`${sourceLabel(claim.seen_on)} · ${formatWatDateTime(claim.created_at, locale)}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {hasMore && onLoadMore ? (
            <div className={styles.more}>
              <Button variant="secondary" onClick={onLoadMore} loading={loadingMore}>{t("s06.loadMore")}</Button>
            </div>
          ) : null}
        </section>
      )}

      {table || showDetailOnly ? (
        <div ref={detailRef} className={styles.detailAnchor}>
          {selectedClaim ? (
            <ClaimDetail
              key={`${selectedClaim.id}:${selectedClaim.version}`}
              claim={selectedClaim}
              matches={matches}
              matchesLoading={matchesLoading}
              matchesError={matchesError}
              actionError={actionError}
              currentUserName={currentUserName}
              onSaveDraft={onSaveDraft}
              onApprove={onApprove}
              onReject={onReject}
              onDismiss={onDismiss}
              onClearMessages={onClearMessages}
            />
          ) : claims.length > 0 ? (
            <p className={`${styles.hint} ${styles.sub}`} data-testid="s06-pick">{t("s06.empty.select")}</p>
          ) : null}
        </div>
      ) : null}

      <NewClaimSheet open={creating} error={createError} onClose={() => setCreating(false)} onCreate={onCreateClaim} />
    </div>
  );
}

/* ---------- Log a claim ---------- */

function NewClaimSheet({
  open,
  error,
  onClose,
  onCreate,
}: {
  open: boolean;
  error?: string | null;
  onClose: () => void;
  onCreate?: (fields: NewClaimFields) => Done;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [seenOn, setSeenOn] = useState<SeenOn>("whatsapp");
  const [language, setLanguage] = useState<Language>("en");
  const [image, setImage] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function chooseImage(file: File | null) {
    setFileProblem(null);
    if (!file) return setImage(null);
    if (!IMAGE_TYPES.includes(file.type)) {
      setFileProblem(t("s06.errors.imageType"));
      return setImage(null);
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setFileProblem(t("s06.errors.imageSize"));
      return setImage(null);
    }
    setImage(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || (!text.trim() && !image)) return;
    setPending(true);
    const ok = await onCreate?.({ text: text.trim(), seenOn, language, image });
    setPending(false);
    if (ok !== false) {
      setText("");
      setImage(null);
      if (fileRef.current) fileRef.current.value = "";
      onClose();
    }
  }

  const empty = !text.trim() && !image;

  return (
    <Sheet open={open} onClose={onClose} title={t("s06.newClaim")} description={t("s06.new.intro")} data-testid="s06-new-sheet">
      <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        {error ? <Banner tone="danger" title={error} critical data-testid="s06-create-error" /> : null}
        <TextArea
          id="s06-claim-text"
          label={t("s06.claimText")}
          hint={t("s06.claimTextHint")}
          maxLength={CLAIM_MAX}
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className={styles.formRow}>
          <Select
            id="s06-seen-on"
            label={t("s06.source")}
            value={seenOn}
            placeholder={false}
            onChange={(event) => setSeenOn(event.target.value as SeenOn)}
            options={SEEN_ON.map((value) => ({ value, label: t(`s06.seenOn.${value}`) }))}
          />
          <Select
            id="s06-language"
            label={t("s06.language")}
            value={language}
            placeholder={false}
            onChange={(event) => setLanguage(event.target.value as Language)}
            options={LANGUAGES.map((value) => ({ value, label: t(`s06.lang.${value}`) }))}
          />
        </div>
        <div className={styles.fileBlock}>
          <label htmlFor="s06-image" className={styles.fileLabel}>{t("s06.image")}</label>
          <span id="s06-image-hint" className={styles.sub}>{t("s06.imageHint")}</span>
          <input
            ref={fileRef}
            id="s06-image"
            type="file"
            accept={IMAGE_TYPES.join(",")}
            className={styles.file}
            aria-describedby="s06-image-hint"
            onChange={(event) => chooseImage(event.target.files?.[0] ?? null)}
          />
          {image ? (
            <span className={styles.fileName}>
              <span>{image.name}</span>
              <Button
                type="button"
                variant="quiet"
                onClick={() => {
                  chooseImage(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                {t("s06.imageRemove")}
              </Button>
            </span>
          ) : null}
          {fileProblem ? <span className={styles.problem} role="alert">{fileProblem}</span> : null}
        </div>
        {empty ? <p className={styles.sub}>{t("s06.needTextOrImage")}</p> : null}
        <div className={styles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose}>{t("staff.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={empty} loading={pending} data-testid="s06-save-claim">{t("s06.saveClaim")}</Button>
        </div>
      </form>
    </Sheet>
  );
}

/* ---------- The open claim ---------- */

type Confirm = "approve" | "reject" | "dismiss" | null;

function ClaimDetail({
  claim,
  matches,
  matchesLoading,
  matchesError,
  actionError,
  currentUserName,
  onSaveDraft,
  onApprove,
  onReject,
  onDismiss,
  onClearMessages,
}: {
  claim: Claim;
  matches: ClaimMatchesResponse | null;
  matchesLoading?: boolean;
  matchesError?: string | null;
  actionError?: string | null;
  currentUserName?: string;
  onSaveDraft?: RumourViewProps["onSaveDraft"];
  onApprove?: RumourViewProps["onApprove"];
  onReject?: RumourViewProps["onReject"];
  onDismiss?: RumourViewProps["onDismiss"];
  onClearMessages?: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const response = claim.response;
  const saved = response?.text ?? "";
  const [text, setText] = useState(saved);
  const [replyLanguage, setReplyLanguage] = useState<Language>(response?.language ?? claim.language);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"save" | "approve" | "reject" | "dismiss" | null>(null);

  const dismissed = claim.status === "dismissed";
  const approved = claim.status === "response_approved";
  const drafter = Boolean(
    response?.drafted_by && currentUserName && response.drafted_by.toLowerCase() === currentUserName.toLowerCase(),
  );
  const dirty = text !== saved || (response ? replyLanguage !== response.language : false);
  const canDecide = claim.status === "response_draft" && Boolean(response) && !response?.approved_by;
  const noteOk = note.trim().length >= 1 && note.trim().length <= NOTE_MAX;

  async function run(kind: "save" | "approve" | "reject" | "dismiss", action: () => Done) {
    setPending(kind);
    const ok = await action();
    setPending(null);
    if (ok !== false) {
      setConfirm(null);
      setNote("");
    }
  }

  function openConfirm(kind: Exclude<Confirm, null>) {
    onClearMessages?.();
    setNote("");
    setConfirm(kind);
  }

  const reasons = claim.harm.reasons.filter((reason) => REASON_KEYS.has(reason));
  const area = claim.area ? [claim.area.lga_name, claim.area.state_name].filter(Boolean).join(", ") : null;

  return (
    <article className={styles.detail} aria-labelledby={`s06-claim-${claim.id}`} data-testid="s06-detail">
      <div className={styles.main}>
        <section className={styles.panel}>
          <div className={styles.chips}>
            <StatusBadge tone={statusTone(claim.status)} label={t(`s06.status.${claim.status}`)} />
          </div>
          <dl className={styles.levels}>
            <div>
              <dt>{t("s06.columns.harm")}</dt>
              <dd><StatusBadge tone={levelTone(claim.harm.level, "danger")} label={t(`s06.level.${claim.harm.level}`)} /></dd>
            </div>
            <div>
              <dt>{t("s06.columns.check")}</dt>
              <dd><StatusBadge tone={levelTone(claim.check_worthiness.level, "info")} label={t(`s06.level.${claim.check_worthiness.level}`)} /></dd>
            </div>
          </dl>
          <h2 id={`s06-claim-${claim.id}`} className={styles.claimText}>
            {claim.text ? claim.text : <span className={styles.sub}>{t("s06.detail.noText")}</span>}
          </h2>
          <p className={styles.sub}>
            {t("s06.detail.seenOn", { source: t(`s06.seenOn.${claim.seen_on}`), language: t(`s06.lang.${claim.language}`) })}
            {area ? ` · ${area}` : ""}
          </p>
          <p className={`${styles.sub} eg-tnum`}>{t("s06.detail.loggedBy", { name: claim.created_by, time: formatWatDateTime(claim.created_at, locale) })}</p>
          {claim.image ? <p className={styles.sub}>{t("s06.detail.imageAttached", { width: claim.image.width, height: claim.image.height })}</p> : null}
          {reasons.length > 0 ? (
            <div className={styles.reasons}>
              <h3 className={styles.subTitle}>{t("s06.harmReasons.title")}</h3>
              <ul>
                {reasons.map((reason) => (
                  <li key={reason}>{t(`s06.harmReasons.${reason}`)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className={styles.panel} aria-labelledby={`s06-matches-${claim.id}`}>
          <h3 id={`s06-matches-${claim.id}`} className={styles.panelTitle}>{t("s06.matches.title")}</h3>
          <p className={styles.sub}>{t("s06.matches.note")}</p>
          {matchesLoading && !matches ? (
            <div role="status" aria-busy="true" aria-label={t("staff.loading")}>
              <Skeleton lines={3} height={52} delay={0} />
            </div>
          ) : matchesError ? (
            <Banner tone="attn" title={matchesError} data-testid="s06-matches-error" />
          ) : matches ? (
            <>
              {matches.observations.length === 0 ? (
                <p className={styles.sub}>{t("s06.matches.none")}</p>
              ) : (
                <ul className={styles.matchList}>
                  {matches.observations.map((obs) => (
                    <li key={obs.report_id} className={styles.match}>
                      <span className={styles.matchHead}>
                        <strong>{t(CATEGORY_KEY[obs.category] ?? "o05.tile.notSure")}</strong>
                        <span className={`${styles.sim} eg-tnum`}>{t("s06.matches.similar", { percent: Math.round(obs.similarity * 100) })}</span>
                      </span>
                      <span className={styles.sub}>
                        {[obs.area.ward_name, obs.area.lga_name, obs.area.state_name].filter(Boolean).join(", ")}
                        {" · "}
                        <span className="eg-tnum">{t("s06.matches.occurred", { time: formatWatDateTime(obs.occurred_at, locale) })}</span>
                        {" · "}
                        {t(OUTCOME_KEY[obs.outcome])}
                      </span>
                      <p className={styles.quote}>{obs.excerpt}</p>
                    </li>
                  ))}
                </ul>
              )}
              <h4 className={styles.subTitle}>{t("s06.pastClaims.title")}</h4>
              {matches.past_claims.length === 0 ? (
                <p className={styles.sub}>{t("s06.pastClaims.none")}</p>
              ) : (
                <ul className={styles.matchList}>
                  {matches.past_claims.map((past) => (
                    <li key={past.claim_id} className={styles.match}>
                      <span className={styles.matchHead}>
                        <span>{excerpt(past.text, 140)}</span>
                        <span className={`${styles.sim} eg-tnum`}>{t("s06.matches.similar", { percent: Math.round(past.similarity * 100) })}</span>
                      </span>
                      <span className={styles.sub}>
                        <strong>{t("s06.pastClaims.reply")}</strong>
                        {": "}
                        {past.response ? past.response.text : t("s06.pastClaims.noReply")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </section>
      </div>

      <div className={styles.side}>
        {claim.image_check ? (
          <section className={styles.panel} aria-labelledby={`s06-guide-${claim.id}`} data-testid="s06-guide">
            <h3 id={`s06-guide-${claim.id}`} className={styles.panelTitle}>{t("s06.imageGuide.title")}</h3>
            <p className={styles.sub}>{t("s06.imageGuide.notice")}</p>
            <ul className={styles.steps}>
              {claim.image_check.prompts.filter((prompt) => PROMPT_KEYS[prompt]).map((prompt) => (
                <li key={prompt}>{t(PROMPT_KEYS[prompt])}</li>
              ))}
            </ul>
            <p className={styles.sub}>{claim.image_check.metadata.had_metadata ? t("s06.imageGuide.metaYes") : t("s06.imageGuide.metaNo")}</p>
            {claim.image_check.error_level_hint ? (
              <p className={styles.sub}>{t("s06.imageGuide.compression", { hint: claim.image_check.error_level_hint })}</p>
            ) : null}
          </section>
        ) : null}

        <section className={styles.panel} aria-labelledby={`s06-reply-${claim.id}`} data-testid="s06-response">
          <h3 id={`s06-reply-${claim.id}`} className={styles.panelTitle}>{t("s06.response.title")}</h3>
          <p className={styles.sub}>{t("s06.response.intro")}</p>
          {actionError ? <Banner tone="danger" title={actionError} critical data-testid="s06-action-error" /> : null}
          {dismissed ? (
            <Banner tone="wait" title={t("s06.response.dismissedLock")} data-testid="s06-dismissed" />
          ) : (
            <>
              {response ? (
                <p className={`${styles.sub} eg-tnum`}>
                  {t("s06.response.draftedBy", { name: response.drafted_by, time: formatWatDateTime(response.drafted_at, locale) })}
                </p>
              ) : (
                <p className={styles.sub}>{t("s06.response.none")}</p>
              )}
              {response?.approved_by && response.approved_at ? (
                <StatusBadge
                  tone="ok"
                  label={t("s06.response.approvedBy", { name: response.approved_by, time: formatWatDateTime(response.approved_at, locale) })}
                />
              ) : null}
              {response?.rejection_note && !response.approved_by ? (
                <p className={styles.sentBack}>{t("s06.response.sentBack", { note: response.rejection_note })}</p>
              ) : null}
              {approved ? <p className={styles.sub}>{t("s06.response.approvedNote")}</p> : null}
              {drafter && canDecide ? <Banner tone="attn" title={t("s06.errors.samePerson")} data-testid="s06-same-person" /> : null}
              <Select
                id={`s06-reply-lang-${claim.id}`}
                label={t("s06.response.languageLabel")}
                value={replyLanguage}
                placeholder={false}
                onChange={(event) => setReplyLanguage(event.target.value as Language)}
                options={LANGUAGES.map((value) => ({ value, label: t(`s06.lang.${value}`) }))}
              />
              <TextArea
                id={`s06-reply-text-${claim.id}`}
                label={t("s06.response.textLabel")}
                maxLength={REPLY_MAX}
                rows={6}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              {dirty && canDecide ? <p className={styles.sub}>{t("s06.response.unsaved")}</p> : null}
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  disabled={!text.trim() || !dirty || !onSaveDraft}
                  loading={pending === "save"}
                  onClick={() => {
                    onClearMessages?.();
                    void run("save", () => onSaveDraft?.(claim.id, text.trim(), replyLanguage, claim.version));
                  }}
                  data-testid="s06-save-draft"
                >
                  {t("s06.response.saveDraft")}
                </Button>
                {canDecide ? (
                  <>
                    <Button variant="primary" disabled={drafter || dirty || !onApprove} onClick={() => openConfirm("approve")} data-testid="s06-approve">
                      {t("s06.response.approve")}
                    </Button>
                    <Button variant="secondary" disabled={!onReject} onClick={() => openConfirm("reject")} data-testid="s06-reject">
                      {t("s06.response.reject")}
                    </Button>
                  </>
                ) : null}
                <Button variant="quiet" disabled={!onDismiss} onClick={() => openConfirm("dismiss")} data-testid="s06-dismiss">
                  {t("s06.response.dismiss")}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      <Sheet
        open={confirm === "approve"}
        onClose={() => setConfirm(null)}
        title={t("s06.approve.title")}
        description={t("s06.approve.body", { name: response?.drafted_by ?? "" })}
        data-testid="s06-approve-sheet"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>{t("staff.cancel")}</Button>
            <Button variant="primary" loading={pending === "approve"} onClick={() => void run("approve", () => onApprove?.(claim.id, claim.version))} data-testid="s06-approve-confirm">
              {t("s06.response.approve")}
            </Button>
          </>
        }
      >
        {actionError ? <Banner tone="danger" title={actionError} critical /> : null}
        {response ? <p className={styles.quote}>{response.text}</p> : null}
      </Sheet>

      <Sheet
        open={confirm === "reject" || confirm === "dismiss"}
        onClose={() => setConfirm(null)}
        title={confirm === "dismiss" ? t("s06.dismiss.title") : t("s06.reject.title")}
        description={confirm === "dismiss" ? t("s06.dismiss.body") : t("s06.reject.body")}
        data-testid="s06-note-sheet"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>{t("staff.cancel")}</Button>
            <Button
              variant={confirm === "dismiss" ? "danger" : "primary"}
              disabled={!noteOk}
              loading={pending === "reject" || pending === "dismiss"}
              onClick={() =>
                void run(confirm === "dismiss" ? "dismiss" : "reject", () =>
                  confirm === "dismiss" ? onDismiss?.(claim.id, note.trim(), claim.version) : onReject?.(claim.id, note.trim(), claim.version),
                )
              }
              data-testid="s06-note-confirm"
            >
              {confirm === "dismiss" ? t("s06.response.dismiss") : t("s06.response.reject")}
            </Button>
          </>
        }
      >
        {actionError ? <Banner tone="danger" title={actionError} critical /> : null}
        <TextArea
          id="s06-note"
          label={confirm === "dismiss" ? t("s06.dismiss.noteLabel") : t("s06.reject.noteLabel")}
          hint={t("s06.noteHint")}
          maxLength={NOTE_MAX}
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Sheet>
    </article>
  );
}
