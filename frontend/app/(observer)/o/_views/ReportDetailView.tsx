"use client";

/* O-14 Report detail: status, formal question, what was reported, attachments, conversation, withdraw. */

import { useRef } from "react";
import type { Category, MessageKind, QuestionState, ReportKind } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { AppShell, Banner, Button, ButtonLink, Sheet, StatusBadge, TextArea, UploadItem, UploadList, type ReportStatus, type StatusTone, type UploadState } from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { categoryPictograms, CheckIcon, ClockIcon, ImageIcon, PlaceIcon, ShieldCheckIcon } from "../../../../ui/icons";
import { categoryMeta } from "../_lib/categories";
import { ChecklistPictogram, SheetPictogram } from "../_components/pictograms";
import styles from "../_components/observer.module.css";
import s from "../_components/screens.module.css";

export type DetailMessage = {
  id: string;
  kind: MessageKind;
  mine: boolean;
  authorLabel: string;
  body: string;
  at: string | number;
  queued?: boolean;
  questionState?: QuestionState | null;
  attachmentUrl?: string | null;
};

export type DetailAttachment = {
  id: string;
  kind: "photo" | "video" | "audio";
  name: string;
  sizeBytes: number;
  state: UploadState;
  progress?: number;
  reasonKey?: string;
  removable: boolean;
  /** MED-04 link, opened only when the observer taps (saves data). */
  viewUrl?: string | null;
};

export type DetailLoad = "loading" | "ok" | "offline" | "error" | "not_found";

export type ReportDetailViewProps = {
  offline: boolean;
  load: DetailLoad;
  /** "server" = a received report; "local" = still on this phone (never sent); "withdrawn" = the stub. */
  source: "server" | "local" | "withdrawn";
  receiptCode: string | null;
  status: ReportStatus;
  statusHintKey: string;
  outcomeKey?: string | null;
  kind: ReportKind;
  category: Category | null;
  stage?: string | null;
  place: string | null;
  observedAt: string | number | null;
  receivedAt: string | null;
  withdrawnAt?: string | null;
  /** The report text from REP-03 (or the outbox for a local item); null when it is not on the phone. */
  description: string | null;
  /** Checklist answers or result-sheet numbers, already translated. */
  answers?: Array<{ label: string; value: string }>;
  attachments: DetailAttachment[];
  canAddMedia: boolean;
  adding: boolean;
  onAdd: (file: File) => void;
  onRemoveAttachment: (id: string) => void;
  attachmentBlocked: boolean;

  question: { id: string; body: string; askedAt: string } | null;
  reply: string;
  onReply: (text: string) => void;
  replyState: null | "sending" | "queued" | "sent" | "closed";
  replyError: string | null;
  onSendReply: () => void;
  onSendAsMessage: () => void;

  conversation: "ok" | "loading" | "offline" | "error" | "unavailable";
  messages: DetailMessage[];
  canMessage: boolean;
  /** Writes refused (report closed or withdrawn): the unsent text stays for copying. */
  writesRefused: boolean;
  draft: string;
  onDraft: (text: string) => void;
  messageState: null | "sending" | "queued";
  messageError: string | null;
  onSendMessage: () => void;
  onAttach: (file: File) => void;
  attaching: boolean;
  attachedName: string | null;

  canWithdraw: boolean;
  withdraw: null | "confirm" | "sending" | "too_late" | "error";
  onWithdraw: () => void;
  onConfirmWithdraw: () => void;
  onCancelWithdraw: () => void;

  /** Local items only. */
  canSendNow: boolean;
  onSendNow: () => void;
  deleteConfirm: boolean;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;

  banner: { tone: StatusTone; key: string } | null;
  onRetry: () => void;
  onBack: () => void;
};

function when(value: string | number | null, locale: Parameters<typeof formatWatDateTime>[1]) {
  return value === null ? "" : formatWatDateTime(value, locale);
}

