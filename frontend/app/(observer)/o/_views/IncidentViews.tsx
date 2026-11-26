"use client";

/* O-05 … O-11: the incident steps. Presentational: the flow container owns the draft and the outbox. */

import { useState, type ReactNode } from "react";
import type { AccessBarrierDetail, Category } from "../../../../lib/api/types";
import { EMERGENCY_NUMBER } from "../../../../lib/config";
import { useLocale, useT } from "../../../../lib/i18n/client";
import {
  Banner,
  Button,
  ButtonLink,
  ChoiceTileGroup,
  DictationCorner,
  DictationStatus,
  MediaCapture,
  PollingUnitPicker,
  Sheet,
  StatusBadge,
  Stepper,
  TextArea,
  WhenPicker,
  Switch,
  YesNo,
  type CaptureSource,
  type DictationState,
  type PollingUnitPickerProps,
  type VoiceRecorder,
  type WhenValue,
  useDictation,
} from "../../../../ui";
import { formatBytes, formatWatDateTime } from "../../../../ui/format";
import {
  AlertIcon,
  CameraIcon,
  categoryPictograms,
  CheckIcon,
  ClockIcon,
  MicIcon,
  PhoneIcon,
  PlaceIcon,
  RetryIcon,
  ShieldCheckIcon,
  TrashIcon,
  VideoIcon,
  EyeIcon,
  MessageIcon,
} from "../../../../ui/icons";
import { ObserverShell } from "../_components/ObserverShell";
import styles from "../_components/observer.module.css";
import { ACCESS_DETAILS, CATEGORIES, categoryMeta } from "../_lib/categories";

export const TOTAL_STEPS = 7;

/* ---------- Shared step shell: Back, Menu (Delete this report), Stepper, pinned action ---------- */

export type StepShellProps = {
  step: number;
  onBack: () => void;
  /** Delete the draft (confirmed in a sheet). Omit when there is no draft yet. */
  onDiscard?: () => void;
  /** Close: keep the draft on this phone and go Home. */
  onLeave?: () => void;
  offline?: boolean;
  banner?: ReactNode;
  actions?: ReactNode;
  testId: string;
  citizen?: boolean;
  children: ReactNode;
};

