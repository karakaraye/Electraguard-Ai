"use client";

/**
 * O-05 … O-11 container. One component for all seven steps: steps change with
 * history.pushState (no network round trip, works offline), the hardware Back
 * button walks the steps, and every value lives in the IndexedDB draft.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isoWithOffset } from "../../../../../lib/api/client";
import { STEPS, useDraft, type DraftHandle, type IncidentDraft, type StepId } from "../../../../../lib/drafts";
import { useLocale, useT } from "../../../../../lib/i18n/client";
import { localeTags } from "../../../../../lib/i18n/config";
import {
  enqueueDraft,
  kick,
  QueueFullError,
  returnToDraft,
  StorageFullError,
  useReportState,
  type OutboxItem,
} from "../../../../../lib/outbox";
import { whenToInstant, whenProblem, type WhenValue } from "../../../../../ui";
import { fromWat, watParts } from "../../../../../ui/hooks";
import { useFocusTitle, useNetwork } from "../../_lib/network";
import { looksLikeName, textHash } from "../../_lib/name-check";
import { itemToDraft } from "../../_lib/rebuild";
import { useReference } from "../../_lib/reference";
import { correctedNow, useObserverSession } from "../../_lib/session";
import {
  CategoryView,
  CheckView,
  DangerView,
  EmergencyView,
  WhenView,
  WhereView,
  type CheckBlock,
  type CheckStatus,
  type DescribeError,
  DescribeView,
} from "../../_views/IncidentViews";
import { EvidenceStep, useMediaPreviews } from "./EvidenceStep";

const DAY_MS = 24 * 60 * 60 * 1000;
const SPEECH_LANG: Record<string, string> = { en: "en-NG", pcm: "en-NG", ha: "ha-NG", yo: "yo-NG", ig: "ig-NG" };

type Nav = {
  step: StepId;
  citizen: boolean;
  edit: boolean;
  help: boolean;
  url: (step: StepId, extra?: string) => string;
  goTo: (next: StepId) => void;
  done: () => void;
  back: () => void;
  leave: (keptBanner?: boolean) => void;
};

function readStep(pathname: string): StepId {
  const last = pathname.split("/").pop() as StepId;
  return STEPS.includes(last) ? last : "what";
}

function useNav(handle: DraftHandle): Nav {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const citizen = params.get("as") === "citizen";
  const edit = params.get("edit") === "1";
  const help = params.has("help");
  const step = readStep(pathname);

  const url = useCallback(
    (target: StepId, extra?: string) => {
      const query = [citizen ? "as=citizen" : "", extra ?? ""].filter(Boolean).join("&");
      return `/o/new/${target}${query ? `?${query}` : ""}`;
    },
    [citizen],
  );

  const goTo = useCallback(
    (next: StepId) => {
      window.history.pushState({ egBackTo: step }, "", url(next));
    },
    [step, url],
  );

  const toPrevious = useCallback(
    (target: StepId) => {
      if (window.history.state?.egBackTo === target) window.history.back();
      else window.history.replaceState(null, "", url(target));
    },
    [url],
  );

  const leave = useCallback(
    (keptBanner = true) => {
      void handle.flush().then(() => {
        if (keptBanner && handle.draft) {
          try {
            window.sessionStorage.setItem("eg.draftKept", "1");
          } catch {
            // ignore
          }
        }
        router.push(citizen ? "/o/start?view=choose" : "/o");
      });
    },
    [handle, router, citizen],
  );

  /** Continue: the next step, or back to Check and send in edit-return mode. */
  const done = useCallback(() => {
    if (edit) {
      toPrevious("check");
      return;
    }
    const next = STEPS[STEPS.indexOf(step) + 1];
    if (next) goTo(next);
  }, [edit, step, goTo, toPrevious]);

  const back = useCallback(() => {
    if (help) {
      toPrevious("danger");
      return;
    }
    if (edit) {
      toPrevious("check");
      return;
    }
    const index = STEPS.indexOf(step);
    if (index <= 0) leave(true);
    else toPrevious(STEPS[index - 1]);
  }, [help, edit, step, toPrevious, leave]);

  return { step, citizen, edit, help, url, goTo, done, back, leave };
}

function focusFirst(selector: string) {
  window.requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
}