export function ReportDetailView(props: ReportDetailViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const addInput = useRef<HTMLInputElement>(null);
  const attachInput = useRef<HTMLInputElement>(null);
  const { offline, load, source, receiptCode, status, kind, category } = props;
  const meta = categoryMeta(category);
  const Pictogram = kind === "checklist" ? ChecklistPictogram : kind === "result_sheet" ? SheetPictogram : categoryPictograms[meta.pictogram];
  const label = kind === "checklist" ? t("o13.checklistStage", { stage: t(`o15.stage.${props.stage ?? "arrival"}`) }) : kind === "result_sheet" ? t("o13.resultSheet") : t(`o05.tile.${meta.tile}`);
  const title = label;

  const shell = (content: React.ReactNode, actions?: React.ReactNode) => (
    <AppShell
      title={receiptCode ? <span className="eg-tnum">{receiptCode}</span> : t("o13.title")}
      onBack={props.onBack}
      offline={offline}
      banner={props.banner ? <Banner tone={props.banner.tone} title={t(props.banner.key)} data-testid="o14-banner" /> : undefined}
      actions={actions}
      data-testid="o14"
    >
      {content}
    </AppShell>
  );

  if (load === "loading") {
    return shell(
      <div className={styles.screen}>
        <h1 className={styles.title}>{t("o14.loading")}</h1>
      </div>,
    );
  }
  if (load === "not_found" || (load !== "ok" && source !== "local" && !receiptCode)) {
    return shell(
      <div className={styles.screen}>
        <h1 className={styles.title}>{t("o14.loadError")}</h1>
        {load === "error" || load === "offline" ? (
          <div>
            <Button variant="secondary" onClick={props.onRetry} disabled={offline} data-testid="o14-retry">
              {t("ui.retry")}
            </Button>
          </div>
        ) : null}
      </div>,
      <ButtonLink href="/o/reports" block variant="secondary">
        {t("o13.title")}
      </ButtonLink>,
    );
  }

  /* ---------- Withdrawn stub: received and withdrawn times only ---------- */
  if (source === "withdrawn") {
    return shell(
      <div className={styles.screen}>
        <h1 className={styles.title}>{title}</h1>
        <div className={s.statusBlock}>
          <StatusBadge status="withdrawn" size="lg" />
          <p className={styles.lead} data-testid="o14-withdrawn">
            {t("o14.withdraw.done")}
          </p>
        </div>
        <dl className={s.facts}>
          {props.receivedAt ? <Fact label={t("o14.receivedLabel")} value={when(props.receivedAt, locale)} /> : null}
          {props.withdrawnAt ? <Fact label={t("o14.withdrawnLabel")} value={when(props.withdrawnAt, locale)} /> : null}
        </dl>
      </div>,
    );
  }

  const questionOpen = Boolean(props.question) && props.replyState !== "sent";
  /* Received · Being reviewed · Question for you · Closed. The question step only appears if one was ever asked. */
  const askedEver = status === "question" || Boolean(props.question) || props.messages.some((message) => message.kind === "formal_question");
  const journeySteps: Array<{ key: "received" | "inReview" | "question" | "closed"; status: ReportStatus }> = [
    { key: "received", status: "received" },
    { key: "inReview", status: "in-review" },
    ...(askedEver ? [{ key: "question" as const, status: "question" as ReportStatus }] : []),
    { key: "closed", status: "closed" },
  ];
  const current = journeySteps.findIndex((step) => step.status === status);
  const journey =
    source === "server" && current >= 0 ? (
      <ol className={s.journey} aria-label={t("common.status.label")} data-testid="o14-journey">
        {journeySteps.map((step, index) => {
          const state = index < current || status === "closed" ? "done" : index === current ? "current" : "later";
          return (
            <li key={step.key} className={s.journeyStep} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className={s.journeyDot} aria-hidden="true">
                {state === "done" ? <CheckIcon size={14} strokeWidth={3} /> : null}
              </span>
              <span className={s.journeyLabel}>{t(`common.status.${step.key}`)}</span>
            </li>
          );
        })}
      </ol>
    ) : (
      <StatusBadge status={status} size="lg" />
    );
  const outcomeWhy = props.outcomeKey ? `o14.outcomeWhy.${props.outcomeKey.split(".").pop()}` : null;
  const statusBlock = (
    <div className={s.statusBlock}>
      {journey}
      {props.outcomeKey && outcomeWhy ? (
        <section className={s.outcome} data-testid="o14-outcome">
          <span className={s.outcomeDisc} aria-hidden="true">
            <ShieldCheckIcon size={24} />
          </span>
          <div className={s.outcomeText}>
            <h2 className={s.outcomeTitle}>{t(props.outcomeKey)}</h2>
            <p>{t(outcomeWhy)}</p>
            <p className={styles.meta}>{t(props.statusHintKey)}</p>
          </div>
        </section>
      ) : (
        <p className={styles.lead} style={{ marginTop: 0 }}>
          {t(props.statusHintKey)}
        </p>
      )}
    </div>
  );

  const questionBlock = props.question ? (
    <section className={s.question} aria-labelledby="o14-question" data-testid="o14-question">
      <h2 className={s.questionHead} id="o14-question" tabIndex={-1}>
        <Diamond />
        {t("o14.question.title")}
      </h2>
      {props.question.body ? (
        <>
          <p className={s.questionBody}>{props.question.body}</p>
          <p className={styles.meta}>{t("o14.question.asked", { time: when(props.question.askedAt, locale) })}</p>
        </>
      ) : null}
      {props.replyState === "sent" ? (
        <p className={styles.tag} role="status" data-testid="o14-reply-sent">
          {t("o14.question.sent")}
        </p>
      ) : (
        <>
          <TextArea
            label={t("o14.question.replyLabel")}
            value={props.reply}
            onChange={(event) => props.onReply(event.target.value)}
            maxLength={2000}
            rows={4}
            error={props.replyError ?? undefined}
            data-testid="o14-reply"
          />
          {props.replyState === "queued" ? <p className={styles.note}>{t("o14.question.queued")}</p> : null}
          {props.replyState === "closed" ? (
            <Banner
              tone="attn"
              title={t("o14.question.alreadyAnswered")}
              action={
                <Button variant="secondary" onClick={props.onSendAsMessage} data-testid="o14-send-as-message">
                  {t("o14.question.sendAsMessage")}
                </Button>
              }
            />
          ) : (
            <Button block loading={props.replyState === "sending"} loadingLabel={t("o14.question.sending")} onClick={props.onSendReply} data-testid="o14-reply-send">
              {t("o14.question.send")}
            </Button>
          )}
        </>
      )}
    </section>
  ) : null;

  const details = (
    <section aria-labelledby="o14-details" className={s.reportCard}>
      <h2 className={styles.sectionTitle} id="o14-details">
        {t("o14.details")}
      </h2>
      {props.receivedAt ? (
        <p className={`${styles.meta} eg-tnum`}>{t("o14.received", { time: when(props.receivedAt, locale) })}</p>
      ) : null}
      {props.description !== null || props.answers?.length ? (
        <dl className={s.facts}>
          {props.description !== null ? <Fact label={t("o14.description")} value={props.description} /> : null}
          {props.answers?.map((answer) => <Fact key={answer.label} label={answer.label} value={answer.value} />)}
        </dl>
      ) : (
        <p className={styles.note} data-testid="o14-not-kept">
          {t("o14.contentNotKept")}
        </p>
      )}
    </section>
  );

  const attachments =
    props.attachments.length || props.canAddMedia ? (
      <section aria-labelledby="o14-attachments" className={styles.tight}>
        <h2 className={styles.sectionTitle} id="o14-attachments">
          {t("o14.attachments")}
        </h2>
        {props.attachmentBlocked ? <Banner tone="attn" title={t("o12.upload.cannotRemove")} /> : null}
        {props.attachments.length ? (
          <UploadList label={t("o14.attachments")}>
            {props.attachments.map((item) => (
              <UploadItem
                key={item.id}
                kind={item.kind === "audio" ? "voice" : item.kind}
                name={item.name}
                sizeBytes={item.sizeBytes}
                state={item.state}
                progress={item.progress}
                reason={item.reasonKey ? t(item.reasonKey) : undefined}
                onRemove={item.removable ? () => props.onRemoveAttachment(item.id) : undefined}
                data-testid="o14-attachment"
              />
            ))}
          </UploadList>
        ) : null}
        {props.attachments.some((item) => item.viewUrl) ? (
          <div className={styles.itemActions}>
            {props.attachments.map((item, index) =>
              item.viewUrl ? (
                <a key={item.id} className={s.textLink} href={item.viewUrl} target="_blank" rel="noopener" data-testid="o14-view">
                  {t("o14.view", { kind: item.kind, n: index + 1 })}
                </a>
              ) : null,
            )}
          </div>
        ) : null}
        {props.canAddMedia ? (
          <div>
            <Button variant="secondary" icon={<ImageIcon />} loading={props.adding} disabled={offline} onClick={() => addInput.current?.click()} data-testid="o14-add">
              {t("o14.add")}
            </Button>
            <input
              ref={addInput}
              type="file"
              accept="image/*,video/*,audio/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) props.onAdd(file);
              }}
            />
            {offline ? <p className={styles.note}>{t("o14.addOffline")}</p> : null}
          </div>
        ) : null}
      </section>
    ) : null;

  const conversation =
    source === "server" ? (
      <section aria-labelledby="o14-conversation" className={s.column}>
        <h2 className={styles.sectionTitle} id="o14-conversation">
          {t("o14.conversation.title")}
        </h2>
        {props.conversation === "loading" ? (
          <p className={styles.meta}>{t("o14.conversation.loading")}</p>
        ) : props.conversation === "unavailable" ? (
          <p className={styles.note}>{t("common.error.unavailable")}</p>
        ) : props.conversation === "error" ? (
          <p className={styles.note}>{t("o14.conversation.loadError")}</p>
        ) : props.conversation === "offline" && !props.messages.length ? (
          <p className={styles.note}>{t("o14.conversation.offline")}</p>
        ) : props.messages.length === 0 ? (
          <p className={styles.meta}>{t("o14.conversation.empty")}</p>
        ) : null}
        {props.messages.length ? (
          <ol className={s.thread} aria-label={t("o14.conversation.title")} data-testid="o14-thread">
            {props.messages.map((message) => (
              <MessageItem key={message.id} message={message} />
            ))}
          </ol>
        ) : null}
        {props.canMessage && !props.writesRefused ? (
          <div className={s.composer}>
            <TextArea
              label={t("o14.conversation.label")}
              value={props.draft}
              onChange={(event) => props.onDraft(event.target.value)}
              maxLength={2000}
              rows={3}
              error={props.messageError ?? undefined}
              data-testid="o14-message"
            />
            {props.attachedName ? <p className={styles.tag}>{t("o14.conversation.attached", { name: props.attachedName })}</p> : null}
            <div className={s.composerActions}>
              <Button variant="quiet" icon={<ImageIcon />} loading={props.attaching} disabled={offline} onClick={() => attachInput.current?.click()} data-testid="o14-attach">
                {t("o14.conversation.attach")}
              </Button>
              <Button variant={questionOpen ? "secondary" : "primary"} loading={props.messageState === "sending"} loadingLabel={t("o14.question.sending")} onClick={props.onSendMessage} data-testid="o14-message-send">
                {t("o14.conversation.send")}
              </Button>
            </div>
            <input
              ref={attachInput}
              type="file"
              accept="image/*,audio/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) props.onAttach(file);
              }}
            />
          </div>
        ) : props.writesRefused && props.draft ? (
          <TextArea label={t("o14.conversation.unsent")} value={props.draft} readOnly rows={3} />
        ) : null}
      </section>
    ) : null;

  const dangerZone =
    source === "local" ? (
      <div className={s.dangerZone}>
        <p className={styles.note}>{t("o14.deleteLocal.note")}</p>
        <div>
          <Button variant="secondary" className={s.dangerOutline} onClick={props.onDelete} data-testid="o14-delete-local">
            {t("o14.deleteLocal.button")}
          </Button>
        </div>
      </div>
    ) : props.canWithdraw ? (
      <div className={s.dangerZone}>
        <div>
          <Button variant="secondary" className={s.dangerOutline} onClick={props.onWithdraw} data-testid="o14-withdraw">
            {t("o14.withdraw.button")}
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <>
      {shell(
        <div className={`${styles.screen} ${styles.wide}`}>
          <div className={s.detailHead}>
            <h1 className={`${styles.title} ${styles.valueRow}`}>
              <Pictogram size={36} aria-hidden="true" />
              <span>{title}</span>
            </h1>
            <p className={s.detailMeta}>
              {props.place ? (
                <span className={styles.valueRow}>
                  <PlaceIcon size={18} aria-hidden="true" />
                  {props.place}
                </span>
              ) : null}
              {props.observedAt !== null ? (
                <span className={`${styles.valueRow} eg-tnum`}>
                  <ClockIcon size={18} aria-hidden="true" />
                  {t("o14.observed", { time: when(props.observedAt, locale) })}
                </span>
              ) : null}
              <span className="eg-tnum" data-testid="o14-code">
                {receiptCode ?? t("o14.notSentYet")}
              </span>
            </p>
          </div>
          <div className={s.detail}>
            <div className={s.column}>
              {questionBlock}
              {statusBlock}
              {details}
              {attachments}
            </div>
            <div className={s.column}>
              {conversation}
              {dangerZone}
            </div>
          </div>
        </div>,
        source === "local" && props.canSendNow ? (
          <Button block disabled={offline} onClick={props.onSendNow} data-testid="o14-send-now">
            {t("o04.sendNow")}
          </Button>
        ) : undefined,
      )}

      <Sheet
        open={props.withdraw !== null}
        onClose={props.onCancelWithdraw}
        title={t("o14.withdraw.title")}
        description={t("o14.withdraw.body")}
        footer={
          <>
            <Button variant="secondary" block onClick={props.onCancelWithdraw} autoFocus data-testid="o14-withdraw-keep">
              {t("o14.withdraw.keep")}
            </Button>
            <Button variant="danger" block disabled={offline} loading={props.withdraw === "sending"} onClick={props.onConfirmWithdraw} data-testid="o14-withdraw-confirm">
              {t("o14.withdraw.confirm")}
            </Button>
          </>
        }
        data-testid="o14-withdraw-sheet"
      >
        {offline ? <Banner tone="wait" title={t("o14.withdraw.offline")} /> : null}
        {props.withdraw === "error" ? <Banner tone="danger" title={t("common.error.server")} /> : null}
      </Sheet>

      <Sheet
        open={props.deleteConfirm}
        onClose={props.onCancelDelete}
        title={t("common.discard.title")}
        description={t("o14.deleteLocal.note")}
        footer={
          <>
            <Button variant="secondary" block onClick={props.onCancelDelete} autoFocus data-testid="o14-delete-keep">
              {t("common.discard.keep")}
            </Button>
            <Button variant="danger" block onClick={props.onConfirmDelete} data-testid="o14-delete-confirm">
              {t("common.discard.confirm")}
            </Button>
          </>
        }
      />
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.fact}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Diamond() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path d="M9 1.5 16.5 9 9 16.5 1.5 9z" fill="currentColor" />
    </svg>
  );
}

