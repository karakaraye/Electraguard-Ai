"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import type { FlagReason, HideReason, ModerationFlag, StateAreasResponse } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { Banner, Button, EmptyState, Field, Select, Sheet, Skeleton, StatusBadge, TextArea } from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { PlusIcon, RetryIcon } from "../../../../ui/icons";
import styles from "./DiscussionModView.module.css";

/** What a moderation call returns to the view: done, or a plain sentence to show. */
export type ModResult = { ok: true } | { ok: false; message: string };
export type CreateDiscussionResult = { ok: true; invited: number; notFound: string[] } | { ok: false; message: string };

export interface CreateDiscussionInput {
  title: string;
  topic: string;
  /** A ward code when a ward was chosen, otherwise the LGA code. */
  scope: { kind: "ward" | "lga"; code: string };
  /** Observer codes to invite (0 to 200). */
  invites: string[];
}

export interface DiscussionModViewProps {
  flags: ModerationFlag[];
  loading: boolean;
  error: string | null;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRefresh?: () => void;
  onHidePost?: (discussionId: string, postId: string, reason: HideReason, note?: string) => Promise<ModResult>;
  onUnhidePost?: (discussionId: string, postId: string) => Promise<ModResult>;
  onRemoveMember?: (discussionId: string, observerCode: string, reason: string) => Promise<ModResult>;
  onCloseDiscussion?: (discussionId: string) => Promise<ModResult>;
  onCreateDiscussion?: (input: CreateDiscussionInput) => Promise<CreateDiscussionResult>;
  /** States for the area pickers (REF-01 index). null while they load. */
  areaStates?: Array<{ state_code: string; name: string }> | null;
  /** Area files already loaded, by state code. */
  areaDetail?: Record<string, StateAreasResponse>;
  /** Called when the create sheet opens (states) and when a state is chosen (its LGAs and wards). */
  onNeedAreas?: (stateCode?: string) => void;
  "data-testid"?: string;
}

const HIDE_REASONS: HideReason[] = ["names_a_person", "too_specific_location", "abusive", "off_topic", "other"];
const REASON_KEY = {
  names_a_person: "s08.reason_names_a_person",
  too_specific_location: "s08.reason_too_specific_location",
  abusive: "s08.reason_abusive",
  other: "s08.reason_other",
  off_topic: "s08.reason_off_topic",
} as const satisfies Record<HideReason, string>;

type Dialog =
  | { kind: "hide"; flag: ModerationFlag }
  | { kind: "remove"; flag: ModerationFlag }
  | { kind: "close"; flag: ModerationFlag }
  | { kind: "create" };

type Notice = { tone: "ok" | "attn"; title: string; body?: string };

/** The API sends a boolean; older contract drafts sent { possible_names }. Accept both. */
function hasPossibleName(check: unknown): boolean {
  if (typeof check === "boolean") return check;
  return Boolean((check as { possible_names?: boolean } | null | undefined)?.possible_names);
}

function defaultHideReason(flag: ModerationFlag): HideReason {
  if (hasPossibleName(flag.name_check)) return "names_a_person";
  return flag.reasons[0] ?? "other";
}