export function IncidentFlow() {
  const router = useRouter();
  const { session, ready } = useObserverSession();
  const { locale } = useLocale();
  const params = useSearchParams();
  const citizen = params.get("as") === "citizen";
  const owner = citizen ? "citizen" : (session?.code ?? null);
  const handle = useDraft(owner, citizen ? "citizen" : "observer", locale);
  const nav = useNav(handle);
  const { offline } = useNetwork();
  const { draft } = handle;
  const [sentId, setSentId] = useState<string | null>(null);

  useEffect(() => {
    if (!citizen && ready && !session) router.replace("/o/start");
  }, [citizen, ready, session, router]);

  // Without a draft only the first step makes sense (R2: the draft starts at O-05).
  useEffect(() => {
    if (handle.ready && !draft && !sentId && nav.step !== "what") window.history.replaceState(null, "", nav.url("what"));
  }, [handle.ready, draft, sentId, nav]);

  // Remember the step, so "Continue your report" reopens it.
  useEffect(() => {
    if (draft && nav.step !== draft.last_step && !nav.edit && !nav.help) handle.update({ last_step: nav.step });
  }, [nav.step, nav.edit, nav.help, draft, handle]);

  useFocusTitle(`${nav.step}:${nav.help}:${draft?.id ?? (sentId ? "sent" : "none")}`);

  if (!handle.ready && !sentId) return null;

  const shell = {
    onBack: nav.back,
    onDiscard: draft
      ? () =>
          void handle.discard().then(() => {
            router.push(citizen ? "/o/start?view=choose" : "/o");
          })
      : undefined,
    offline,
  };

  switch (nav.step) {
    case "what":
      return <WhatStep handle={handle} nav={nav} shell={shell} />;
    case "danger":
      return <DangerStep handle={handle} nav={nav} shell={shell} />;
    case "where":
      return <WhereStep handle={handle} nav={nav} shell={shell} />;
    case "when":
      return <WhenStep handle={handle} nav={nav} shell={shell} />;
    case "describe":
      return <DescribeStep handle={handle} nav={nav} shell={shell} locale={locale} />;
    case "evidence":
      return <EvidenceStep handle={handle} nav={nav} shell={shell} offline={offline} />;
    case "check":
      return <CheckStep handle={handle} nav={nav} shell={shell} sentId={sentId} setSentId={setSentId} offline={offline} />;
  }
}

type StepProps = { handle: DraftHandle; nav: Nav; shell: { onBack: () => void; onDiscard?: () => void; offline: boolean } };

/* ---------- O-05 ---------- */

function WhatStep({ handle, nav, shell }: StepProps) {
  const [error, setError] = useState(false);
  const draft = handle.draft;
  return (
    <CategoryView
      {...shell}
      value={draft?.category_observer ?? null}
      access={draft?.access_barrier_details ?? []}
      error={error}
      onChange={(value) => {
        setError(false);
        handle.update((current) => ({
          category_observer: value,
          access_barrier_details: value === "access_barrier" ? current.access_barrier_details : [],
        }));
      }}
      onAccess={(value) => handle.update({ access_barrier_details: value })}
      onContinue={() => {
        if (!draft?.category_observer) {
          setError(true);
          focusFirst('input[name="category"]');
          return;
        }
        nav.done();
      }}
    />
  );
}

/* ---------- O-06 ---------- */

function DangerStep({ handle, nav, shell }: StepProps) {
  const draft = handle.draft;
  if (nav.help) {
    return (
      <EmergencyView
        {...shell}
        onContinue={() => {
          if (nav.edit) nav.done();
          else window.history.replaceState({ egBackTo: "danger" }, "", nav.url("where"));
        }}
        onLater={() => {
          handle.update({ last_step: "where" });
          nav.leave(true);
        }}
      />
    );
  }
  return (
    <DangerView
      {...shell}
      value={draft?.danger_now ?? null}
      onAnswer={(value) => {
        handle.update({ danger_now: value });
        if (value) window.history.pushState({ egBackTo: "danger" }, "", nav.url("danger", nav.edit ? "edit=1&help=1" : "help=1"));
        else nav.done();
      }}
    />
  );
}

/* ---------- O-07 ---------- */

