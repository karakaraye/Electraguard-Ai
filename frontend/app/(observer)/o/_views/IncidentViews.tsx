"use client";

/* O-05 … O-11: the incident steps. Presentational: the flow container owns the draft and the outbox. */

import { useState, type ReactNode } from "react";
import type { AccessBarrierDetail, Category } from "../../../../lib/api/types";
import { EMERGENCY_NUMBER } from "../../../../lib/config";
import { useLocale, useT } from "../../../../lib/i18n/client";
import {
  AppShell,
  Banner,
  Button,
  ButtonLink,
  ChoiceTileGroup,
  DictationButton,
  MediaCapture,
  PollingUnitPicker,
  Sheet,
  StatusBadge,
  Stepper,
  TextArea,
  WhenPicker,
  YesNo,
  type CaptureSource,
  type DictationState,
  type PollingUnitPickerProps,
  type VoiceRecorder,
  type WhenValue,
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
  TrashIcon,
  VideoIcon,
} from "../../../../ui/icons";
import { AppBarTitle } from "../_components/AppBarTitle";
import styles from "../_components/observer.module.css";
import { ACCESS_DETAILS, CATEGORIES, categoryMeta } from "../_lib/categories";

export const TOTAL_STEPS = 7;

/* ---------- Shared step shell: Back, Menu (Delete this report), Stepper, pinned action ---------- */

export type StepShellProps = {
  step: number;
  onBack: () => void;
  /** Delete the draft (confirmed in a sheet). Omit to hide the menu. */
  onDiscard?: () => void;
  offline?: boolean;
  banner?: ReactNode;
  actions?: ReactNode;
  testId: string;
  children: ReactNode;
};

export function StepShell({ step, onBack, onDiscard, offline, banner, actions, testId, children }: StepShellProps) {
  const t = useT();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <AppShell
      title={<AppBarTitle />}
      onBack={onBack}
      onMenu={onDiscard ? () => setMenu(true) : undefined}
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
          <Sheet open={menu} onClose={() => setMenu(false)} title={t("ui.menu")} data-testid="step-menu">
            <Button
              variant="secondary"
              block
              icon={<TrashIcon />}
              onClick={() => {
                setMenu(false);
                setConfirm(true);
              }}
              data-testid="step-menu-discard"
            >
              {t("incident.discard")}
            </Button>
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
    </AppShell>
  );
}

type Common = { onBack: () => void; onDiscard?: () => void; offline?: boolean; banner?: ReactNode };

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
          <Button block onClick={onContinue} data-testid="o06-continue">
            {t("o06.emergency.continue")}
          </Button>
        </>
      }
    >
      <div className={styles.titleRow}>
        <AlertIcon size={28} aria-hidden="true" />
        <h1 className={styles.title}>{t("o06.emergency.title")}</h1>
      </div>
      <ol className={styles.steps}>
        <li>{t("o06.emergency.step1")}</li>
        <li>{t("o06.emergency.step2")}</li>
        <li>{t("o06.emergency.step3")}</li>
      </ol>
      <ButtonLink href={`tel:${EMERGENCY_NUMBER}`} variant="danger" block icon={<PhoneIcon />} className={styles.call} data-testid="o06-call">
        {t("o06.emergency.call")}
      </ButtonLink>
      <p className={styles.noDispatch} data-testid="o06-no-dispatch">
        {t("o06.emergency.noDispatch")}
      </p>
    </StepShell>
  );
}

/* ---------- O-07 Where? ---------- */

export type WhereViewProps = Common & {
  picker: Omit<PollingUnitPickerProps, "error">;
  summary: string | null;
  error: boolean;
  useToday?: { label: string; onUse: () => void } | null;
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
      {useToday ? (
        <Button variant="secondary" block icon={<PlaceIcon />} onClick={useToday.onUse} data-testid="o07-use-today">
          {t("o07.useToday", { unit: useToday.label })}
        </Button>
      ) : null}
      <PollingUnitPicker {...picker} error={error ? t("o07.error") : undefined} />
      <p className={styles.strong} aria-live="polite" data-testid="o07-summary">
        {summary ? t("o07.selected", { place: summary }) : ""}
      </p>
      <p className={styles.note}>
        <PlaceIcon />
        <span>{t("o07.noGps")}</span>
      </p>
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
};

