"use client";

/*
 * O-16 Check the result sheet. Hard safeguards (plan 4.5): the not-a-result line
 * is pinned on every view and state; the phone never adds, compares or ranks
 * numbers; suggested values are marked until the observer touches them.
 */

import { useRef } from "react";
import { useT } from "../../../../lib/i18n/client";
import { AppShell, Banner, Button, Field, Sheet } from "../../../../ui";
import { CameraIcon, ImageIcon } from "../../../../ui/icons";
import styles from "../_components/observer.module.css";
import s from "../_components/screens.module.css";

export type SheetNotice = "reading" | "readFailed" | "offline" | "tooBig" | "wrongType" | "tooMany" | "unavailable" | null;
export type SheetStatus = null | "sending" | "notConfirmed" | "intakePaused" | "needsAttention" | "server";

export type ResultSheetViewProps = {
  offline: boolean;
  view: "photo" | "numbers";
  photoUrl: string | null;
  notice: SheetNotice;
  needUnit: boolean;
  unitLabel: string | null;
  onPhoto: (file: File) => void;
  onSkip: () => void;
  onContinue: () => void;
  /** Fields in sheet order: registered, accredited, votes.<label> …, rejected. */
  fields: Array<{ id: string; label: string }>;
  values: Record<string, string>;
  onValue: (id: string, value: string) => void;
  onTouch: (id: string) => void;
  /** Fields still showing an untouched suggestion, with its confidence. */
  suggested: Record<string, number>;
  errors: Record<string, string>;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  confirmError: boolean;
  status: SheetStatus;
  photoOpen: boolean;
  onOpenPhoto: () => void;
  onClosePhoto: () => void;
  onSend: () => void;
  onBack: () => void;
};

const STATUS: Record<Exclude<SheetStatus, null | "sending">, { tone: "wait" | "attn" | "danger"; key: string }> = {
  notConfirmed: { tone: "wait", key: "common.status.notConfirmedHint" },
  intakePaused: { tone: "attn", key: "common.error.intakePaused" },
  needsAttention: { tone: "attn", key: "common.status.needsAttentionHint" },
  server: { tone: "danger", key: "common.error.server" },
};

const NOTICE: Record<Exclude<SheetNotice, null | "reading">, string> = {
  readFailed: "o16.photo.readFailed",
  offline: "o16.photo.offline",
  tooBig: "o16.photo.tooBig",
  wrongType: "o10.wrongType",
  tooMany: "o16.photo.tooMany",
  unavailable: "o16.photo.unavailable",
};