function WhereStep({ handle, nav, shell }: StepProps) {
  const draft = handle.draft;
  const place = draft?.place;
  const [error, setError] = useState(false);
  const reference = useReference(place?.state_code ?? null);
  const value = {
    state_code: place?.state_code ?? null,
    lga_code: place?.lga_code ?? null,
    ward_code: place?.ward_code ?? null,
    polling_unit_code: place?.polling_unit_code ?? null,
    unknown_unit: Boolean(place?.unknown_unit),
  };
  const complete = Boolean(value.polling_unit_code || (value.ward_code && value.unknown_unit));
  return (
    <WhereView
      {...shell}
      picker={{
        states: reference.states,
        areas: reference.areas,
        status: reference.status,
        value,
        onRetry: reference.retry,
        onChange: (next) => {
          setError(false);
          handle.update({
            place: {
              state_code: next.state_code,
              lga_code: next.lga_code,
              ward_code: next.ward_code,
              polling_unit_code: next.polling_unit_code,
              unknown_unit: next.unknown_unit,
              label: next.label,
              ward_name: next.ward_name,
            },
          });
        },
      }}
      summary={complete ? (place?.label ?? null) : null}
      error={error}
      useToday={null}
      onContinue={() => {
        if (!complete) {
          setError(true);
          focusFirst('[data-testid="polling-unit-picker-search"] input');
          return;
        }
        nav.done();
      }}
    />
  );
}

/* ---------- O-08 ---------- */

function WhenStep({ handle, nav, shell }: StepProps) {
  const draft = handle.draft;
  const value: WhenValue = draft?.when ?? { mode: "now" };
  const [showErrors, setShowErrors] = useState(false);
  const [oldSheet, setOldSheet] = useState(false);
  const [now] = useState(() => correctedNow());
  const minDate = watParts(now - 30 * DAY_MS).date;

  function commit() {
    const at = whenToInstant(value, correctedNow());
    const occurred = value.mode === "now" ? isoWithOffset(new Date(correctedNow())) : value.date && value.time ? `${value.mode === "today" ? watParts(correctedNow()).date : value.date}T${value.time}:00+01:00` : null;
    if (at === null || !occurred) return;
    handle.update({ occurred_at: occurred });
    nav.done();
  }

  return (
    <WhenView
      {...shell}
      value={value}
      onChange={(next) => handle.update({ when: next })}
      showErrors={showErrors}
      now={now}
      minDate={minDate}
      oldSheet={oldSheet}
      onConfirmOld={() => {
        setOldSheet(false);
        commit();
      }}
      onChangeDate={() => {
        setOldSheet(false);
        focusFirst('[data-testid="o08-when-date"]');
      }}
      onContinue={() => {
        const current = correctedNow();
        const problem = whenProblem(value, current + 4 * 60_000, true);
        if (problem) {
          setShowErrors(true);
          focusFirst('[data-testid="o08-when"] [aria-invalid="true"]');
          return;
        }
        if (value.mode === "day" && value.date && current - fromWat(value.date, value.time || "12:00") > 7 * DAY_MS) {
          setOldSheet(true);
          return;
        }
        commit();
      }}
    />
  );
}

/* ---------- O-09 ---------- */

function cleanText(text: string) {
  // Only newline is allowed among control characters (contract 1.1).
  return text.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "");
}

