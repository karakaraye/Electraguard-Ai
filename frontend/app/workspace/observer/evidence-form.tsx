"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { csrfPost } from "../../../lib/auth-client";

export async function uploadEvidence(reference: string, file: File) {
  const body = new FormData();
  body.set("file", file);
  const response = await csrfPost(`/api/reports/${reference}/attachments`, body);
  if (response.ok) return;
  if (response.status === 409) {
    throw new Error("Evidence uploads are unavailable because this case is closed.");
  }
  if (response.status === 400) {
    const { file: detail } = await response.json();
    throw new Error(typeof detail === "string" ? detail : "Choose a valid JPEG or PNG image.");
  }
  throw new Error("The upload could not be confirmed.");
}

export const evidenceAccept = "image/jpeg,image/png";
export const evidenceHint = "Use a JPEG or PNG image up to 2 MiB and 16 megapixels.";

export function EvidenceForm({
  reference, retryFile = null, uploadError = "", onSaved,
}: {
  reference: string; retryFile?: File | null; uploadError?: string; onSaved?: () => void;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(retryFile);
  const [error, setError] = useState(uploadError);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || pending) return;
    const form = event.currentTarget;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await uploadEvidence(reference, file);
      setFile(null);
      form.reset();
      setMessage("Evidence saved.");
      if (onSaved) onSaved();
      else router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The upload could not be confirmed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={submit}>
      <label htmlFor="attachment">Private evidence</label>
      <small id="attachment-hint">{evidenceHint}</small>
      <input id="attachment" type="file" accept={evidenceAccept} disabled={pending}
        aria-describedby="attachment-hint" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      {file && <small>Selected file: {file.name}</small>}
      <button disabled={!file || pending}>
        {pending ? "Uploading…" : error ? "Retry attachment" : "Upload evidence"}
      </button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
