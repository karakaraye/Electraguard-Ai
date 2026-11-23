"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, isoWithOffset } from "../../../../lib/api/client";
import type { ChecklistAnswer, ChecklistQuestionId, Language, ReportListResponse } from "../../../../lib/api/types";
import { loadDraft, newDraft, saveDraft } from "../../../../lib/drafts";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { PollingUnitPicker } from "../../../../ui";
import { incidentCategoryFor, isStage, QUESTIONS, STAGES, updateDay, useChecklistDay, watDay, type StageAnswers, type StageSlug } from "../_lib/checklist";
import { useFocusTitle, useNetwork } from "../_lib/network";
import { useReference } from "../_lib/reference";
import { correctedNow } from "../_lib/session";
import { enqueue, onPendingDone, retryPending, usePending, type PendingItem } from "../_lib/pending";
import { useLoad } from "../_lib/useLoad";
import { useSignedIn } from "../_lib/useSignedIn";
import { ChecklistListView, StageFormView, type StageState, type StageStatus } from "../_views/ChecklistViews";

/** "HH:MM" in West Africa Time. */
function watTime(at: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at));
}

/** Today's date and an "HH:MM" WAT time → ISO with the +01:00 offset. */
function watIso(day: string, time: string): string {
  return `${day}T${time}:00+01:00`;
}

/* ---------- Stage list ---------- */

export function ChecklistListScreen() {
  const router = useRouter();
  const { session } = useSignedIn();
  const { offline } = useNetwork();
  const pending = usePending();
  const day = watDay(correctedNow());
  const record = useChecklistDay(session?.code ?? null, day);
  useFocusTitle("o15");

  // "Received" for a stage also comes from the server: REP-02 kind=checklist rows observed today (WAT).
  const list = useLoad<ReportListResponse>(() => api("REP-02", { query: { kind: "checklist", limit: 100 } }), session?.code ?? "", {
    enabled: Boolean(session),
    offline,
  });

  const stages = useMemo(
    () =>
      STAGES.map(({ slug, wire }) => {
        const local = record.stages[slug];
        const server = list.data?.items.find((item) => item.checklist_stage === wire && item.occurred_at && watDay(Date.parse(item.occurred_at)) === day && item.status !== "withdrawn");
        const queued = pending.find((item) => item.kind === "checklist" && item.owner === session?.code && item.stage === slug && item.day === day);
        let state: StageState = "notStarted";
        if (local?.state === "received" || server) state = "received";
        else if (queued) state = queued.state === "needs_attention" ? "needsAttention" : "onPhone";
        else if (local && Object.keys(local.answers).length) state = "draft";
        const reportId = local?.report_id ?? server?.id;
        return {
          slug,
          state,
          receivedAt: local?.received_at ?? server?.received_at ?? null,
          href: state === "received" && reportId ? `/o/reports/${reportId}` : `/o/checklist/${slug}`,
        };
      }),
    [record, list.data, pending, session?.code, day],
  );

  if (!session) return null;
  return <ChecklistListView offline={offline} stages={stages} onBack={() => router.push("/o")} />;
}

/* ---------- Stage form ---------- */

