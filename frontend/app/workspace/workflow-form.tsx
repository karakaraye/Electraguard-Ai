"use client";

import { useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { csrfPost } from "../../lib/auth-client";

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function WorkflowForm({ path, version, action, label, children }: {
  path: string;
  version: number;
  action?: string;
  label: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
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
      if ([401, 403, 404].includes(response.status)) {
        window.dispatchEvent(new Event("workspace-access-lost"));
        window.location.replace("/access-changed");
        return;
      }
      if (response.status === 409) {
        setStale(true);
        setError("This case has changed. Refresh it before trying again.");
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
      <fieldset disabled={!hydrated || pending || stale}>
        {children}
        <button>{pending ? "Saving…" : label}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {stale && <button type="button" onClick={() => window.location.reload()}>Refresh case</button>}
    </form>
  );
}
