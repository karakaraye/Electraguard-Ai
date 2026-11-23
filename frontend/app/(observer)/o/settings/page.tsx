"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, resetCsrf } from "../../../../lib/api/client";
import { clearAll } from "../../../../lib/drafts/db";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { queuedMediaBytes, resetMirror, sendNow, useOutbox } from "../../../../lib/outbox";
import { formatBytes } from "../../../../ui/format";
import { APP_VERSION } from "../../../../lib/config";
import { clearAllChecklists } from "../_lib/checklist";
import { pinTooSimple } from "../_lib/codes";
import { useFocusTitle, useNetwork } from "../_lib/network";
import { clearPending, kickPending, usePending } from "../_lib/pending";
import { clearSession } from "../_lib/session";
import { SIGN_OUT_PENDING } from "../_lib/signOut";
import { minutesFrom } from "../_lib/status";
import { useSignedIn } from "../_lib/useSignedIn";
import { SettingsView, type PinField } from "../_views/SettingsView";

/** O-20 Settings. */
export default function SettingsPage() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const { session } = useSignedIn();
  const { offline } = useNetwork();
  const outbox = useOutbox();
  const pending = usePending();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState({ current: "", next: "", confirm: "" });
  const [pinError, setPinError] = useState<{ field: PinField; message: string } | null>(null);
  const [pinState, setPinState] = useState<null | "saving" | "saved">(null);
  const [sheet, setSheet] = useState<null | "signOut" | "clear">(null);
  const [busy, setBusy] = useState<null | "signOut" | "everywhere" | "clear">(null);
  useFocusTitle("o20");

  if (!session) return null;
  const code = session.code;
  const unsent = outbox.items.filter((item) => item.owner === code && item.state !== "received").length + pending.filter((item) => item.owner === code).length;
  const allUnsent = outbox.items.filter((item) => item.state !== "received").length + pending.length;

  async function signOut(everywhere: boolean) {
    setBusy(everywhere ? "everywhere" : "signOut");
    const result = await api("AUTH-06", { body: { everywhere } });
    resetCsrf();
    setBusy(null);
    if (!result.ok && result.status === 0 && everywhere) return;
    // Plain sign-out keeps this code's drafts and queued items; they return when the same code signs in.
    clearSession();
    router.replace("/o/start?view=choose");
  }

  async function clearPhone() {
    setBusy("clear");
    // Best effort: clearing never waits on the network. Offline, AUTH-06 is sent when the network returns.
    const result = navigator.onLine ? await api("AUTH-06", { body: { everywhere: false } }) : null;
    await clearAll().catch(() => undefined);
    await clearPending();
    clearAllChecklists();
    resetMirror();
    try {
      for (const key of Object.keys(window.localStorage)) if (key.startsWith("eg.")) window.localStorage.removeItem(key);
      window.sessionStorage.clear();
      if (!result || !result.ok) window.localStorage.setItem(SIGN_OUT_PENDING, "1");
    } catch {
      // ignore
    }
    document.cookie = "eg_locale=; path=/; max-age=0";
    // Cache Storage: drop anything that is not the app shell, static files or the polling-unit lists.
    if (typeof caches !== "undefined") {
      for (const name of await caches.keys()) if (!/^eg-(shell|static|reference)-/.test(name)) await caches.delete(name);
    }
    resetCsrf();
    clearSession();
    setBusy(null);
    window.location.replace("/o/start?view=language");
  }

  async function savePin() {
    const { current, next, confirm } = pin;
    if (!/^\d{6}$/.test(current)) return setPinError({ field: "current", message: t("o20.pin.format") });
    if (!/^\d{6}$/.test(next)) return setPinError({ field: "next", message: t("o20.pin.format") });
    if (pinTooSimple(next)) return setPinError({ field: "next", message: t("o03.setPin.tooSimple") });
    if (next !== confirm) return setPinError({ field: "confirm", message: t("o03.setPin.mismatch") });
    setPinError(null);
    setPinState("saving");
    const result = await api("AUTH-08", { body: { current_pin: current, new_pin: next } });
    if (result.ok) {
      setPin({ current: "", next: "", confirm: "" });
      setPinState("saved");
      setPinOpen(false);
      return;
    }
    setPinState(null);
    const field = result.ok ? undefined : (result.error as { fields?: Record<string, { code: string }> }).fields?.new_pin?.code;
    if (result.status === 0) setPinError({ field: "form", message: t("o03.signIn.offline") });
    else if (result.status === 404) setPinError({ field: "form", message: t("common.error.unavailable") });
    else if (result.error.code === "invalid_credentials") setPinError({ field: "current", message: t("o20.pin.wrongCurrent") });
    else if (result.error.code === "code_locked" || result.error.code === "rate_limited")
      setPinError({ field: "form", message: t("common.error.tooManyTries", { minutes: minutesFrom(result.retry_after_seconds, 900) }) });
    else if (field === "pin_too_simple") setPinError({ field: "next", message: t("o03.setPin.tooSimple") });
    else if (field === "pin_same_as_setup" || field === "pin_reused") setPinError({ field: "next", message: t("o20.pin.reused") });
    else setPinError({ field: "form", message: t("common.error.server") });
  }

  return (
    <SettingsView
      offline={offline}
      code={code}
      version={APP_VERSION}
      unsentCount={sheet === "clear" ? allUnsent : unsent}
      mediaLabel={formatBytes(queuedMediaBytes(), locale)}
      signedOutNotice={false}
      languageOpen={languageOpen}
      onLanguage={setLanguageOpen}
      pinOpen={pinOpen}
      onPinOpen={(open) => {
        setPinOpen(open);
        if (open) setPinState(null);
      }}
      pin={pin}
      onPin={(field, value) => {
        setPin((current) => ({ ...current, [field]: value }));
        if (pinError?.field === field || pinError?.field === "form") setPinError(null);
      }}
      pinError={pinError}
      pinState={pinState}
      onSavePin={() => void savePin()}
      onSendNow={() => {
        setSheet(null);
        void sendNow();
        kickPending(true);
      }}
      sheet={sheet}
      busy={busy}
      onSignOut={(everywhere) => {
        if (!everywhere && unsent > 0) setSheet("signOut");
        else void signOut(everywhere);
      }}
      onConfirmSignOut={() => void signOut(false)}
      onClear={() => setSheet("clear")}
      onConfirmClear={() => void clearPhone()}
      onCloseSheet={() => setSheet(null)}
      onBack={() => router.back()}
    />
  );
}