export function StageScreen({ slug: fixed }: { slug?: StageSlug }) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const params = useParams<{ stage?: string }>();
  const slug = (fixed ?? (params.stage && isStage(params.stage) ? params.stage : null)) as StageSlug | null;
  const { session } = useSignedIn();
  const { offline } = useNetwork();
  const pending = usePending();
  const day = watDay(correctedNow());
  const code = session?.code ?? null;
  const record = useChecklistDay(code, day);
  const stageRecord = slug ? record.stages[slug] : undefined;
  const answers: StageAnswers = stageRecord?.answers ?? {};
  const [arrivalTime, setArrivalTime] = useState(() => watTime(correctedNow()));
  const [timeError, setTimeError] = useState<string | null>(null);
  const [unitError, setUnitError] = useState(false);
  const [unanswered, setUnanswered] = useState<number | null>(null);
  const [status, setStatus] = useState<StageStatus>(null);
  const [sentKey, setSentKey] = useState<string | null>(null);
  const [place, setPlace] = useState(() => ({
    state_code: record.unit?.state_code ?? null,
    lga_code: record.unit?.lga_code ?? null,
    ward_code: record.unit?.ward_code ?? null,
    polling_unit_code: record.unit?.code ?? null,
    unknown_unit: false,
  }));
  const reference = useReference(slug === "arrival" ? place.state_code : null);
  useFocusTitle(`o15:${slug}`);

  useEffect(() => {
    if (!slug) router.replace("/o/checklist");
  }, [slug, router]);

  // A stage already received opens its report: answers are not kept on the phone after receipt (R8).
  useEffect(() => {
    if (stageRecord?.state === "received" && stageRecord.report_id && !sentKey) router.replace(`/o/reports/${stageRecord.report_id}`);
  }, [stageRecord, sentKey, router]);

  const queued = pending.find((item): item is Extract<PendingItem, { kind: "checklist" }> => item.kind === "checklist" && item.owner === code && item.stage === slug && item.day === day);

  // The server confirmed this stage: back to the list, which now shows it received.
  useEffect(
    () =>
      onPendingDone((done) => {
        if (done.kind === "report" && done.key === sentKey) router.replace("/o/checklist");
      }),
    [sentKey, router],
  );

  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!queued || queued.state !== "needs_attention" || !queued.fields) return out;
    for (const [path, error] of Object.entries(queued.fields)) {
      const match = /^answers\.(\d+)\./.exec(path);
      const question = match ? queued.body.answers[Number(match[1])]?.question : null;
      if (question) out[question] = t(error.code === "in_future" ? "o08.future" : "o15.answerInvalid");
    }
    return out;
  }, [queued, t]);

  if (!session || !slug || !code) return null;

  const shownStatus: StageStatus = queued
    ? queued.state === "needs_attention"
      ? "needsAttention"
      : queued.wait === "intake_paused"
        ? "intakePaused"
        : queued.state === "unconfirmed"
          ? queued.wait === "server"
            ? "server"
            : "notConfirmed"
          : offline || queued.wait === "network"
            ? "savedOffline"
            : "sending"
    : status;

  const setAnswers = (change: (current: StageAnswers) => StageAnswers) =>
    updateDay(code, day, (current) => {
      const existing = current.stages[slug];
      return { ...current, stages: { ...current.stages, [slug]: { ...(existing ?? { state: "draft" }), state: existing?.state === "received" ? "received" : "draft", answers: change(existing?.answers ?? {}) } } };
    });

  const unit = record.unit;
  const needUnit = slug !== "arrival" && !unit;

  function buildAnswers(): ChecklistAnswer[] {
    const list: ChecklistAnswer[] = [];
    for (const question of QUESTIONS[slug!]) {
      if (question.type === "time") list.push({ question: "arrival_time", answer: watIso(day, arrivalTime) });
      else if (question.type === "queue") {
        if (answers.queue_size) list.push({ question: "queue_size", answer: answers.queue_size });
      } else {
        const value = answers[question.id];
        if (value) list.push({ question: question.id, answer: value });
        if (question.id === "materials_all_present" && value === "no" && answers.materials_missing?.length) list.push({ question: "materials_missing", answer: answers.materials_missing });
      }
    }
    return list;
  }

  function send(force: boolean) {
    if (!slug || !code) return;
    if (slug === "arrival") {
      if (!place.polling_unit_code) {
        setUnitError(true);
        document.querySelector<HTMLElement>('[data-testid="polling-unit-picker-search"] input')?.focus();
        return;
      }
      if (!/^\d{2}:\d{2}$/.test(arrivalTime) || Date.parse(watIso(day, arrivalTime)) > correctedNow() + 60_000) {
        setTimeError(t(arrivalTime ? "o08.future" : "ui.when.required"));
        return;
      }
    }
    if (needUnit) return;
    const blanks = QUESTIONS[slug].filter((q) => q.type !== "time" && !(q.type === "queue" ? answers.queue_size : answers[q.id])).length;
    if (blanks && !force) {
      setUnanswered(blanks);
      return;
    }
    setUnanswered(null);
    if (queued?.state === "needs_attention") {
      retryPending(queued.key);
      setSentKey(queued.key);
      return;
    }
    const pu = slug === "arrival" ? place.polling_unit_code! : unit!.code;
    const item = enqueue({
      owner: code,
      kind: "checklist",
      stage: slug,
      day,
      body: {
        kind: "checklist",
        language: locale as Language,
        occurred_at: slug === "arrival" ? watIso(day, arrivalTime) : isoWithOffset(new Date(correctedNow())),
        place: { polling_unit_code: pu },
        device_saved_at: isoWithOffset(),
        stage: STAGES.find((stage) => stage.slug === slug)!.wire,
        answers: buildAnswers(),
      },
    });
    updateDay(code, day, (current) => ({ ...current, stages: { ...current.stages, [slug]: { answers, state: "queued" } } }));
    setSentKey(item.key);
    setStatus(offline ? "savedOffline" : "sending");
  }

  async function reportThis(question: string) {
    if (!code) return;
    const existing = await loadDraft(code);
    if (existing) {
      // One open incident draft (Q7): nothing is discarded; the draft opens where it was left.
      try {
        window.sessionStorage.setItem("eg.draftExists", "1");
      } catch {
        // ignore
      }
      router.push(`/o/new/${existing.last_step}`);
      return;
    }
    const draft = newDraft(code, "observer", locale as Language);
    const stageReport = slug ? record.stages[slug]?.report_id : undefined;
    await saveDraft({
      ...draft,
      category_observer: incidentCategoryFor(question),
      place: unit
        ? { polling_unit_code: unit.code, ward_code: unit.ward_code, state_code: unit.state_code, lga_code: unit.lga_code, label: unit.label, ward_name: unit.ward_name }
        : draft.place,
      when: { mode: "now" },
      from_checklist_question: question as ChecklistQuestionId,
      related_report_id: stageReport ?? null,
      last_step: "danger",
    });
    router.push("/o/new/danger");
  }

  return (
    <StageFormView
      offline={offline}
      stage={slug}
      answers={answers}
      onAnswer={(question, value) => setAnswers((current) => ({ ...current, [question]: value }))}
      onMaterials={(materials) => setAnswers((current) => ({ ...current, materials_missing: materials }))}
      picker={
        slug === "arrival" ? (
          <PollingUnitPicker
            states={reference.states}
            areas={reference.areas}
            status={reference.status}
            value={place}
            onRetry={reference.retry}
            error={unitError ? t("o15.unitRequired") : undefined}
            selected={unit && unit.code === place.polling_unit_code ? t("o07.selected", { place: unit.label }) : ""}
            onChange={(next) => {
              setUnitError(false);
              setPlace({ ...next, unknown_unit: false });
              // An observer must be at a unit: a ward alone is not kept as the checklist place.
              if (next.polling_unit_code && !next.unknown_unit) {
                updateDay(code, day, (current) => ({
                  ...current,
                  unit: { code: next.polling_unit_code!, label: next.label ?? next.polling_unit_code!, state_code: next.state_code, lga_code: next.lga_code, ward_code: next.ward_code, ward_name: next.ward_name },
                }));
              } else if (next.unknown_unit) {
                setUnitError(true);
              }
            }}
          />
        ) : undefined
      }
      unitLabel={unit?.label ?? null}
      needUnit={needUnit}
      arrivalTime={arrivalTime}
      onArrivalTime={(value) => {
        setArrivalTime(value);
        setTimeError(null);
      }}
      timeError={timeError}
      errors={errors}
      status={shownStatus}
      unanswered={unanswered}
      onSend={() => send(false)}
      onSendAnyway={() => send(true)}
      onGoBack={() => {
        setUnanswered(null);
        // Focus the first question without an answer.
        window.requestAnimationFrame(() => {
          const groups = Array.from(document.querySelectorAll<HTMLElement>('fieldset[data-testid^="o15-q-"]'));
          groups.find((group) => !group.querySelector("input:checked"))?.querySelector<HTMLElement>("input")?.focus();
        });
      }}
      onReportThis={(question) => void reportThis(question)}
      onCheckSheet={() => router.push("/o/checklist/results/sheet")}
      onBack={() => router.push("/o/checklist")}
    />
  );
}