function DescribeStep({ handle, nav, shell, locale }: StepProps & { locale: string }) {
  const draft = handle.draft;
  const text = draft?.description ?? "";
  const [textError, setTextError] = useState<DescribeError>(null);
  const [sourceError, setSourceError] = useState(false);
  const [nameWarning, setNameWarning] = useState(false);
  const [shortConfirmed, setShortConfirmed] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  function setText(next: string, method: "typed" | "dictated") {
    const previous = draft?.input_method ?? null;
    const input_method =
      method === "typed" ? (previous === "dictated" || previous === "mixed" ? "mixed" : "typed") : previous === "typed" || previous === "mixed" ? "mixed" : "dictated";
    handle.update({ description: next, input_method: next ? input_method : null });
    setTextError(null);
    setNameWarning(false);
    setShortConfirmed(false);
  }

  function proceed() {
    nav.done();
  }

  return (
    <DescribeView
      {...shell}
      text={text}
      onText={(value) => setText(cleanText(value), "typed")}
      firsthand={draft?.firsthand ?? null}
      onFirsthand={(value) => {
        setSourceError(false);
        handle.update({ firsthand: value });
      }}
      textError={textError}
      sourceError={sourceError}
      nameWarning={nameWarning}
      onNameKeep={() => {
        handle.update({ name_ack_hash: textHash(text) });
        setNameWarning(false);
        proceed();
      }}
      dictationLang={SPEECH_LANG[locale] ?? localeTags.en}
      onDictated={(words) => {
        const area = textRef.current;
        const start = area?.selectionStart ?? text.length;
        const end = area?.selectionEnd ?? text.length;
        const before = text.slice(0, start);
        const glue = before && !/\s$/.test(before) ? " " : "";
        setText(cleanText(`${before}${glue}${words}${text.slice(end)}`), "dictated");
      }}
      textRef={textRef}
      onContinue={() => {
        const trimmed = text.trim();
        let blocked = false;
        if (!trimmed) {
          setTextError({ key: "o09.tooShort", min: 20 });
          blocked = true;
        } else if ([...trimmed].length > 2000) {
          setTextError({ key: "o09.tooLong", max: 2000 });
          blocked = true;
        }
        if (draft?.firsthand === null || draft?.firsthand === undefined) {
          setSourceError(true);
          blocked = true;
        }
        if (blocked) {
          focusFirst(trimmed && [...trimmed].length <= 2000 ? '[data-testid="o09-source"] input' : '[data-testid="o09-text"]');
          return;
        }
        // Advice, not a rule: a second tap continues (the contract accepts 1 to 2000).
        if ([...trimmed].length < 20 && !shortConfirmed) {
          setTextError({ key: "o09.tooShort", min: 20 });
          setShortConfirmed(true);
          return;
        }
        const words = draft?.place.label ? draft.place.label.split(/[\s,]+/) : [];
        if (looksLikeName(trimmed, words) && draft?.name_ack_hash !== textHash(text)) {
          setNameWarning(true);
          focusFirst('[data-testid="o09-name-keep"]');
          return;
        }
        proceed();
      }}
    />
  );
}

/* ---------- O-11 ---------- */

type Sent = { draft: IncidentDraft };

const FIELD_BLOCK: Array<[RegExp, CheckBlock]> = [
  [/^occurred_at/, "when"],
  [/^place/, "where"],
  [/^description/, "describe"],
  [/^firsthand/, "source"],
  [/^danger_now/, "danger"],
  [/^(category_observer|access_barrier_details)/, "what"],
];

