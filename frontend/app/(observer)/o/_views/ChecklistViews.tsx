"use client";

/* O-15 Polling-day checklist: the stage list and one stage's form. Views only. */

import Link from "next/link";
import type { ReactNode } from "react";
import type { MissingMaterial, QueueSize, YesNoNotSeen } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { AppShell, Banner, Button, Field, Sheet, StatusBadge, type ReportStatus } from "../../../../ui";
import { formatWatTime } from "../../../../ui/format";
import { CheckIcon, ChevronRightIcon, PlaceIcon } from "../../../../ui/icons";
import { MATERIALS, QUESTIONS, QUEUE_SIZES, type StageAnswers, type StageSlug } from "../_lib/checklist";
import styles from "../_components/observer.module.css";
import s from "../_components/screens.module.css";

/* ---------- Stage list ---------- */

export type StageState = "notStarted" | "draft" | "onPhone" | "needsAttention" | "received";

const STATE_BADGE: Record<Exclude<StageState, "notStarted">, ReportStatus> = {
  draft: "on-phone",
  onPhone: "on-phone",
  needsAttention: "needs-attention",
  received: "received",
};

export type ChecklistListViewProps = {
  offline: boolean;
  stages: Array<{ slug: StageSlug; state: StageState; receivedAt?: string | null; href: string }>;
  onBack: () => void;
};

