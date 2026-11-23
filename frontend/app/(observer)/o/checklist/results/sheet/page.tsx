"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { api, isoWithOffset, uuidv4 } from "../../../../../../lib/api/client";
import type { Language, ObserverSettingsResponse, OcrResponse, ResultSheetField } from "../../../../../../lib/api/types";
import { putBlob } from "../../../../../../lib/drafts/db";
import { useLocale, useT } from "../../../../../../lib/i18n/client";
import { MediaError, preparePhoto, type Prepared } from "../../../../../../ui/MediaCapture/process";
import { useChecklistDay, watDay } from "../../../_lib/checklist";
import { useFocusTitle, useNetwork } from "../../../_lib/network";
import { enqueue, onPendingDone, retryPending, usePending, type PendingItem } from "../../../_lib/pending";
import { correctedNow } from "../../../_lib/session";
import { useSignedIn } from "../../../_lib/useSignedIn";
import { ResultSheetView, type SheetNotice, type SheetStatus } from "../../../_views/ResultSheetView";

/** Contract default party labels (ADM-04) until REF-02 answers with the organisation's own (G5). */
const DEFAULT_LABELS = ["A", "B", "C", "D", "E"];
const MAX_VALUE = 99_999;

function ResultSheetScreen() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const view = search.get("view") === "numbers" ? "numbers" : "photo";
  const { session } = useSignedIn();
  const { offline } = useNetwork();
  const pending = usePending();
  const code = session?.code ?? null;
  const day = watDay(correctedNow());
  const record = useChecklistDay(code, day);
  const [labels, setLabels] = useState<string[]>(DEFAULT_LABELS);
  const [photo, setPhoto] = useState<Prepared | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<SheetNotice>(null);
  const [ocr, setOcr] = useState<OcrResponse | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [sentKey, setSentKey] = useState<string | null>(null);
  useFocusTitle(`o16:${view}`);

  // REF-02 (G5): the organisation's party labels. Votes keys must equal them exactly.
  useEffect(() => {
    if (!session || offline) return;
    void api("REF-02", {}).then((result) => {
      const data = result.ok ? (result.data as ObserverSettingsResponse) : null;
      if (data?.party_labels?.length) setLabels(data.party_labels);
    });
  }, [session, offline]);

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const queued = pending.find((item): item is Extract<PendingItem, { kind: "result_sheet" }> => item.kind === "result_sheet" && item.owner === code && !item.report_id);

  // A refused sheet comes back with its numbers so the observer can fix and resend with the same key.
  useEffect(() => {
    if (!queued || queued.state !== "needs_attention" || Object.keys(values).length) return;
    const sheet = queued.body.result_sheet;
    setValues({
      registered: String(sheet.registered),
      accredited: String(sheet.accredited),
      rejected: String(sheet.rejected),
      ...Object.fromEntries(Object.entries(sheet.votes).map(([label, value]) => [`votes.${label}`, String(value)])),
    });
  }, [queued, values]);

  useEffect(
    () =>
      onPendingDone((done) => {
        if (done.kind === "report" && done.key === sentKey) router.replace("/o/reports");
      }),
    [sentKey, router],
  );

  const fields = useMemo(
    () => [
      { id: "registered", label: t("o16.numbers.registered") },
      { id: "accredited", label: t("o16.numbers.accredited") },
      ...labels.map((label) => ({ id: `votes.${label}`, label: t("o16.numbers.party", { label }) })),
      { id: "rejected", label: t("o16.numbers.rejected") },
    ],
    [labels, t],
  );

  const suggested = useMemo(() => {
    const out: Record<string, number> = {};
    if (!ocr) return out;
    const read = (id: string, field: { value: number | null; confidence: number } | undefined) => {
      if (field && field.value !== null && !touched.has(id)) out[id] = field.confidence;
    };
    read("registered", ocr.fields.registered);
    read("accredited", ocr.fields.accredited);
    read("rejected", ocr.fields.rejected);
    for (const label of labels) read(`votes.${label}`, ocr.fields.votes[label]);
    return out;
  }, [ocr, touched, labels]);

  if (!session || !code) return null;
  const unit = record.unit;

  async function takePhoto(file: File) {
    setNotice(null);
    let prepared: Prepared;
    try {
      prepared = await preparePhoto(file);
    } catch (error) {
      setNotice(error instanceof MediaError && error.code === "too_big" ? "tooBig" : error instanceof MediaError && error.code === "wrong_type" ? "wrongType" : "readFailed");
      return;
    }
    setPhoto(prepared);
    setPhotoUrl(URL.createObjectURL(prepared.blob));
    setOcr(null);
    if (offline || !navigator.onLine) {
      setNotice("offline");
      return;
    }
    // RS-01: read the photo during the draft; values are suggestions only.
    setNotice("reading");
    const result = await api("RS-01", { body: { file: prepared.blob, sha256: prepared.sha256 }, idempotency_key: uuidv4() });
    if (result.ok) {
      const data = result.data;
      const all = [data.fields.registered, data.fields.accredited, data.fields.rejected, ...Object.values(data.fields.votes)];
      if (all.every((field) => field.value === null)) {
        setNotice("readFailed");
        return;
      }
      setOcr(data);
      setTouched(new Set());
      const filled: Record<string, string> = {};
      const put = (id: string, field?: { value: number | null }) => {
        if (field && field.value !== null) filled[id] = String(field.value);
      };
      put("registered", data.fields.registered);
      put("accredited", data.fields.accredited);
      put("rejected", data.fields.rejected);
      for (const label of labels) put(`votes.${label}`, data.fields.votes[label]);
      setValues(filled);
      setNotice(null);
      return;
    }
    const codeName = result.error.code;
    setNotice(
      result.status === 0
        ? "offline"
        : result.status === 404
          ? "unavailable"
          : codeName === "payload_too_large"
            ? "tooBig"
            : codeName === "unsupported_media_type"
              ? "wrongType"
              : codeName === "rate_limited"
                ? "tooMany"
                : "readFailed",
    );
  }

  function validate(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of fields) {
      const value = (values[field.id] ?? "").trim();
      if (!value) out[field.id] = t("o16.numbers.required");
      else if (!/^\d+$/.test(value)) out[field.id] = t("o16.numbers.notNumber");
      else if (Number(value) > MAX_VALUE) out[field.id] = t("o16.numbers.tooBig");
    }
    return out;
  }

  async function send() {
    if (!unit) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      document.querySelector<HTMLElement>(`[data-testid="o16-field-${Object.keys(found)[0]}"] input, input[data-testid="o16-field-${Object.keys(found)[0]}"]`)?.focus();
      return;
    }
    if (!confirmed) {
      setConfirmError(true);
      document.querySelector<HTMLElement>('[data-testid="o16-confirm"] input')?.focus();
      return;
    }
    if (queued?.state === "needs_attention") {
      retryPending(queued.key);
      setSentKey(queued.key);
      return;
    }
    const number = (id: string) => Number(values[id]);
    const votes = Object.fromEntries(labels.map((label) => [label, number(`votes.${label}`)]));
    const useOcr = Boolean(ocr);
    let stored: Extract<PendingItem, { kind: "result_sheet" }>["photo"] = null;
    if (photo && !useOcr) {
      const key = `sheet:${uuidv4()}`;
      await putBlob(key, photo.blob);
      stored = { blob_key: key, content_type: photo.content_type, size_bytes: photo.size_bytes, sha256: photo.sha256, upload_key: uuidv4(), complete_key: uuidv4() };
    }
    const item = enqueue({
      owner: code!,
      kind: "result_sheet",
      day,
      report_id: null,
      photo: stored,
      body: {
        kind: "result_sheet",
        language: locale as Language,
        occurred_at: isoWithOffset(new Date(correctedNow())),
        place: { polling_unit_code: unit.code },
        device_saved_at: isoWithOffset(),
        related_report_id: record.stages.results?.report_id ?? null,
        result_sheet: {
          registered: number("registered"),
          accredited: number("accredited"),
          rejected: number("rejected"),
          votes,
          confirmed_fields: fields.map((field) => field.id as ResultSheetField),
          ocr_id: ocr?.ocr_id ?? null,
          entry_method: useOcr ? "ocr_confirmed" : "manual",
        },
      },
    });
    setSentKey(item.key);
    // Offline: the sheet waits on this phone; My reports shows it as "On this phone".
    if (offline || !navigator.onLine) router.replace("/o/reports");
  }

  const status: SheetStatus = queued
    ? queued.state === "needs_attention"
      ? "needsAttention"
      : queued.wait === "intake_paused"
        ? "intakePaused"
        : queued.state === "unconfirmed"
          ? queued.wait === "server"
            ? "server"
            : "notConfirmed"
          : sentKey === queued.key
            ? "sending"
            : null
    : null;

  return (
    <ResultSheetView
      offline={offline}
      view={view}
      photoUrl={photoUrl}
      notice={notice}
      needUnit={!unit}
      unitLabel={unit?.label ?? null}
      onPhoto={(file) => void takePhoto(file)}
      onSkip={() => router.push("/o/checklist/results/sheet?view=numbers")}
      onContinue={() => router.push("/o/checklist/results/sheet?view=numbers")}
      fields={fields}
      values={values}
      onValue={(id, value) => {
        setValues((current) => ({ ...current, [id]: value.replace(/\s/g, "") }));
        setTouched((current) => new Set(current).add(id));
        setErrors((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }}
      onTouch={(id) => setTouched((current) => new Set(current).add(id))}
      suggested={suggested}
      errors={errors}
      confirmed={confirmed}
      onConfirm={(value) => {
        setConfirmed(value);
        setConfirmError(false);
      }}
      confirmError={confirmError}
      status={status}
      photoOpen={photoOpen}
      onOpenPhoto={() => setPhotoOpen(true)}
      onClosePhoto={() => setPhotoOpen(false)}
      onSend={() => void send()}
      onBack={() => (view === "numbers" ? router.push("/o/checklist/results/sheet") : router.push("/o/checklist/results"))}
    />
  );
}

/** O-16 Check the result sheet (`?view=photo|numbers`). */
export default function ResultSheetPage() {
  return (
    <Suspense fallback={null}>
      <ResultSheetScreen />
    </Suspense>
  );
}