/** S-08 discussion moderation: the flagged-posts inbox and the actions on it. */
export function DiscussionModView({
  flags,
  loading,
  error,
  loadingMore,
  hasMore,
  onLoadMore,
  onRefresh,
  onHidePost,
  onUnhidePost,
  onRemoveMember,
  onCloseDiscussion,
  onCreateDiscussion,
  areaStates = null,
  areaDetail = {},
  onNeedAreas,
  "data-testid": testId = "discussions-mod-view",
}: DiscussionModViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function openCreate() {
    setDialog({ kind: "create" });
    onNeedAreas?.();
  }

  async function unhide(flag: ModerationFlag) {
    if (!onUnhidePost) return;
    setBusyId(flag.post.id);
    const res = await onUnhidePost(flag.discussion_id, flag.post.id);
    setBusyId(null);
    setNotice(res.ok ? { tone: "ok", title: t("s08.noticeUnhidden") } : { tone: "attn", title: res.message });
  }

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
      {notice ? (
        <Banner tone={notice.tone} title={notice.title} onDismiss={() => setNotice(null)} data-testid="s08-notice">
          {notice.body}
        </Banner>
      ) : null}

      <section className={styles.inbox} aria-labelledby="s08-inbox">
        <div className={styles.head}>
          <h2 id="s08-inbox" className={`${styles.sectionTitle} eg-tnum`}>
            {t("s08.flagsInbox", { count: flags.length })}
          </h2>
          <div className={styles.row}>
            {onRefresh ? (
              <Button variant="quiet" icon={<RetryIcon />} onClick={onRefresh}>{t("s08.refresh")}</Button>
            ) : null}
            <Button variant="primary" icon={<PlusIcon />} onClick={openCreate} data-testid="s08-create">
              {t("s08.createDiscussion")}
            </Button>
          </div>
        </div>

        {loading && flags.length === 0 && !error ? (
          <div className={styles.loading} role="status" aria-busy="true" aria-label={t("staff.loading")}>
            <Skeleton lines={4} height={56} delay={0} />
          </div>
        ) : !loading && !error && flags.length === 0 ? (
          <EmptyState title={t("s08.emptyTitle")} data-testid="s08-empty">
            {t("s08.emptyBody")}
          </EmptyState>
        ) : (
          <ul className={styles.list}>
            {flags.map((flag) => {
              const hidden = flag.post.state === "hidden";
              const names = hasPossibleName(flag.name_check);
              const hiddenReason = flag.post.hidden_reason ?? null;
              const busy = busyId === flag.post.id;
              return (
                <li key={`${flag.discussion_id}-${flag.post.id}`} className={styles.card} data-hidden={hidden ? "" : undefined} data-testid={`s08-flag-${flag.post.id}`}>
                  <div className={styles.cardHead}>
                    <div className={styles.who}>
                      <span className={`${styles.code} eg-tnum`}>{t("s08.author", { code: flag.post.author_label })}</span>
                      <span className={`${styles.sub} eg-tnum`}>{formatWatDateTime(flag.post.created_at, locale)}</span>
                    </div>
                    <div className={styles.badges}>
                      {hidden ? <StatusBadge tone="wait" label={t("s08.hiddenBadge")} /> : null}
                      <StatusBadge tone="attn" label={t("s08.flaggedBy", { count: flag.flag_count })} />
                      {names ? <StatusBadge tone="info" label={t("s08.nameCheckAlert")} /> : null}
                    </div>
                  </div>

                  {hidden ? (
                    <div className={styles.hiddenBlock}>
                      <p className={styles.sub}>{t("s08.hiddenBodyLabel")}</p>
                      <blockquote className={`${styles.body} ${styles.bodyMuted}`}>{flag.post.hidden_body ?? flag.post.body}</blockquote>
                      {hiddenReason ? <p className={styles.sub}>{t("s08.hiddenFor", { reason: t(REASON_KEY[hiddenReason]) })}</p> : null}
                    </div>
                  ) : (
                    <blockquote className={styles.body}>{flag.post.body}</blockquote>
                  )}

                  {flag.reasons.length > 0 ? (
                    <div className={styles.reasons}>
                      <span className={styles.sub}>{t("s08.reasonsLabel")}</span>
                      <ul className={styles.chips}>
                        {flag.reasons.map((reason: FlagReason) => (
                          <li key={reason} className={styles.chip}>{t(REASON_KEY[reason])}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className={styles.actions}>
                    {hidden ? (
                      <Button variant="secondary" loading={busy} onClick={() => void unhide(flag)} data-testid={`s08-unhide-${flag.post.id}`}>
                        {t("s08.unhidePost")}
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => setDialog({ kind: "hide", flag })} data-testid={`s08-hide-${flag.post.id}`}>
                        {t("s08.hidePost")}
                      </Button>
                    )}
                    {!hidden ? (
                      <Button variant="quiet" onClick={() => setDialog({ kind: "remove", flag })} data-testid={`s08-remove-${flag.post.id}`}>{t("s08.removeMember")}</Button>
                    ) : null}
                    <Button variant="quiet" onClick={() => setDialog({ kind: "close", flag })} data-testid={`s08-close-${flag.post.id}`}>{t("s08.closeDiscussion")}</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && onLoadMore ? (
          <div className={styles.more}>
            <Button variant="secondary" onClick={onLoadMore} loading={loadingMore}>{t("s08.loadMore")}</Button>
          </div>
        ) : null}
      </section>

      {dialog?.kind === "hide" ? (
        <HideSheet
          flag={dialog.flag}
          onClose={() => setDialog(null)}
          onSubmit={async (reason, note) => {
            const res = (await onHidePost?.(dialog.flag.discussion_id, dialog.flag.post.id, reason, note)) ?? { ok: true as const };
            if (res.ok) {
              setDialog(null);
              setNotice({ tone: "ok", title: t("s08.noticeHidden") });
            }
            return res;
          }}
        />
      ) : null}
      {dialog?.kind === "remove" ? (
        <RemoveSheet
          code={dialog.flag.post.author_label}
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            const res = (await onRemoveMember?.(dialog.flag.discussion_id, dialog.flag.post.author_label, reason)) ?? { ok: true as const };
            if (res.ok) {
              setDialog(null);
              setNotice({ tone: "ok", title: t("s08.noticeRemoved", { code: dialog.flag.post.author_label }) });
            }
            return res;
          }}
        />
      ) : null}
      {dialog?.kind === "close" ? (
        <CloseSheet
          onClose={() => setDialog(null)}
          onSubmit={async () => {
            const res = (await onCloseDiscussion?.(dialog.flag.discussion_id)) ?? { ok: true as const };
            if (res.ok) {
              setDialog(null);
              setNotice({ tone: "ok", title: t("s08.noticeClosed") });
            }
            return res;
          }}
        />
      ) : null}
      {dialog?.kind === "create" ? (
        <CreateSheet
          areaStates={areaStates}
          areaDetail={areaDetail}
          onNeedAreas={onNeedAreas}
          onClose={() => setDialog(null)}
          onSubmit={async (input) => {
            const res = (await onCreateDiscussion?.(input)) ?? { ok: true as const, invited: 0, notFound: [] };
            if (res.ok) {
              setDialog(null);
              setNotice({
                tone: res.notFound.length > 0 ? "attn" : "ok",
                title: t("s08.noticeCreated", { invited: res.invited }),
                body: res.notFound.length > 0 ? t("s08.noticeNotFound", { codes: res.notFound.join(", ") }) : undefined,
              });
            }
            return res;
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------- Sheets ---------- */

function useSubmit(run: () => Promise<{ ok: true } | { ok: false; message: string }>) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setProblem(null);
    const res = await run();
    setBusy(false);
    if (!res.ok) setProblem(res.message);
  }
  return { busy, problem, go };
}

function HideSheet({
  flag,
  onClose,
  onSubmit,
}: {
  flag: ModerationFlag;
  onClose: () => void;
  onSubmit: (reason: HideReason, note?: string) => Promise<ModResult>;
}) {
  const t = useT();
  const formId = useId();
  const [reason, setReason] = useState<HideReason>(defaultHideReason(flag));
  const [note, setNote] = useState("");
  const { busy, problem, go } = useSubmit(() => onSubmit(reason, note.trim() || undefined));

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("s08.hideTitle")}
      description={t("s08.hideBody")}
      data-testid="s08-hide-sheet"
      footer={
        <div className={styles.footer}>
          <Button variant="quiet" onClick={onClose}>{t("s08.cancel")}</Button>
          <Button type="submit" form={formId} variant="primary" loading={busy} data-testid="s08-hide-confirm">{t("s08.hideConfirm")}</Button>
        </div>
      }
    >
      <form
        id={formId}
        className={styles.form}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void go();
        }}
      >
        {problem ? <Banner tone="danger" title={problem} critical /> : null}
        <blockquote className={`${styles.body} ${styles.quote}`}>{flag.post.body}</blockquote>
        <Select
          label={t("s08.hideReason")}
          value={reason}
          onChange={(e) => setReason(e.target.value as HideReason)}
          placeholder={false}
          options={HIDE_REASONS.map((value) => ({ value, label: t(REASON_KEY[value]) }))}
        />
        <TextArea label={t("s08.hideNote")} hint={t("s08.hideNoteHint")} optional maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </form>
    </Sheet>
  );
}

function RemoveSheet({ code, onClose, onSubmit }: { code: string; onClose: () => void; onSubmit: (reason: string) => Promise<ModResult> }) {
  const t = useT();
  const formId = useId();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const clean = reason.trim();
  const { busy, problem, go } = useSubmit(() => onSubmit(clean));

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("s08.removeTitle")}
      description={t("s08.removeBody", { code })}
      data-testid="s08-remove-sheet"
      footer={
        <div className={styles.footer}>
          <Button variant="quiet" onClick={onClose}>{t("s08.cancel")}</Button>
          <Button type="submit" form={formId} variant="danger" loading={busy} data-testid="s08-remove-confirm">{t("s08.removeConfirm")}</Button>
        </div>
      }
    >
      <form
        id={formId}
        className={styles.form}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setTouched(true);
          if (clean.length >= 1) void go();
        }}
      >
        {problem ? <Banner tone="danger" title={problem} critical /> : null}
        <TextArea
          label={t("s08.removeReason")}
          hint={t("s08.removeReasonHint")}
          maxLength={500}
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={touched && clean.length < 1 ? t("s08.valReason") : undefined}
        />
      </form>
    </Sheet>
  );
}

function CloseSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: () => Promise<ModResult> }) {
  const t = useT();
  const { busy, problem, go } = useSubmit(onSubmit);
  return (
    <Sheet
      open
      onClose={onClose}
      title={t("s08.closeTitle")}
      description={t("s08.closeBody")}
      data-testid="s08-close-sheet"
      footer={
        <div className={styles.footer}>
          <Button variant="quiet" onClick={onClose}>{t("s08.cancel")}</Button>
          <Button variant="danger" loading={busy} onClick={() => void go()} data-testid="s08-close-confirm">{t("s08.closeConfirm")}</Button>
        </div>
      }
    >
      {problem ? <Banner tone="danger" title={problem} critical /> : null}
    </Sheet>
  );
}

