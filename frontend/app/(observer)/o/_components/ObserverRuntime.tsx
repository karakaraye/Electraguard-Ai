"use client";

/**
 * Runs behind every observer screen: starts the sync loop for the signed-in
 * code (and citizen items), registers the service worker, asks for the PIN when
 * the session expired (R5), and moves to the revoked view when the code stops
 * working.
 */

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { api, onApiEvent } from "../../../../lib/api/client";
import { useT } from "../../../../lib/i18n/client";
import { flushNoticeAnswers } from "../../../../lib/outbox/notices";
import { kick, markWaitingCode, resumeAfterIntakePause, setPaused, startSync, useOutbox } from "../../../../lib/outbox";
import { Button, Field, Sheet } from "../../../../ui";
import { resumeAfterSignIn, startPending } from "../_lib/pending";
import { prefetchReference } from "../_lib/reference";
import { clearSession, getSession, markExpired, signedIn, updateFromMe, useObserverSession } from "../_lib/session";
import { flushPendingSignOut } from "../_lib/signOut";
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
  const pathname = usePathname();
  const { session } = useObserverSession();
  const outbox = useOutbox();
  const open = usePinOpen();

  useEffect(registerServiceWorker, []);

  useEffect(() => {
    const owners = () => [getSession()?.code, "citizen"].filter((owner): owner is string => Boolean(owner));
    startSync({ owners });
    // Checklist stages, result sheets, messages and posts (lib/outbox carries incident reports only).
    startPending(owners);
  }, [session?.code]);

  // Check-in answers saved offline go out when the phone has a network and a session.
  useEffect(() => {
    if (!session?.code) return;
    const code = session.code;
    const send = () => void flushNoticeAnswers([code]);
    send();
    window.addEventListener("online", send);
    const timer = window.setInterval(send, 60_000);
    return () => {
      window.removeEventListener("online", send);
      window.clearInterval(timer);
    };
  }, [session?.code]);

  // Keep the polling-unit list on the phone so a report can name its unit offline.
  useEffect(() => {
    if (!session?.code) return;
    void prefetchReference();
    const onOnline = () => void prefetchReference();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [session?.code]);

  // "Clear this phone" ran offline: end the server session once the network is back (O-20).
  useEffect(() => {
    if (session) return;
    void flushPendingSignOut();
    const onOnline = () => void flushPendingSignOut();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [session]);

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

  // Intake paused (R5): while a report waits for it, re-read AUTH-07 every minute and send as soon as intake reopens.
  const waitingForIntake = outbox.items.some((item) => item.state === "queued" && item.wait_reason === "intake_paused");
  useEffect(() => {
    if (!waitingForIntake) return;
    let cancelled = false;
    const check = async () => {
      if (!navigator.onLine) return;
      const me = await api("AUTH-07", {});
      if (cancelled || !me.ok) return;
      updateFromMe(me.data);
      if (me.data.authenticated && !me.data.user.organisation.intake_paused) await resumeAfterIntakePause();
    };
    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [waitingForIntake]);

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
      // A full navigation: Home reacts to the cleared session with its own redirect, which would otherwise win the race.
      if (!pathname.startsWith("/o/start") || !window.location.search.includes("view=revoked")) {
        window.location.replace("/o/start?view=revoked");
      }
    })();
  }, [outbox.paused, pathname]);

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
      resumeAfterSignIn();
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