export function ChecklistListView({ offline, stages, onBack }: ChecklistListViewProps) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <AppShell title={t("o15.title")} onBack={onBack} offline={offline} data-testid="o15">
      <div className={styles.screen}>
        <h1 className={styles.title}>{t("o15.title")}</h1>
        <p className={styles.lead}>{t("o15.hint")}</p>
        <ol className={s.stageList} aria-label={t("o15.title")}>
          {stages.map((stage) => (
            <li key={stage.slug}>
              <Link href={stage.href} className={s.stageRow} data-done={stage.state === "received" || undefined} data-testid={`o15-stage-${stage.slug}`}>
                <span className={s.stageMain}>
                  <span className={s.stageName}>{t(`o15.stage.${stage.slug}`)}</span>
                  {stage.state === "notStarted" ? (
                    <span className={styles.meta}>{t("o15.stageState.notStarted")}</span>
                  ) : (
                    <StatusBadge
                      status={STATE_BADGE[stage.state]}
                      label={
                        stage.state === "received" && stage.receivedAt
                          ? t("o15.received", { time: formatWatTime(stage.receivedAt, locale) })
                          : stage.state === "draft"
                            ? t("o15.stageState.draft")
                            : undefined
                      }
                    />
                  )}
                </span>
                <ChevronRightIcon aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </AppShell>
  );
}

/* ---------- Stage form ---------- */

export type StageStatus = null | "sending" | "savedOffline" | "notConfirmed" | "intakePaused" | "needsAttention" | "server";

export type StageFormViewProps = {
  offline: boolean;
  stage: StageSlug;
  answers: StageAnswers;
  onAnswer: (question: string, value: YesNoNotSeen | QueueSize) => void;
  onMaterials: (materials: MissingMaterial[]) => void;
  /** Arrival: the polling-unit picker (O-07 behaviour), rendered by the container. */
  picker?: ReactNode;
  unitLabel: string | null;
  /** Not Arrival and no unit yet: send is blocked (O-15 "Need unit"). */
  needUnit: boolean;
  arrivalTime: string;
  onArrivalTime: (value: string) => void;
  timeError: string | null;
  /** Server field errors by question id. */
  errors: Record<string, string>;
  status: StageStatus;
  unanswered: number | null;
  onSend: () => void;
  onSendAnyway: () => void;
  onGoBack: () => void;
  onReportThis: (question: string) => void;
  onCheckSheet: () => void;
  onBack: () => void;
};

const STATUS_BANNER: Record<Exclude<StageStatus, null | "sending">, { tone: "wait" | "attn" | "danger"; key: string }> = {
  savedOffline: { tone: "wait", key: "o15.savedOffline" },
  notConfirmed: { tone: "wait", key: "common.status.notConfirmedHint" },
  intakePaused: { tone: "attn", key: "common.error.intakePaused" },
  needsAttention: { tone: "attn", key: "common.status.needsAttentionHint" },
  server: { tone: "danger", key: "common.error.server" },
};

export function StageFormView(props: StageFormViewProps) {
  const t = useT();
  const { stage, answers, errors } = props;
  const questions = QUESTIONS[stage];
  const banner = props.status && props.status !== "sending" ? STATUS_BANNER[props.status] : null;

  return (
    <AppShell
      title={t("o15.title")}
      onBack={props.onBack}
      offline={props.offline}
      banner={
        props.needUnit || banner ? (
          <div className={styles.tight}>
            {props.needUnit ? (
              <Banner
                tone="attn"
                title={t("o15.needUnit")}
                action={
                  <Link href="/o/checklist/arrival" className={s.textLink} data-testid="o15-to-arrival">
                    {t("o15.stage.arrival")}
                  </Link>
                }
                data-testid="o15-need-unit"
              />
            ) : null}
            {banner ? <Banner tone={banner.tone} title={t(banner.key)} data-testid="o15-status" /> : null}
          </div>
        ) : undefined
      }
      actions={
        <Button block disabled={props.needUnit} loading={props.status === "sending"} loadingLabel={t("o15.sending")} onClick={props.onSend} data-testid="o15-send">
          {t("o15.send")}
        </Button>
      }
      data-testid="o15-form"
    >
      <div className={styles.screen}>
        <h1 className={styles.title}>{t(`o15.stage.${stage}`)}</h1>
        {stage === "arrival" ? (
          <section className={styles.stack} aria-labelledby="o15-unit">
            <h2 className={s.answerLegend} id="o15-unit">
              {t("o15.q.arrivalUnit")}
            </h2>
            {props.picker}
          </section>
        ) : props.unitLabel ? (
          <p className={`${styles.meta} ${styles.valueRow}`} data-testid="o15-unit">
            <PlaceIcon size={18} aria-hidden="true" />
            {props.unitLabel}
          </p>
        ) : null}

        <div className={s.questions}>
          {questions.map((question) => {
            if (question.type === "time") {
              return (
                <Field
                  key={question.id}
                  label={t(question.key)}
                  hint={t("common.wat")}
                  type="time"
                  value={props.arrivalTime}
                  onChange={(event) => props.onArrivalTime(event.target.value)}
                  error={props.timeError ?? errors[question.id]}
                  data-testid="o15-arrival-time"
                />
              );
            }
            if (question.type === "queue") {
              const value = answers.queue_size ?? null;
              return (
                <div key={question.id} className={styles.stack}>
                  <AnswerGroup
                    name={question.id}
                    legend={t(question.key)}
                    options={QUEUE_SIZES.map((size) => ({ value: size.value, label: t(size.key) }))}
                    value={value}
                    onChange={(next) => props.onAnswer(question.id, next as QueueSize)}
                    error={errors[question.id]}
                    two
                  />
                  {value === "over_200" ? <ReportThis question={t(question.key)} onClick={() => props.onReportThis(question.id)} /> : null}
                </div>
              );
            }
            const value = answers[question.id] ?? null;
            const problem = value !== null && value !== "not_seen" && value === question.problem;
            return (
              <div key={question.id} className={styles.stack}>
                <AnswerGroup
                  name={question.id}
                  legend={t(question.key)}
                  options={[
                    { value: "yes", label: t("ui.yes") },
                    { value: "no", label: t("ui.no") },
                    { value: "not_seen", label: t("o15.answer.notSeen") },
                  ]}
                  value={value}
                  onChange={(next) => props.onAnswer(question.id, next as YesNoNotSeen)}
                  error={errors[question.id]}
                />
                {question.id === "materials_all_present" && value === "no" ? (
                  <fieldset className={styles.checks} data-testid="o15-materials">
                    <legend className={styles.checksLegend}>{t("o15.q.materialsList")}</legend>
                    <div className={styles.checksList}>
                      {MATERIALS.map((material) => {
                        const checked = answers.materials_missing?.includes(material.value) ?? false;
                        return (
                          <label key={material.value} className={styles.check}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const list = answers.materials_missing ?? [];
                                props.onMaterials(checked ? list.filter((m) => m !== material.value) : [...list, material.value]);
                              }}
                            />
                            <span>{t(material.key)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : null}
                {problem ? <ReportThis question={t(question.key)} onClick={() => props.onReportThis(question.id)} /> : null}
                {question.id === "sheet_posted" && value === "yes" ? (
                  <div>
                    <Button variant="secondary" icon={<ChevronRightIcon />} onClick={props.onCheckSheet} data-testid="o15-check-sheet">
                      {t("o15.checkSheet")}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <Sheet
        open={props.unanswered !== null}
        onClose={props.onGoBack}
        title={t("o15.unanswered", { count: props.unanswered ?? 0 })}
        footer={
          <>
            <Button block onClick={props.onSendAnyway} data-testid="o15-send-anyway">
              {t("o15.sendAnyway")}
            </Button>
            <Button variant="secondary" block onClick={props.onGoBack} data-testid="o15-go-back">
              {t("o15.goBack")}
            </Button>
          </>
        }
        data-testid="o15-unanswered"
      >
        <p className={styles.note}>{t("o15.unansweredHint")}</p>
      </Sheet>
    </AppShell>
  );
}

function ReportThis({ question, onClick }: { question: string; onClick: () => void }) {
  const t = useT();
  return (
    <div className={s.followUp}>
      <Button variant="secondary" onClick={onClick} aria-label={`${t("o15.reportThis")}: ${question}`} data-testid="o15-report-this">
        {t("o15.reportThis")}
      </Button>
      <p className={styles.note}>{t("o15.reportThisHint")}</p>
    </div>
  );
}

/** Three (or four) large answers as one native radio group, labelled by the question. */
function AnswerGroup({
  name,
  legend,
  options,
  value,
  onChange,
  error,
  two,
}: {
  name: string;
  legend: string;
  options: Array<{ value: string; label: string }>;
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
  two?: boolean;
}) {
  const t = useT();
  const errorId = `${name}-error`;
  return (
    <fieldset className={s.answerGroup} aria-describedby={error ? errorId : undefined} data-testid={`o15-q-${name}`}>
      <legend className={s.answerLegend}>{legend}</legend>
      <div className={`${s.answers} ${two ? s.answersTwo : ""}`}>
        {options.map((option) => (
          <label key={option.value} className={s.answer}>
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
            <span className={s.answerTick} aria-hidden="true">
              <CheckIcon size={12} strokeWidth={3} />
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p className={styles.blockError} id={errorId}>
          <span className="eg-sr-only">{t("ui.errorPrefix")} </span>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