function CreateSheet({
  areaStates,
  areaDetail,
  onNeedAreas,
  onClose,
  onSubmit,
}: {
  areaStates: Array<{ state_code: string; name: string }> | null;
  areaDetail: Record<string, StateAreasResponse>;
  onNeedAreas?: (stateCode?: string) => void;
  onClose: () => void;
  onSubmit: (input: CreateDiscussionInput) => Promise<CreateDiscussionResult>;
}) {
  const t = useT();
  const formId = useId();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [lgaCode, setLgaCode] = useState("");
  const [wardCode, setWardCode] = useState("");
  const [invites, setInvites] = useState("");
  const [touched, setTouched] = useState(false);

  const state = stateCode ? areaDetail[stateCode] : undefined;
  const lga = state?.lgas.find((item) => item.lga_code === lgaCode);
  const codes = Array.from(new Set(invites.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean)));
  const cleanTitle = title.trim();

  const titleBad = cleanTitle.length < 3 || cleanTitle.length > 120;
  const areaBad = !lgaCode;
  const invitesBad = codes.length > 200;

  const { busy, problem, go } = useSubmit(() =>
    onSubmit({
      title: cleanTitle,
      topic: topic.trim(),
      scope: wardCode ? { kind: "ward", code: wardCode } : { kind: "lga", code: lgaCode },
      invites: codes,
    }),
  );

  useEffect(() => {
    if (stateCode) onNeedAreas?.(stateCode);
  }, [stateCode, onNeedAreas]);

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("s08.createDiscussion")}
      description={t("s08.createLead")}
      data-testid="s08-create-sheet"
      footer={
        <div className={styles.footer}>
          <Button variant="quiet" onClick={onClose}>{t("s08.cancel")}</Button>
          <Button type="submit" form={formId} variant="primary" loading={busy} data-testid="s08-create-confirm">{t("s08.createSubmit")}</Button>
        </div>
      }
    >
      <form
        id={formId}
        className={styles.form}
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setTouched(true);
          if (!titleBad && !areaBad && !invitesBad) void go();
        }}
      >
        {problem ? <Banner tone="danger" title={problem} critical /> : null}
        <Field
          label={t("s08.titleLabel")}
          hint={t("s08.titleHint")}
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={touched && titleBad ? t("s08.valTitle") : undefined}
          autoComplete="off"
        />
        <TextArea label={t("s08.topic")} hint={t("s08.topicHint")} optional maxLength={500} rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} />

        <fieldset className={styles.area}>
          <legend className={styles.legend}>{t("s08.areaLabel")}</legend>
          {areaStates === null ? <p className={styles.sub} role="status">{t("s08.areaLoading")}</p> : null}
          <Select
            label={t("s08.state")}
            value={stateCode}
            onChange={(e) => {
              setStateCode(e.target.value);
              setLgaCode("");
              setWardCode("");
            }}
            options={(areaStates ?? []).map((s) => ({ value: s.state_code, label: s.name }))}
            disabled={areaStates === null}
          />
          <Select
            label={t("s08.lga")}
            value={lgaCode}
            onChange={(e) => {
              setLgaCode(e.target.value);
              setWardCode("");
            }}
            options={(state?.lgas ?? []).map((l) => ({ value: l.lga_code, label: l.name }))}
            disabled={!state}
            error={touched && areaBad ? t("s08.valArea") : undefined}
          />
          <Select
            label={t("s08.ward")}
            optional
            value={wardCode}
            onChange={(e) => setWardCode(e.target.value)}
            placeholder={t("s08.wholeLga")}
            options={(lga?.wards ?? []).map((w) => ({ value: w.ward_code, label: w.name }))}
            disabled={!lga}
          />
        </fieldset>

        <TextArea
          label={t("s08.invites")}
          hint={t("s08.invitesHint")}
          optional
          rows={4}
          value={invites}
          onChange={(e) => setInvites(e.target.value)}
          error={touched && invitesBad ? t("s08.valInvites") : undefined}
          spellCheck={false}
          autoCapitalize="characters"
        />
      </form>
    </Sheet>
  );
}
