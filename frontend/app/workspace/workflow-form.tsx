"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { csrfPost } from "../../lib/auth-client";

export function WorkflowForm({ path, version, action, label, children }: {
  path: string;
  version: number;
  action?: string;
  label: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || stale) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setPending(true);
    setError("");
    try {
      const response = await csrfPost(path, JSON.stringify({ ...fields, version, action }), {
        "Content-Type": "application/json",
      });
      if (response.ok) {
        // A successful write increments the version and remounts the form.
        router.refresh();
        return;
      }
      if (response.status === 409 || response.status === 404 || response.status === 403) {
        setStale(true);
        setError("This case or your access has changed. Refresh to see what is available.");
      } else if (response.status === 400) {
        const details = Object.values(await response.json()).flat();
        setError(details.find((detail): detail is string => typeof detail === "string")
          ?? "Check the form and try again.");
      } else {
        setError("The action could not be confirmed. Try again or refresh the case.");
      }
    } catch {
      setError("The action could not be confirmed. Try again or refresh the case.");
    }
    setPending(false);
  }

  return (
    <form method="post" onSubmit={submit}>
      <fieldset disabled={pending || stale}>
        {children}
        <button>{pending ? "Saving…" : label}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {stale && <button type="button" onClick={() => {
        setStale(false);
        setError("");
        router.refresh();
      }}>Refresh case</button>}
    </form>
  );
}