export function ResultSheetView(props: ResultSheetViewProps) {
  const t = useT();
  const takeInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const status = props.status && props.status !== "sending" ? STATUS[props.status] : null;

  const pinned = (
    <div className={styles.tight}>
      <div role="note" id="o16-not-result">
        <Banner tone="info" title={t("o16.notResult")} data-testid="o16-not-result" />
      </div>
      {props.needUnit ? <Banner tone="attn" title={t("o15.needUnit")} data-testid="o16-need-unit" /> : null}
      {status ? <Banner tone={status.tone} title={t(status.key)} data-testid="o16-status" /> : null}
    </div>
  );

  const fileInputs = (
    <>
      <input
        ref={takeInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) props.onPhoto(file);
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) props.onPhoto(file);
        }}
      />
    </>
  );

  if (props.view === "photo") {
    return (
      <AppShell
        title={t("o16.title")}
        onBack={props.onBack}
        offline={props.offline}
        banner={pinned}
        actions={
          <Button block disabled={!props.photoUrl} onClick={props.onContinue} data-testid="o16-continue">
            {t("common.continue")}
          </Button>
        }
        data-testid="o16"
      >
        <div className={styles.screen}>
          <h1 className={styles.title}>{t("o16.title")}</h1>
          <p className={styles.lead}>{t("o16.rules")}</p>
          <section className={styles.stack} aria-labelledby="o16-photo-title">
            <h2 className={styles.sectionTitle} id="o16-photo-title">
              {t("o16.photo.title")}
            </h2>
            <p className={styles.note}>{t("o16.photo.tip")}</p>
            {props.photoUrl ? (
              <div className={s.scanWrap} data-scanning={props.notice === "reading" || undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={s.sheetPhoto} src={props.photoUrl} alt={t("o16.photo.alt")} data-testid="o16-preview" />
              </div>
            ) : (
              <div className={s.sheetFrame} data-testid="o16-frame">
                <span className={s.frameCorners} aria-hidden="true" />
                <ImageIcon size={36} aria-hidden="true" />
                <p>{t("o16.photo.frame")}</p>
              </div>
            )}
            <div className={styles.choices}>
              <Button variant={props.photoUrl ? "secondary" : "primary"} icon={<CameraIcon />} onClick={() => takeInput.current?.click()} data-testid="o16-take">
                {props.photoUrl ? t("o16.photo.retake") : t("o16.photo.take")}
              </Button>
              <Button variant="secondary" icon={<ImageIcon />} onClick={() => fileInput.current?.click()} data-testid="o16-file">
                {t("o16.photo.file")}
              </Button>
            </div>
            {props.notice === "reading" ? (
              <p className={styles.note} role="status" data-testid="o16-reading">
                {t("o16.photo.reading")}
              </p>
            ) : props.notice ? (
              <p className={styles.note} role="status">
                {t(NOTICE[props.notice])}
              </p>
            ) : null}
            <div>
              <Button variant="quiet" onClick={props.onSkip} data-testid="o16-skip">
                {t("o16.photo.skip")}
              </Button>
            </div>
          </section>
          {fileInputs}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("o16.title")}
      onBack={props.onBack}
      offline={props.offline}
      banner={pinned}
      actions={
        <Button block disabled={props.needUnit} loading={props.status === "sending"} loadingLabel={t("o16.sending")} onClick={props.onSend} aria-describedby="o16-not-result" data-testid="o16-send">
          {t("o16.send")}
        </Button>
      }
      data-testid="o16-numbers"
    >
      <div className={styles.screen}>
        <h1 className={styles.title}>{t("o16.numbers.title")}</h1>
        <p className={styles.lead}>{t("o16.numbers.hint")}</p>
        {props.unitLabel ? <p className={styles.meta}>{props.unitLabel}</p> : null}
        {props.notice && props.notice !== "reading" ? <p className={styles.note}>{t(NOTICE[props.notice])}</p> : null}
        {props.notice === "reading" ? (
          <p className={styles.note} role="status">
            {t("o16.photo.reading")}
          </p>
        ) : null}
        {Object.keys(props.suggested).length ? <p className={styles.note}>{t("o16.numbers.suggested")}</p> : null}
        {props.photoUrl ? (
          <button type="button" className={s.sheetThumb} onClick={props.onOpenPhoto} data-testid="o16-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={props.photoUrl} alt="" />
            <span>{t("o16.photo.view")}</span>
          </button>
        ) : null}
        {[
          { key: "voters", title: t("o16.numbers.groupVoters"), fields: props.fields.filter((field) => !field.id.startsWith("votes.")) },
          { key: "parties", title: t("o16.numbers.groupParties"), fields: props.fields.filter((field) => field.id.startsWith("votes.")) },
        ]
          .filter((group) => group.fields.length)
          .map((group) => (
            <section key={group.key} className={s.qCard} aria-labelledby={`o16-${group.key}`}>
              <h2 className={s.answerLegend} id={`o16-${group.key}`}>
                {group.title}
              </h2>
              <div className={s.numbers}>
                {group.fields.map((field) => {
                  const confidence = props.suggested[field.id];
                  const isSuggested = confidence !== undefined;
                  return (
                    <Field
                      key={field.id}
                      label={
                        <>
                          {field.label}
                          {isSuggested ? <span className={s.suggestedTag}>{t("ui.suggestion.label")}</span> : null}
                        </>
                      }
                      hint={isSuggested && confidence < 0.75 ? <span className={s.checkTag}>{t("o16.numbers.checkThis")}</span> : undefined}
                      value={props.values[field.id] ?? ""}
                      onChange={(event) => props.onValue(field.id, event.target.value)}
                      onFocus={() => props.onTouch(field.id)}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      numeric
                      maxLength={6}
                      error={props.errors[field.id]}
                      data-testid={`o16-field-${field.id}`}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        <label className={styles.check} data-testid="o16-confirm">
          <input type="checkbox" checked={props.confirmed} onChange={(event) => props.onConfirm(event.target.checked)} aria-invalid={props.confirmError || undefined} aria-describedby={props.confirmError ? "o16-confirm-error" : undefined} />
          <span>{t("o16.confirm")}</span>
        </label>
        {props.confirmError ? (
          <p className={styles.blockError} id="o16-confirm-error" role="alert">
            {t("o16.confirmError")}
          </p>
        ) : null}
        {fileInputs}
      </div>
      <Sheet open={props.photoOpen} onClose={props.onClosePhoto} title={t("o16.photo.title")}>
        {props.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={s.sheetPhoto} src={props.photoUrl} alt={t("o16.photo.alt")} />
        ) : null}
      </Sheet>
    </AppShell>
  );
}
