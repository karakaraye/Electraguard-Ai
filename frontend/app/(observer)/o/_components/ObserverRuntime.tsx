"use client";

/**
 * Runs behind every observer screen: starts the sync loop for the signed-in
 * code (and citizen items), registers the service worker, asks for the PIN when
 * the session expired (R5), and moves to the revoked view when the code stops
 * working.
 */

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { api, onApiEvent } from "../../../../lib/api/client";
import { useT } from "../../../../lib/i18n/client";
import { kick, markWaitingCode, setPaused, startSync, useOutbox } from "../../../../lib/outbox";
import { Button, Field, Sheet } from "../../../../ui";
import { clearSession, getSession, markExpired, signedIn, useObserverSession } from "../_lib/session";
import styles from "./observer.module.css";

/* ---------- "Enter your PIN" prompt store ---------- */

let pinOpen = false;
const pinListeners = new Set<() => void>();
function setPinOpen(open: boolean) {
  pinOpen = open;
  for (const listener of pinListeners) listener();
}
/** Open the PIN sheet (for example from "Send now" while the session is expired). */
export function openPinSheet() {
  setPinOpen(true);
}
function usePinOpen() {
  return useSyncExternalStore(
    (listener) => {
      pinListeners.add(listener);
      return () => pinListeners.delete(listener);
    },
    () => pinOpen,
    () => false,
  );
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
  const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

export function ObserverRuntime({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useObserverSession();
  const outbox = useOutbox();
  const open = usePinOpen();

  useEffect(registerServiceWorker, []);

  useEffect(() => {
    startSync({ owners: () => [getSession()?.code, "citizen"].filter((owner): owner is string => Boolean(owner)) });
  }, [session?.code]);

  useEffect(
    () =>
      onApiEvent((event) => {
        if (event.type === "not_authenticated" && getSession()) {
          markExpired();
          setPaused("auth");
        }
        if (event.type === "code_revoked") setPaused("revoked");
      }),
    [],
  );

  // Session expired while something waits to send: ask for the PIN once.
  useEffect(() => {
    if (outbox.paused === "auth" && getSession()) setPinOpen(true);
  }, [outbox.paused]);

  // Code revoked: local session data goes, queued items wait for a new code (R5).
  useEffect(() => {
    if (outbox.paused !== "revoked") return;
    const code = getSession()?.code;
    void (async () => {
      if (code) await markWaitingCode(code);
      clearSession();
      setPaused(null);
      if (!pathname.startsWith("/o/start")) router.replace("/o/start?view=revoked");
    })();
  }, [outbox.paused, pathname, router]);

  return (
    <>
      {children}
      {session ? <PinSheet open={open} code={session.code} onClose={() => setPinOpen(false)} /> : null}
    </>
  );
}

function PinSheet({ open, code, onClose }: { open: boolean; code: string; onClose: () => void }) {
  const t = useT();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!/^\d{6}$/.test(pin)) {
      setError(t("o03.signIn.pinFormat"));
      return;
    }
    setSending(true);
    const result = await api("AUTH-02", { body: { code, pin } });
    setSending(false);
    if (result.ok && result.data.status === "signed_in") {
      signedIn(result.data.me);
      setPin("");
      setError(null);
      setPaused(null);
      onClose();
      kick();
      return;
    }
    setPin("");
    if (!result.ok && (result.error.code === "code_locked" || result.error.code === "rate_limited")) {
      setError(t("common.error.tooManyTries", { minutes: Math.max(1, Math.ceil((result.retry_after_seconds ?? 900) / 60)) }));
    } else if (!result.ok && result.status === 0) {
      setError(t("o03.signIn.offline"));
    } else if (!result.ok && result.error.code === "code_revoked") {
      onClose();
      setPaused("revoked");
    } else if (!result.ok && result.status >= 500) {
      setError(t("common.error.server"));
    } else {
      setError(t("common.pinSheet.wrong"));
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("common.pinSheet.title")}
      description={t("common.pinSheet.body")}
      footer={
        <>
          <Button block type="submit" form="eg-pin-sheet" loading={sending} data-testid="pin-sheet-submit">
            {t("common.pinSheet.submit")}
          </Button>
          <Button variant="secondary" block onClick={onClose} data-testid="pin-sheet-later">
            {t("common.pinSheet.later")}
          </Button>
        </>
      }
      data-testid="pin-sheet"
    >
      <form
        id="eg-pin-sheet"
        className={styles.pin}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field
          label={t("common.pinSheet.label")}
          error={error ?? undefined}
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="current-password"
          numeric
          data-testid="pin-sheet-pin"
        />
      </form>
    </Sheet>
  );
}