export function WhenView({ value, onChange, showErrors, now, minDate, oldSheet, onConfirmOld, onChangeDate, onContinue, ...shell }: WhenViewProps) {
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
            data-testid="o09-text"
          />
          {text.length >= 1500 ? (
            <p className={styles.meta} aria-live="polite" data-testid="o09-count">
              {t("ui.charCount", { count: text.length, max: 2000 })}
            </p>
          ) : null}
          <DictationButton lang={dictationLang} onText={onDictated} state={dictationState} />
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
      <h1 className={styles.title}>{t("o10.title")}</h1>
      <p className={styles.lead}>{t("o10.hint")}</p>
      <div className={styles.tight} aria-live="assertive">
        {notices.map((notice) => (
          <Banner key={notice.key} tone={notice.tone} title={t(notice.key, notice.vars)} data-testid={`o10-notice-${notice.key}`} />
        ))}
      </div>
      <MediaCapture onPick={onPick} recorder={recorder} disabled={limitReached} />
      <p className={styles.meta} aria-live="polite" data-testid="o10-count">
        {t("o10.count", { count: items.length })}
      </p>
      {items.length ? (
        <ul className={styles.items} data-testid="o10-items">
          {items.map((item, index) => {
            const Icon = kindIcon[item.kind];
            const size = formatBytes(item.sizeBytes, locale);
            const seconds = estimate(item.sizeBytes);
            return (
              <li key={item.id} className={styles.item} role="group" aria-label={`${item.name}, ${index + 1} / ${items.length}`} data-testid="o10-item">
                <span className={styles.thumb} aria-hidden="true">
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
                          <CheckIcon size={16} strokeWidth={2.5} />
                          {t("o10.locationRemoved")}
                        </p>
                      ) : null}
                      {item.kind !== "audio" ? (
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            role="switch"
                            checked={item.blur}
                            onChange={(event) => onBlur(item.id, event.target.checked)}
                            data-testid="o10-blur"
                          />
                          <span>{t("o10.blur")}</span>
                          <span className={styles.switchHint}>{t("o10.blurHint")}</span>
                        </label>
                      ) : null}
                      <div className={styles.itemActions}>
                        <Button variant="secondary" icon={<RetryIcon />} onClick={() => onRetake(item.id)} data-testid="o10-retake">
                          {t("o10.retake")}
                        </Button>
                        <Button variant="quiet" icon={<TrashIcon />} onClick={() => setRemoving(item.id)} data-testid="o10-remove">
                          {t("o10.remove")}
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
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
  const long = description.split("\n").length > 6 || description.length > 360;
  const busy = status === "sending" || status === "notConfirmed";
  const finished = status === "savedOffline" || status === "intakePaused" || status === "server" || status === "withdrawn";

  const block = (id: CheckBlock, label: string, value: ReactNode) => (
    <div className={styles.block} data-invalid={errors[id] ? "" : undefined} data-testid={`o11-${id}`}>
      <dt>{label}</dt>
      <dd>
        {value}
        {errors[id] ? (
          <p className={styles.blockError}>
            <AlertIcon size={18} aria-hidden="true" />
            <span>{errors[id]}</span>
          </p>
        ) : null}
      </dd>
      {!busy && !finished ? (
        <Button variant="quiet" className={styles.change} onClick={() => onEdit(id)} aria-label={`${t("common.edit")}: ${label}`} data-testid={`o11-edit-${id}`}>
          {t("common.edit")}
        </Button>
      ) : null}
    </div>
  );

  const statusLine: Record<Exclude<CheckStatus, null | "sending">, { tone: "wait" | "attn" | "danger"; text: string; badge?: "on-phone" | "not-confirmed" | "needs-attention" }> = {
    savedOffline: { tone: "wait", text: t("o11.savedOffline"), badge: "on-phone" },
    notConfirmed: { tone: "wait", text: t("o11.notConfirmed"), badge: "not-confirmed" },
    intakePaused: { tone: "attn", text: t("o11.intakePaused"), badge: "on-phone" },
    queueFull: { tone: "attn", text: t("o11.queueFull", { max: 20 }) },
    storageFull: { tone: "attn", text: t("common.error.storageFull") },
    server: { tone: "wait", text: `${t("common.error.server")} ${t("o11.savedOffline")}`, badge: "on-phone" },
    needsAttention: { tone: "attn", text: t("o11.needsAttention"), badge: "needs-attention" },
    withdrawn: { tone: "wait", text: t("o11.withdrawn") },
  };
  const line = status && status !== "sending" ? statusLine[status] : null;

  return (
    <StepShell
      step={7}
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
            {t("o11.send")}
          </Button>
        )
      }
    >
      <h1 className={styles.title}>{t("o11.title")}</h1>
      <p className={styles.lead}>{t("o11.hint")}</p>
      <dl className={styles.summary}>
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
      <div aria-live="polite" data-testid="o11-status">
        {line ? (
          <Banner tone={line.tone} title={line.text} data-testid={`o11-status-${status}`}>
            {line.badge ? <StatusBadge status={line.badge} /> : null}
          </Banner>
        ) : null}
      </div>
    </StepShell>
  );
}
