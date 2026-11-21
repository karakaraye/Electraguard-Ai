"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { csrfPost } from "../../../lib/auth-client";
import { EvidenceForm, evidenceAccept, evidenceHint, uploadEvidence } from "./evidence-form";
import type { Report } from "./report-types";

type Attempt = { key: string; body: string; file: File | null };
type Field = "occurred_at" | "location" | "polling_unit_code" | "description";
type FieldErrors = Partial<Record<Field, string>>;
const subscribeTimezone = () => () => {};
const readTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const readServerTimezone = () => "";

export function IncidentForm() {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState<Report | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploaded, setUploaded] = useState(false);
  const timezone = useSyncExternalStore(subscribeTimezone, readTimezone, readServerTimezone);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (saved) title.current?.focus();
  }, [saved]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    const selected = form.get("file");
    const occurredAt = new Date(String(form.get("occurred_at")));
    if (!attempt) {
      const errors: FieldErrors = {};
      if (!Number.isFinite(occurredAt.getTime())) errors.occurred_at = "Enter the incident date and time.";
      if (!String(form.get("location") ?? "").trim()) errors.location = "Enter an approximate location.";
      if (!String(form.get("description") ?? "").trim()) errors.description = "Describe what happened.";
      setFieldErrors(errors);
      const first = Object.keys(errors)[0];
      if (first) {
        const field = element.elements.namedItem(first);
        if (field instanceof HTMLElement) field.focus();
        return;
      }
    }
    if (!attempt && !crypto.randomUUID) {
      setError("Open ElectraGuard AI on localhost or over HTTPS to submit a report.");
      return;
    }
    const submission = attempt ?? {
      key: crypto.randomUUID(),
      body: JSON.stringify({
        occurred_at: occurredAt.toISOString(),
        location: form.get("location"),
        polling_unit_code: form.get("polling_unit_code"),
        description: form.get("description"),
      }),
      file: selected instanceof File && selected.name ? selected : null,
    };
    setAttempt(submission);
    setPending(true);
    setError("");
    try {
      const response = await csrfPost("/api/reports", submission.body, {
        "Content-Type": "application/json", "Idempotency-Key": submission.key,
      });
      if (response.status === 503) {
        const unavailable = await response.json().catch(() => null);
        if (unavailable?.code === "intake_paused") {
          setError("New reports are paused. Keep this page open and retry when intake resumes.");
          return;
        }
      }
      if (response.status === 400) {
        setAttempt(null);
        const responseErrors: Record<string, unknown> = await response.json();
        const errors: FieldErrors = {};
        for (const key of ["occurred_at", "location", "polling_unit_code", "description"] as const) {
          const value = responseErrors[key];
          const message = Array.isArray(value) ? value[0] : value;
          if (typeof message === "string") errors[key] = message;
        }
        setFieldErrors(errors);
        if (!Object.keys(errors).length) setError("Check the report fields and try again.");
        return;
      }
      if (!response.ok) throw new Error("Report save could not be confirmed.");
      const report: Report = await response.json();
      setSaved(report);
      if (submission.file) {
        try {
          await uploadEvidence(report.reference, submission.file);
          setUploaded(true);
        } catch (failure) {
          setRetryFile(submission.file);
          setUploadError(failure instanceof Error ? failure.message : "The upload could not be confirmed.");
        }
      }
    } catch {
      setError("Report save could not be confirmed. Retry this submission or check My Reports.");
    } finally {
      setPending(false);
    }
  }

  function startAnother() {
    setSaved(null);
    setAttempt(null);
    setRetryFile(null);
    setUploadError("");
    setUploaded(false);
  }

  if (saved) {
    return (
      <div className="incident-section">
        <h2 ref={title} tabIndex={-1}>Report saved</h2>
        <p role="status">Reference: <strong>{saved.reference}</strong></p>
        <p><a href={`/workspace/observer/reports/${saved.reference}`}>View report</a></p>
        <p><Link href="/workspace/observer/reports">My reports</Link></p>
        {pending && <p role="status">Uploading evidence…</p>}
        {uploaded && <p role="status">Evidence saved.</p>}
        {retryFile && (
          <EvidenceForm reference={saved.reference} retryFile={retryFile} uploadError={uploadError}
            onSaved={() => {
              setRetryFile(null);
              setUploaded(true);
            }} />
        )}
        {!pending && <p><button onClick={startAnother}>Submit another report</button></p>}
      </div>
    );
  }

  return (
    <div className="incident-section" id="new-report">
      <h2>Submit an incident</h2>
      <p>After a reload or sign-in, check <Link href="/workspace/observer/reports">My reports</Link> before entering the same report again.</p>
      <form method="post" noValidate onSubmit={submit}>
        <fieldset disabled={attempt !== null}>
          <label htmlFor="occurred-at">Incident date and time</label>
          <small id="incident-time-hint">Enter the time in your device’s time zone{timezone ? ` (${timezone})` : ""}.</small>
          <input id="occurred-at" name="occurred_at" type="datetime-local" required
            aria-invalid={Boolean(fieldErrors.occurred_at)}
            aria-describedby={fieldErrors.occurred_at ? "incident-time-hint incident-time-error" : "incident-time-hint"} />
          {fieldErrors.occurred_at && <p id="incident-time-error" role="alert">{fieldErrors.occurred_at}</p>}
          <label htmlFor="incident-location">Approximate location</label>
          <input id="incident-location" name="location" maxLength={160} required
            aria-invalid={Boolean(fieldErrors.location)} aria-describedby={fieldErrors.location ? "incident-location-error" : undefined} />
          {fieldErrors.location && <p id="incident-location-error" role="alert">{fieldErrors.location}</p>}
          <label htmlFor="incident-polling">Polling-unit code (optional)</label>
          <input id="incident-polling" name="polling_unit_code" maxLength={32}
            aria-invalid={Boolean(fieldErrors.polling_unit_code)} aria-describedby={fieldErrors.polling_unit_code ? "incident-polling-error" : undefined} />
          {fieldErrors.polling_unit_code && <p id="incident-polling-error" role="alert">{fieldErrors.polling_unit_code}</p>}
          <label htmlFor="incident-description">Short description</label>
          <textarea id="incident-description" name="description" maxLength={1000} rows={4} required
            aria-invalid={Boolean(fieldErrors.description)} aria-describedby={fieldErrors.description ? "incident-description-error" : undefined} />
          {fieldErrors.description && <p id="incident-description-error" role="alert">{fieldErrors.description}</p>}
          <label htmlFor="incident-evidence">Private evidence (optional)</label>
          <small id="incident-evidence-hint">{evidenceHint}</small>
          <input id="incident-evidence" name="file" type="file" accept={evidenceAccept}
            aria-describedby="incident-evidence-hint" />
        </fieldset>
        <button disabled={pending}>{pending ? "Saving report…" : attempt ? "Retry report" : "Submit report"}</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </div>
  );
}
