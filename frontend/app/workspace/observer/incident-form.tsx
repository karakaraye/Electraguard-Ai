"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { csrfPost } from "../../../lib/auth-client";
import { EvidenceForm, evidenceAccept, evidenceHint, uploadEvidence } from "./evidence-form";
import type { Report } from "./report-types";

type Attempt = { key: string; body: string; file: File | null };

export function IncidentForm() {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Report | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploaded, setUploaded] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const selected = form.get("file");
    const occurredAt = new Date(String(form.get("occurred_at")));
    if (!attempt && !Number.isFinite(occurredAt.getTime())) {
      setError("Enter a valid incident date and time.");
      return;
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
      if (response.status === 400) {
        setAttempt(null);
        setError("Check the incident date and time, location, and description and try again.");
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
        <h2>Report saved</h2>
        <p role="status">Reference: <strong>{saved.reference}</strong></p>
        <p><Link href={`/workspace/observer/reports/${saved.reference}`} prefetch={false}>View report</Link></p>
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
    <div className="incident-section">
      <h2>Submit an incident</h2>
      <form method="post" onSubmit={submit}>
        <fieldset disabled={attempt !== null}>
          <label htmlFor="occurred-at">Incident date and time</label>
          <small id="incident-time-hint">Enter the time in your device’s time zone.</small>
          <input id="occurred-at" name="occurred_at" type="datetime-local" required aria-describedby="incident-time-hint" />
          <label htmlFor="incident-location">Approximate location</label>
          <input id="incident-location" name="location" maxLength={160} required />
          <label htmlFor="incident-description">Short description</label>
          <textarea id="incident-description" name="description" maxLength={1000} rows={4} required />
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