export function StepShell({ step, onBack, onDiscard, onLeave, offline, banner, actions, testId, citizen, children }: StepShellProps) {
  const t = useT();
  const [leaving, setLeaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const leave = onLeave ?? onBack;
  return (
    <ObserverShell
      title={citizen ? <span data-testid="citizen-title">{t("o04.citizenMode")}</span> : t("ui.nav.newReport")}
      onBack={onBack}
      onClose={onDiscard ? () => setLeaving(true) : leave}
      offline={offline}
      banner={banner}
      actions={actions}
      data-testid={testId}
    >
      <div className={`${styles.screen} ${styles.wide}`}>
        {step > 0 ? <Stepper current={step} total={TOTAL_STEPS} /> : null}
        {children}
      </div>
      {onDiscard ? (
        <>
          <Sheet open={leaving} onClose={() => setLeaving(false)} title={t("incident.leave.title")} description={t("incident.leave.body")} data-testid="step-leave">
            <div className={styles.stack}>
              <Button
                block
                onClick={() => {
                  setLeaving(false);
                  leave();
                }}
                data-testid="step-leave-keep"
              >
                {t("incident.leave.save")}
              </Button>
              <Button
                variant="secondary"
                block
                icon={<TrashIcon />}
                onClick={() => {
                  setLeaving(false);
                  setConfirm(true);
                }}
                data-testid="step-menu-discard"
              >
                {t("incident.discard")}
              </Button>
              <Button variant="quiet" block onClick={() => setLeaving(false)} data-testid="step-leave-continue">
                {t("incident.leave.keep")}
              </Button>
            </div>
          </Sheet>
          <Sheet
            open={confirm}
            onClose={() => setConfirm(false)}
            title={t("common.discard.title")}
            description={t("common.discard.body")}
            footer={
              <>
                <Button
                  variant="danger"
                  block
                  onClick={() => {
                    setConfirm(false);
                    onDiscard();
                  }}
                  data-testid="discard-confirm"
                >
                  {t("common.discard.confirm")}
                </Button>
                <Button variant="secondary" block onClick={() => setConfirm(false)} data-testid="discard-keep">
                  {t("common.discard.keep")}
                </Button>
              </>
            }
            data-testid="discard-sheet"
          />
        </>
      ) : null}
    </ObserverShell>
  );
}

/** `citizen`: a report without an account (screen 29): the bar names it, and Check and send explains the receipt. */
type Common = { onBack: () => void; onDiscard?: () => void; onLeave?: () => void; offline?: boolean; banner?: ReactNode; citizen?: boolean };

/* ---------- O-05 What happened? ---------- */

export type CategoryViewProps = Common & {
  value: Category | null;
  access: AccessBarrierDetail[];
  error: boolean;
  onChange: (value: Category) => void;
  onAccess: (value: AccessBarrierDetail[]) => void;
  onContinue: () => void;
};

export function CategoryView({ value, access, error, onChange, onAccess, onContinue, ...shell }: CategoryViewProps) {
  const t = useT();
  return (
    <StepShell
      step={1}
      testId="o05"
      {...shell}
      actions={
        <Button block onClick={onContinue} data-testid="continue">
          {t("common.continue")}
        </Button>
      }
    >
      <p className="eg-sr-only" role="alert" aria-live="assertive">
        {error ? t("o05.error") : ""}
      </p>
      <ChoiceTileGroup
        legend={t("o05.title")}
        headingLevel={1}
        hint={t("o05.hint")}
        error={error ? t("o05.error") : undefined}
        name="category"
        columns={3}
        value={value}
        onChange={(next) => onChange(next as Category)}
        options={CATEGORIES.map((item) => ({
          value: item.value,
          label: t(`o05.tile.${item.tile}`),
          pictogram: categoryPictograms[item.pictogram],
        }))}
        data-testid="o05-tiles"
      />
      {value === "access_barrier" ? (
        <fieldset className={styles.checks} data-testid="o05-access">
          <legend className={styles.checksLegend}>{t("o05.access.title")}</legend>
          <p className={styles.meta}>{t("o05.access.hint")}</p>
          <div className={styles.checksList}>
            {ACCESS_DETAILS.map((item) => (
              <label key={item.value} className={styles.check}>
                <input
                  type="checkbox"
                  checked={access.includes(item.value)}
                  onChange={(event) =>
                    onAccess(event.target.checked ? [...access, item.value] : access.filter((existing) => existing !== item.value))
                  }
                  data-testid={`o05-access-${item.value}`}
                />
                <span>{t(`o05.access.${item.key}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </StepShell>
  );
}

/* ---------- O-06 Is anyone in danger? ---------- */

export type DangerViewProps = Common & { value: boolean | null; error?: boolean; onAnswer: (value: boolean) => void };

export function DangerView({ value, error, onAnswer, ...shell }: DangerViewProps) {
  const t = useT();
  return (
    <StepShell step={2} testId="o06" {...shell}>
      <YesNo
        legend={t("o06.title")}
        headingLevel={1}
        hint={t("o06.hint")}
        error={error ? t("o06.error") : undefined}
        name="danger"
        value={value}
        onChange={onAnswer}
        yesLabel={t("o06.yes")}
        noLabel={t("o06.no")}
        yesIcon={<AlertIcon />}
        noIcon={<ShieldCheckIcon />}
        yesTone="danger"
        stacked
        data-testid="o06-answer"
      />
    </StepShell>
  );
}

export type EmergencyViewProps = Common & { onContinue: () => void; onLater: () => void };

export function EmergencyView({ onContinue, onLater, ...shell }: EmergencyViewProps) {
  const t = useT();
  return (
    <StepShell
      step={0}
      testId="o06-emergency"
      {...shell}
      actions={
        <>
          <Button variant="quiet" block onClick={onLater} data-testid="o06-later">
            {t("o06.emergency.later")}
          </Button>
          <Button variant="secondary" block onClick={onContinue} data-testid="o06-continue">
            {t("o06.emergency.continue")}
          </Button>
        </>
      }
    >
      {/* One safety card: the steps, then Call 112 as the strongest action on the page. */}
      <section className={styles.safetyCard} aria-labelledby="o06-emergency-title">
        <div className={styles.titleRow}>
          <span className={styles.safetyDisc} aria-hidden="true">
            <AlertIcon size={26} />
          </span>
          <h1 className={styles.title} id="o06-emergency-title">
            {t("o06.emergency.title")}
          </h1>
        </div>
        <ol className={`${styles.steps} ${styles.safetySteps}`}>
          <li>{t("o06.emergency.step1")}</li>
          <li>{t("o06.emergency.step2")}</li>
          <li>{t("o06.emergency.step3")}</li>
        </ol>
        <ButtonLink href={`tel:${EMERGENCY_NUMBER}`} variant="danger" block icon={<PhoneIcon />} className={`${styles.call} ${styles.callNow}`} data-testid="o06-call">
          {t("o06.emergency.call")}
        </ButtonLink>
        <p className={styles.noDispatch} data-testid="o06-no-dispatch">
          {t("o06.emergency.noDispatch")}
        </p>
      </section>
    </StepShell>
  );
}

/* ---------- O-07 Where? ---------- */

export type WhereViewProps = Common & {
  picker: Omit<PollingUnitPickerProps, "error">;
  summary: string | null;
  error: boolean;
  /** The unit the Arrival stage recorded today, pinned above the search. */
  useToday?: { label: string; code: string; selected: boolean; onUse: () => void } | null;
  onContinue: () => void;
};

export function WhereView({ picker, summary, error, useToday, onContinue, ...shell }: WhereViewProps) {
  const t = useT();
  return (
    <StepShell
      step={3}
      testId="o07"
      {...shell}
      actions={
        <Button block onClick={onContinue} data-testid="continue">
          {t("common.continue")}
        </Button>
      }
    >
      <h1 className={styles.title}>{t("o07.title")}</h1>
      <p className={`${styles.note} ${styles.noGps}`}>
        <PlaceIcon />
        <span>{t("o07.noGps")}</span>
      </p>
      {useToday ? (
        <button
          type="button"
          className={styles.todayCard}
          aria-pressed={useToday.selected}
          onClick={useToday.onUse}
          data-testid="o07-use-today"
        >
          <span className={styles.todayDisc} aria-hidden="true">
            <PlaceIcon size={24} />
          </span>
          <span className={styles.todayText}>
            <span className={styles.todayEyebrow}>{t("o07.todayTitle")}</span>
            <span className={styles.todayName}>{useToday.label}</span>
            <span className={styles.todayCode}>{useToday.code}</span>
          </span>
          <span className={styles.todayTick} aria-hidden="true">
            {useToday.selected ? <CheckIcon size={18} /> : null}
          </span>
        </button>
      ) : null}
      <PollingUnitPicker {...picker} error={error ? t("o07.error") : undefined} selected={summary ? t("o07.selected", { place: summary }) : ""} />
    </StepShell>
  );
}

/* ---------- O-08 When? ---------- */

export type WhenViewProps = Common & {
  value: WhenValue;
  onChange: (value: WhenValue) => void;
  showErrors: boolean;
  /** Corrected "now" for the future check (server clock). */
  now: number | null;
  minDate: string;
  oldSheet: boolean;
  onConfirmOld: () => void;
  onChangeDate: () => void;
  onContinue: () => void;
  /** The phone clock is more than 10 minutes off, so times use the server clock. */
  networkTime?: boolean;
};

export function WhenView({ value, onChange, showErrors, now, minDate, oldSheet, onConfirmOld, onChangeDate, onContinue, networkTime, ...shell }: WhenViewProps) {
  const t = useT();
  return (
    <StepShell
      step={4}
      testId="o08"
      {...shell}
      actions={
        <Button block onClick={onContinue} data-testid="continue">
          {t("common.continue")}
        </Button>
      }
    >
      <WhenPicker
        legend={t("o08.title")}
        headingLevel={1}
        name="when"
        value={value}
        onChange={onChange}
        showErrors={showErrors}
        requireDayTime
        minDate={minDate}
        now={now}
        zoneText={networkTime ? `${t("o08.watNote")} ${t("o08.networkTime")}` : t("o08.watNote")}
        data-testid="o08-when"
      />
      <Sheet
        open={oldSheet}
        onClose={onChangeDate}
        title={t("o08.old.title")}
        description={t("o08.old.body")}
        footer={
          <>
            <Button block onClick={onConfirmOld} data-testid="o08-old-confirm">
              {t("o08.old.confirm")}
            </Button>
            <Button variant="secondary" block onClick={onChangeDate} data-testid="o08-old-change">
              {t("o08.old.change")}
            </Button>
          </>
        }
        data-testid="o08-old"
      />
    </StepShell>
  );
}

/* ---------- O-09 Tell us what happened ---------- */

export type DescribeError = { key: "o09.tooShort"; min: number } | { key: "o09.tooLong"; max: number } | null;

export type DescribeViewProps = Common & {
  text: string;
  onText: (value: string) => void;
  firsthand: boolean | null;
  onFirsthand: (value: boolean) => void;
  textError: DescribeError;
  sourceError: boolean;
  nameWarning: boolean;
  onNameKeep: () => void;
  dictationLang: string;
  onDictated: (text: string) => void;
  dictationState?: DictationState;
  textRef?: React.Ref<HTMLTextAreaElement>;
  onContinue: () => void;
};

export function DescribeView({
  text,
  onText,
  firsthand,
  onFirsthand,
  textError,
  sourceError,
  nameWarning,
  onNameKeep,
  dictationLang,
  onDictated,
  dictationState,
  textRef,
  onContinue,
  ...shell
}: DescribeViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const dictation = useDictation(dictationLang, onDictated, dictationState);
  const errorText = textError ? (textError.key === "o09.tooShort" ? t(textError.key, { min: textError.min }) : t(textError.key, { max: textError.max })) : undefined;
  return (
    <StepShell
      step={5}
      testId="o09"
      {...shell}
      actions={
        <Button block onClick={onContinue} data-testid="continue">
          {t("common.continue")}
        </Button>
      }
    >
      <h1 className={styles.title}>{t("o09.title")}</h1>
      <div className={styles.describe}>
        <ul className={styles.hints} id="o09-hints">
          <li>{t("o09.hint1")}</li>
          <li>{t("o09.hint2")}</li>
          <li>{t("o09.hint3")}</li>
        </ul>
        <div className={styles.stack}>
          <TextArea
            ref={textRef}
            label={t("o09.label")}
            value={text}
            onChange={(event) => onText(event.target.value)}
            rows={6}
            lang={locale}
            autoCorrect="on"
            aria-describedby="o09-hints"
            error={errorText}
            adornment={<DictationCorner dictation={dictation} />}
            data-testid="o09-text"
          />
          {text.length >= 1500 ? (
            <p className={styles.meta} aria-live="polite" data-testid="o09-count">
              {t("ui.charCount", { count: text.length, max: 2000 })}
            </p>
          ) : null}
          <DictationStatus dictation={dictation} />
          {nameWarning ? (
            <div role="alert">
              <Banner
                tone="attn"
                title={t("o09.nameWarning")}
                action={
                  <Button variant="secondary" onClick={onNameKeep} data-testid="o09-name-keep">
                    {t("o09.nameKeep")}
                  </Button>
                }
                data-testid="o09-name-warning"
              />
            </div>
          ) : null}
          <YesNo
            legend={t("o09.source")}
            name="source"
            value={firsthand}
            onChange={onFirsthand}
            yesLabel={t("o09.sourceSelf")}
            noLabel={t("o09.sourceTold")}
            yesIcon={<EyeIcon />}
            noIcon={<MessageIcon />}
            error={sourceError ? t("o09.sourceError") : undefined}
            stacked
            data-testid="o09-source"
          />
        </div>
      </div>
    </StepShell>
  );
}

/* ---------- O-10 Evidence ---------- */

export type EvidenceItem = {
  id: string;
  kind: "photo" | "video" | "audio";
  name: string;
  sizeBytes: number;
  previewUrl: string | null;
  blur: boolean;
  processing: boolean;
};

export type EvidenceViewProps = Common & {
  items: EvidenceItem[];
  recorder: Pick<VoiceRecorder, "elapsedMs" | "start" | "stop">;
  onPick: (file: File, source: CaptureSource) => void;
  onBlur: (id: string, value: boolean) => void;
  onRetake: (id: string) => void;
  onRemove: (id: string) => void;
  /** Problems to show above the grid (message keys with variables). */
  notices: Array<{ key: string; vars?: Record<string, string | number>; tone: "attn" | "danger" | "wait" }>;
  limitReached: boolean;
  /** Estimated seconds to send, per item id (null when offline). */
  estimate: (bytes: number) => number | null;
  onContinue: () => void;
};

const kindIcon = { photo: CameraIcon, video: VideoIcon, audio: MicIcon } as const;
/** Attachments per report (contract: media_limit_reached). */
export const MAX_ITEMS = 6;

export function EvidenceView({ items, recorder, onPick, onBlur, onRetake, onRemove, notices, limitReached, estimate, onContinue, ...shell }: EvidenceViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const [removing, setRemoving] = useState<string | null>(null);
  const time = (seconds: number) =>
    seconds < 60 ? t("ui.time.seconds", { count: Math.max(1, Math.round(seconds)) }) : t("ui.time.minutes", { count: Math.round(seconds / 60) });
  return (
    <StepShell
      step={6}
      testId="o10"
      {...shell}
      actions={
        <Button block onClick={onContinue} disabled={recorder.elapsedMs !== null} data-testid="continue">
          {items.length ? t("common.continue") : t("o10.skip")}
        </Button>
      }
    >
      <div className={styles.evidenceTitle}>
        <h1 className={styles.title}>{t("o10.title")}</h1>
        <span className={styles.optionalChip}>{t("ui.optional")}</span>
      </div>
      <div className={styles.tight} aria-live="assertive">
        {notices.map((notice) => (
          <Banner key={notice.key} tone={notice.tone} title={t(notice.key, notice.vars)} data-testid={`o10-notice-${notice.key}`} />
        ))}
      </div>
      <MediaCapture onPick={onPick} recorder={recorder} disabled={limitReached} />
      <p className={styles.meta} aria-live="polite" data-testid="o10-count">
        {items.length ? t("o10.countOf", { count: items.length, max: MAX_ITEMS }) : ""}
      </p>
      {items.length ? (
        <ul className={styles.items} data-testid="o10-items">
          {items.map((item, index) => {
            const Icon = kindIcon[item.kind];
            const size = formatBytes(item.sizeBytes, locale);
            const seconds = estimate(item.sizeBytes);
            return (
              <li key={item.id} data-testid="o10-item">
                <div className={styles.item} role="group" aria-label={`${item.name}, ${index + 1} / ${items.length}`}>
                <span className={styles.thumb} data-processing={item.processing || undefined} aria-hidden="true">
                  {item.previewUrl && item.kind === "photo" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, never sent anywhere
                    <img src={item.previewUrl} alt="" />
                  ) : <Icon size={28} />}
                </span>
                <div className={styles.itemBody}>
                  <p className={styles.itemName}>{item.processing ? t("o10.processing", { name: item.name }) : item.name}</p>
                  {!item.processing ? (
                    <>
                      <p className={styles.meta}>{seconds === null ? t("o10.sizeOffline", { size }) : t("o10.size", { size, time: time(seconds) })}</p>
                      {item.kind !== "audio" ? (
                        <p className={styles.tag}>
                          <CheckIcon size={14} strokeWidth={2.5} />
                          {t("o10.locationRemoved")}
                        </p>
                      ) : null}
                      {item.kind !== "audio" ? (
                        <label className={styles.switch}>
                          <span id={`o10-blur-label-${item.id}`}>{t("o10.blur")}</span>
                          <Switch
                            checked={item.blur}
                            onToggle={() => onBlur(item.id, !item.blur)}
                            labelledBy={`o10-blur-label-${item.id}`}
                            aria-describedby="o10-blur-note"
                            data-testid="o10-blur"
                          />
                        </label>
                      ) : null}
                    </>
                  ) : null}
                </div>
                {!item.processing ? (
                <div className={styles.itemActions}>
                  <Button variant="quiet" icon={<RetryIcon />} onClick={() => onRetake(item.id)} data-testid="o10-retake">
                    {t("o10.retake")}
                  </Button>
                  <Button variant="quiet" icon={<TrashIcon />} onClick={() => setRemoving(item.id)} data-testid="o10-remove">
                    {t("o10.remove")}
                  </Button>
                </div>
                ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {items.some((item) => item.kind !== "audio") ? (
        <p className={styles.note} id="o10-blur-note" data-testid="o10-blur-note">
          <ShieldCheckIcon />
          <span>{t("o10.blurHint")}</span>
        </p>
      ) : null}
      <Sheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t("o10.removeConfirm")}
        footer={
          <>
            <Button
              variant="danger"
              block
              onClick={() => {
                if (removing) onRemove(removing);
                setRemoving(null);
              }}
              data-testid="o10-remove-confirm"
            >
              {t("o10.remove")}
            </Button>
            <Button variant="secondary" block onClick={() => setRemoving(null)}>
              {t("ui.cancel")}
            </Button>
          </>
        }
        data-testid="o10-remove-sheet"
      />
    </StepShell>
  );
}

/* ---------- O-11 Check and send ---------- */

export type CheckBlock = "what" | "danger" | "where" | "when" | "describe" | "source" | "evidence";

export type CheckStatus =
  | null
  | "sending"
  | "savedOffline"
  | "notConfirmed"
  | "intakePaused"
  | "queueFull"
  | "storageFull"
  | "server"
  | "needsAttention"
  | "withdrawn";

export type CheckViewProps = Common & {
  category: Category | null;
  access: AccessBarrierDetail[];
  danger: boolean | null;
  place: string | null;
  occurredAt: string | null;
  justNow: boolean;
  description: string;
  firsthand: boolean | null;
  media: Array<{ id: string; kind: "photo" | "video" | "audio"; previewUrl: string | null; name: string }>;
  errors: Partial<Record<CheckBlock, string>>;
  status: CheckStatus;
  onEdit: (block: CheckBlock) => void;
  onSend: () => void;
  onHome?: () => void;
};

export function CheckView({
  category,
  access,
  danger,
  place,
  occurredAt,
  justNow,
  description,
  firsthand,
  media,
  errors,
  status,
  onEdit,
  onSend,
  onHome,
  ...shell
}: CheckViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const [all, setAll] = useState(false);
  const meta = category ? categoryMeta(category) : null;
  const Pictogram = meta ? categoryPictograms[meta.pictogram] : null;
  const long = description.split("\n").length > 3 || description.length > 150;
  const busy = status === "sending" || status === "notConfirmed";
  const finished = status === "savedOffline" || status === "intakePaused" || status === "server" || status === "withdrawn";
  /* The outcome comes first: the title says what happened to the report, the card follows, the summary is secondary. */
  const outcome =
    status === "savedOffline" || status === "intakePaused" || status === "server"
      ? "saved"
      : status === "notConfirmed"
        ? "checking"
        : null;

  const block = (id: CheckBlock, label: string, value: ReactNode) => (
    <div className={styles.block} data-invalid={errors[id] ? "" : undefined} data-wide={id === "describe" || undefined} data-testid={`o11-${id}`}>
      <dt>
        {label}
        {errors[id] ? <span className={styles.needsChip}>{t("o11.checkThis")}</span> : null}
      </dt>
      <dd>
        {value}
        {errors[id] ? (
          <p className={styles.blockError}>
            <AlertIcon size={18} aria-hidden="true" />
            <span>{errors[id]}</span>
          </p>
        ) : null}
      </dd>
      {!busy && !finished && !outcome ? (
        <dd className={styles.change}>
          <Button variant="quiet" onClick={() => onEdit(id)} aria-label={`${t("common.edit")}: ${label}`} data-testid={`o11-edit-${id}`}>
            {t("common.edit")}
          </Button>
        </dd>
      ) : null}
    </div>
  );

  const statusLine: Record<Exclude<CheckStatus, null | "sending">, { tone: "wait" | "attn" | "danger"; text: string; badge?: "on-phone" | "not-confirmed" | "needs-attention" }> = {
    savedOffline: { tone: "wait", text: t("o11.savedOffline"), badge: "on-phone" },
    notConfirmed: { tone: "wait", text: t("o11.notConfirmed"), badge: "not-confirmed" },
    intakePaused: { tone: "attn", text: t("o11.intakePaused"), badge: "on-phone" },
    queueFull: { tone: "attn", text: t("o11.queueFull", { max: 20 }) },
    storageFull: { tone: "attn", text: t("common.error.storageFull") },
    server: { tone: "wait", text: t("o11.savedServer"), badge: "on-phone" },
    needsAttention: { tone: "attn", text: t("o11.needsAttention"), badge: "needs-attention" },
    withdrawn: { tone: "wait", text: t("o11.withdrawn") },
  };
  const line = status && status !== "sending" ? statusLine[status] : null;
  const statusArea = (
    <div aria-live="polite" data-testid="o11-status">
      {line ? (
        <Banner tone={line.tone} title={line.text} data-testid={`o11-status-${status}`}>
          {line.badge ? <StatusBadge status={line.badge} /> : null}
        </Banner>
      ) : null}
    </div>
  );

  return (
    <StepShell
      step={outcome ? 0 : 7}
      testId="o11"
      {...shell}
      actions={
        finished && onHome ? (
          <Button block onClick={onHome} data-testid="o11-home">
            {t("common.home")}
          </Button>
        ) : (
          <Button
            block
            onClick={onSend}
            loading={busy}
            loadingLabel={t("o11.sending")}
            disabled={status === "queueFull" || status === "storageFull"}
            data-testid="o11-send"
          >
            {shell.offline ? t("o11.sendOffline") : t("o11.send")}
          </Button>
        )
      }
    >
      {outcome ? (
        <>
          <h1 className={styles.title}>{t(outcome === "saved" ? "o11.savedTitle" : "o11.checkingTitle")}</h1>
          {statusArea}
          <h2 className={styles.sectionTitle}>{t("o11.summaryTitle")}</h2>
        </>
      ) : (
        <>
          <h1 className={styles.title}>{t("o11.title")}</h1>
          <p className={styles.lead}>{t("o11.hint")}</p>
          {shell.citizen ? (
            <p className={styles.note} data-testid="o11-citizen-note">
              <ShieldCheckIcon />
              <span>{t("o11.citizenNote")}</span>
            </p>
          ) : null}
          {statusArea}
        </>
      )}
      <dl className={styles.summary} data-secondary={outcome ? "" : undefined}>
        {block(
          "what",
          t("o11.what"),
          meta && Pictogram ? (
            <span className={styles.tight}>
              <span className={styles.valueRow}>
                <Pictogram size={32} aria-hidden="true" />
                <span>{t(`o05.tile.${meta.tile}`)}</span>
              </span>
              {category === "access_barrier" && access.length ? (
                <span className={styles.meta}>{access.map((value) => t(`o05.access.${ACCESS_DETAILS.find((d) => d.value === value)?.key}`)).join(", ")}</span>
              ) : null}
            </span>
          ) : null,
        )}
        {block(
          "danger",
          t("o11.danger"),
          danger === null ? null : danger ? (
            <span className={styles.valueRow}>
              <AlertIcon size={20} aria-hidden="true" />
              {t("o11.dangerYes")}
            </span>
          ) : (
            t("o11.dangerNo")
          ),
        )}
        {block(
          "where",
          t("o11.where"),
          place ? (
            <span className={styles.valueRow}>
              <PlaceIcon size={20} aria-hidden="true" />
              {place}
            </span>
          ) : null,
        )}
        {block(
          "when",
          t("o11.when"),
          <span className={`${styles.valueRow} eg-tnum`}>
            <ClockIcon size={20} aria-hidden="true" />
            {justNow ? `${t("o08.justNow")} · ` : ""}
            {occurredAt ? formatWatDateTime(occurredAt, locale) : null}
          </span>,
        )}
        {block(
          "describe",
          t("o11.description"),
          <span className={styles.tight}>
            <span className={all || !long ? styles.pre : styles.clamp} data-testid="o11-text">
              {description}
            </span>
            {long ? (
              <Button variant="quiet" className={styles.link} onClick={() => setAll(!all)} aria-expanded={all}>
                {all ? t("common.showLess") : t("common.showAll")}
              </Button>
            ) : null}
          </span>,
        )}
        {block("source", t("o11.source"), firsthand === null ? null : firsthand ? t("o09.sourceSelf") : t("o09.sourceTold"))}
        {block(
          "evidence",
          t("o11.evidence"),
          media.length ? (
            <span className={styles.tight}>
              <span>{t("o10.count", { count: media.length })}</span>
              <span className={styles.thumbs}>
                {media.map((item) => {
                  const Icon = kindIcon[item.kind];
                  return (
                    <span key={item.id} className={styles.thumb} title={item.name}>
                      {item.previewUrl && item.kind === "photo" ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, never sent anywhere
                        <img src={item.previewUrl} alt={item.name} />
                      ) : <Icon size={20} aria-label={item.name} />}
                    </span>
                  );
                })}
              </span>
            </span>
          ) : (
            t("o11.noEvidence")
          ),
        )}
      </dl>
    </StepShell>
  );
}