function MessageItem({ message }: { message: DetailMessage }) {
  const t = useT();
  const { locale } = useLocale();
  const at = formatWatDateTime(message.at, locale);
  if (message.kind === "system") {
    return (
      <li className={s.system}>
        {message.body} · <span className="eg-tnum">{at}</span>
      </li>
    );
  }
  if (message.kind === "formal_question") {
    return (
      <li className={s.formal}>
        <span className={s.formalTag}>
          <Diamond />
          {t("o14.conversation.formalQuestion")}
          {message.questionState === "answered" ? ` · ${t("o14.conversation.answered")}` : message.questionState === "closed_unanswered" ? ` · ${t("o14.conversation.closedUnanswered")}` : ""}
        </span>
        <p className={s.bubbleText}>{message.body}</p>
        <span className={s.bubbleMeta}>
          <span className={s.bubbleAuthor}>{t("o14.conversation.reviewer")}</span>
          <span>{at}</span>
        </span>
      </li>
    );
  }
  return (
    <li className={`${s.bubble} ${message.mine ? s.bubbleMine : ""}`}>
      <p className={s.bubbleText}>{message.body}</p>
      {message.attachmentUrl ? (
        <a className={s.textLink} href={message.attachmentUrl} target="_blank" rel="noopener">
          {t("o14.conversation.openAttachment")}
        </a>
      ) : null}
      <span className={s.bubbleMeta}>
        <span className={s.bubbleAuthor}>{message.mine ? t("o14.conversation.you") : t("o14.conversation.reviewer")}</span>
        <span>{message.queued ? t("o14.conversation.queued") : at}</span>
      </span>
    </li>
  );
}