function CheckStep({ handle, nav, shell, sentId, setSentId, offline }: StepProps & { sentId: string | null; setSentId: (id: string | null) => void; offline: boolean }) {
  const router = useRouter();
  const t = useTranslatorForErrors();
  const [sent, setSent] = useState<Sent | null>(null);
  const [status, setStatus] = useState<CheckStatus>(null);
  const [serverErrors, setServerErrors] = useState<Partial<Record<CheckBlock, string>>>({});
  const [localErrors, setLocalErrors] = useState<Partial<Record<CheckBlock, string>>>({});
  const report = useReportState(sentId);
  const draft = sent?.draft ?? handle.draft;
  const previews = useMediaPreviews(draft?.media ?? []);
  const leftHome = useRef(false);

  const goHomeSoon = useCallback(() => {
    if (nav.citizen || leftHome.current) return;
    leftHome.current = true;
    window.setTimeout(() => router.push("/o"), 2_000);
  }, [nav.citizen, router]);

  const recoverDraft = useCallback(
    async (item: OutboxItem) => {
      const rebuilt = itemToDraft(item);
      const fields = item.last_error?.fields ?? {};
      const code = item.last_error?.code;
      const mapped: Partial<Record<CheckBlock, string>> = {};
      for (const [path, error] of Object.entries(fields)) {
        const block = FIELD_BLOCK.find(([pattern]) => pattern.test(path))?.[1];
        if (block) mapped[block] = t.field(block, error.code);
      }
      if (code === "payload_too_large") mapped.describe = t.field("describe", "max_length");
      if (rebuilt) {
        await returnToDraft(item, rebuilt);
        handle.update(() => rebuilt);
      }
      setSent(null);
      setSentId(null);
      setServerErrors(mapped);
      setStatus("needsAttention");
    },
    [t, handle, setSentId],
  );

  // What the screen says after Send comes from the outbox item: one source (R1).
  const item = sentId ? report.item : null;
  const followed: CheckStatus = !item
    ? null
    : report.state === "withdrawn"
      ? "withdrawn"
      : item.wait_reason === "intake_paused"
        ? "intakePaused"
        : report.state === "not_confirmed" && item.wait_reason === "server"
          ? "server"
          : report.state === "not_confirmed"
            ? "notConfirmed"
            : report.state === "on_phone" && item.attempts === 0 && item.wait_reason !== null
              ? "savedOffline"
              : null;
  const shown: CheckStatus = followed ?? status;

  useEffect(() => {
    if (!item) return;
    if (report.state === "received" && item.server) {
      router.replace(`/o/reports/${item.server.id}?just-sent=1${nav.citizen ? "&as=citizen" : ""}`);
    } else if (report.state === "needs_attention") {
      void Promise.resolve().then(() => recoverDraft(item));
    } else if (followed === "intakePaused" || followed === "server" || followed === "savedOffline") {
      goHomeSoon();
    }
  }, [item, report.state, followed, router, nav.citizen, recoverDraft, goHomeSoon]);

  if (!draft) return null;

  const local = missing(draft, t);
  const errors = { ...localErrors, ...serverErrors };

  return (
    <CheckView
      {...shell}
      onDiscard={sent ? undefined : shell.onDiscard}
      category={draft.category_observer}
      access={draft.access_barrier_details}
      danger={draft.danger_now}
      place={draft.place.label}
      occurredAt={draft.occurred_at}
      justNow={draft.when.mode === "now"}
      description={draft.description}
      firsthand={draft.firsthand}
      media={draft.media.map((media) => ({ id: media.client_media_id, kind: media.kind, previewUrl: previews[media.client_media_id] ?? null, name: media.name }))}
      errors={errors}
      status={shown}
      onHome={() => router.push(nav.citizen ? "/o/start?view=choose" : "/o")}
      onEdit={(block) => {
        const target: StepId = block === "source" ? "describe" : block === "describe" ? "describe" : block;
        setServerErrors({});
        window.history.pushState({ egBackTo: "check" }, "", nav.url(target, "edit=1"));
      }}
      onSend={async () => {
        if (status === "sending" || sentId) return;
        if (Object.keys(local).length) {
          setLocalErrors(local);
          focusFirst('[data-invalid] button, [data-testid^="o11-edit-"]');
          return;
        }
        setLocalErrors({});
        setServerErrors({});
        await handle.flush();
        const ready: IncidentDraft = { ...draft, occurred_at: draft.occurred_at ?? isoWithOffset(new Date(correctedNow())) };
        const offlineAtTap = offline || !navigator.onLine;
        setStatus("sending");
        try {
          const item = await enqueueDraft(ready, isoWithOffset());
          setSent({ draft: ready });
          handle.release();
          setSentId(item.id);
          if (offlineAtTap) {
            setStatus("savedOffline");
            goHomeSoon();
          } else {
            kick();
          }
        } catch (error) {
          setStatus(error instanceof QueueFullError ? "queueFull" : error instanceof StorageFullError ? "storageFull" : "server");
        }
      }}
    />
  );
}

/** Message texts for O-11 blocks, from each step's own keys. */
function useTranslatorForErrors() {
  const t = useT();
  return useMemo(
    () => ({
      field(block: CheckBlock, code: string): string {
        switch (block) {
          case "when":
            return code === "in_future" ? t("o08.future") : t("o08.error");
          case "where":
            return t("o07.error");
          case "describe":
            return code === "max_length" ? t("o09.tooLong", { max: 2000 }) : t("o09.tooShort", { min: 20 });
          case "source":
            return t("o09.sourceError");
          case "danger":
            return t("o06.error");
          default:
            return t("o05.error");
        }
      },
    }),
    [t],
  );
}


function missing(draft: IncidentDraft, t: { field: (block: CheckBlock, code: string) => string }): Partial<Record<CheckBlock, string>> {
  const out: Partial<Record<CheckBlock, string>> = {};
  if (!draft.category_observer) out.what = t.field("what", "required");
  if (draft.danger_now === null) out.danger = t.field("danger", "required");
  if (!(draft.place.polling_unit_code || (draft.place.ward_code && draft.place.unknown_unit))) out.where = t.field("where", "required");
  if (!draft.occurred_at && draft.when.mode !== "now") out.when = t.field("when", "required");
  if (!draft.description.trim()) out.describe = t.field("describe", "required");
  else if ([...draft.description.trim()].length > 2000) out.describe = t.field("describe", "max_length");
  if (draft.firsthand === null) out.source = t.field("source", "required");
  return out;
}
