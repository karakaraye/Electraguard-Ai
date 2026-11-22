"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../lib/api/client";
import { NOTICE_VERSION } from "../../../../lib/config";
import { useLocale } from "../../../../lib/i18n/client";
import type { Locale } from "../../../../lib/i18n/config";
import { adoptWaitingItems, removeItems, setPaused, useOutbox } from "../../../../lib/outbox";
import { normaliseObserverCode, observerCodeValid, pinTooSimple } from "../_lib/codes";
import { useFocusTitle, useNetwork } from "../_lib/network";
import { lastCode, localeChosen, markNoticeSeen, noticeSeen, signedIn, updateFromMe, useObserverSession } from "../_lib/session";
import { ChooseView, LanguageView, NoticeView, RevokedView, SetPinView, SignInView, type SignInError } from "../_views/StartViews";

type View = "language" | "notice" | "choose" | "sign-in" | "set-pin" | "revoked";
const VIEWS: View[] = ["language", "notice", "choose", "sign-in", "set-pin", "revoked"];

function firstView(): View {
  if (!localeChosen()) return "language";
  if (!noticeSeen(NOTICE_VERSION)) return "notice";
  return "choose";
}

export function StartFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("view") as View | null;
  const { locale, setLocale } = useLocale();
  const { session, ready } = useObserverSession();
  const outbox = useOutbox();
  const { offline } = useNetwork();
  const [view, setView] = useState<View | null>(null);

  // Sign-in form state lives here so Back to "choose" keeps the typed code (PIN cleared for safety).
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);
  const [locked, setLocked] = useState(false);
  const setupToken = useRef<string | null>(null);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [pinError, setPinError] = useState<{ field: "first" | "second" | "form"; key: string } | null>(null);

  useEffect(() => {
    if (!ready) return;
    const next = requested && VIEWS.includes(requested) ? requested : firstView();
    if (session?.code && next !== "revoked" && next !== "language" && next !== "notice") {
      router.replace("/o");
      return;
    }
    setView(next === "set-pin" && !setupToken.current ? "sign-in" : next);
    if (next === "sign-in" && !code) setCode(lastCode());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, requested]);

  useFocusTitle(view ?? "");

  function go(next: View, replace = false) {
    const url = `/o/start?view=${next}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    setView(next);
  }

  async function chooseLanguage(next: Locale) {
    await setLocale(next);
    if (noticeSeen(NOTICE_VERSION)) go("choose");
    else go("notice");
  }

  async function submitSignIn() {
    const normalised = normaliseObserverCode(code);
    setCode(normalised);
    if (!normalised) return setError({ field: "code", key: "o03.signIn.codeEmpty" });
    if (!observerCodeValid(normalised)) return setError({ field: "code", key: "o03.signIn.codeFormat" });
    if (!/^(\d{6}|\d{8})$/.test(pin)) return setError({ field: "pin", key: "o03.signIn.pinFormat" });
    if (!navigator.onLine) return setError({ field: "form", key: "o03.signIn.offline" });
    setError(null);
    setSending(true);
    const result = await api("AUTH-02", { body: { code: normalised, pin } });
    setSending(false);
    if (result.ok) {
      if (result.data.status === "signed_in") {
        await finishSignIn(result.data.me);
        return;
      }
      setupToken.current = result.data.setup_token;
      setPin("");
      setFirst("");
      setSecond("");
      setPinError(null);
      go("set-pin");
      return;
    }
    const after = result.retry_after_seconds;
    switch (result.error.code) {
      case "invalid_credentials":
        setPin("");
        setError({ field: "pin", key: "o03.signIn.wrong" });
        break;
      case "code_locked":
        if (after) {
          setLocked(true);
          window.setTimeout(() => setLocked(false), after * 1000);
          setError({ field: "form", key: "common.error.tooManyTries", minutes: Math.max(1, Math.ceil(after / 60)) });
        } else {
          setError({ field: "form", key: "o03.signIn.lockedAdmin" });
        }
        break;
      case "rate_limited":
        setError({ field: "form", key: "common.error.tooManyTries", minutes: Math.max(1, Math.ceil((after ?? 60) / 60)) });
        break;
      case "code_revoked":
        setError({ field: "code", key: "o03.signIn.revoked" });
        break;
      case "validation_failed": {
        const fields = result.error.fields ?? {};
        setError(fields.pin && !fields.code ? { field: "pin", key: "o03.signIn.pinFormat" } : { field: "code", key: "o03.signIn.codeFormat" });
        break;
      }
      case "network_error":
        setError({ field: "form", key: "o03.signIn.offline" });
        break;
      default:
        setError({ field: "form", key: "common.error.server" });
    }
  }

  async function finishSignIn(me: Parameters<typeof signedIn>[0], pinJustSet = false) {
    signedIn(me);
    setPaused(null);
    if (me.user.observer_code) await adoptWaitingItems(me.user.observer_code);
    if (pinJustSet) {
      try {
        window.sessionStorage.setItem("eg.pinSaved", "1");
      } catch {
        // ignore
      }
    }
    router.replace("/o");
  }

  async function submitPin() {
    if (!/^\d{6}$/.test(first)) return setPinError({ field: "first", key: "o03.signIn.pinFormat" });
    if (pinTooSimple(first)) return setPinError({ field: "first", key: "o03.setPin.tooSimple" });
    if (first !== second) return setPinError({ field: "second", key: "o03.setPin.mismatch" });
    if (!setupToken.current) return go("sign-in", true);
    setPinError(null);
    setSending(true);
    const result = await api("AUTH-03", { body: { setup_token: setupToken.current, new_pin: first } });
    setSending(false);
    if (result.ok) {
      setupToken.current = null;
      await finishSignIn(result.data.me, true);
      return;
    }
    if (result.error.code === "validation_failed") {
      const fieldCode = String(result.error.fields?.new_pin?.code ?? "");
      setPinError({ field: "first", key: fieldCode === "pin_too_simple" ? "o03.setPin.tooSimple" : fieldCode ? "o03.setPin.sameAsCard" : "o03.signIn.pinFormat" });
      return;
    }
    if (result.error.code === "invalid_credentials") {
      // A lost response after success uses the token: AUTH-07 tells whether a session exists.
      const me = await api("AUTH-07", {});
      if (me.ok && me.data.authenticated) {
        updateFromMe(me.data);
        await finishSignIn(me.data, true);
        return;
      }
      setupToken.current = null;
      setPin("");
      setError({ field: "form", key: "common.error.sessionExpired" });
      go("sign-in", true);
      return;
    }
    if (result.error.code === "rate_limited") return setPinError({ field: "form", key: "common.error.server" });
    setPinError({ field: "form", key: result.status === 0 ? "o03.signIn.offline" : "common.error.server" });
  }

  if (!view) return null;
  const waiting = outbox.items.filter((item) => item.state === "waiting_code");

  switch (view) {
    case "language":
      return <LanguageView selected={localeChosen() ? locale : null} onChoose={chooseLanguage} offline={offline} />;
    case "notice":
      return (
        <NoticeView
          offline={offline}
          onBack={() => go("language")}
          onContinue={() => {
            markNoticeSeen(NOTICE_VERSION);
            go("choose");
          }}
        />
      );
    case "choose":
      return (
        <ChooseView
          offline={offline}
          onBack={() => go("notice")}
          onObserver={() => {
            if (!code) setCode(lastCode());
            go("sign-in");
          }}
          onCitizen={() => router.push("/o/new/what?as=citizen")}
          onCheckStatus={() => router.push("/status")}
        />
      );
    case "sign-in":
      return (
        <SignInView
          offline={offline}
          code={code}
          pin={pin}
          onCode={(value) => {
            setCode(value);
            if (error?.field === "code") setError(null);
          }}
          onCodeBlur={() => setCode(normaliseObserverCode(code))}
          onPin={(value) => {
            setPin(value);
            if (error?.field === "pin") setError(null);
          }}
          onSubmit={submitSignIn}
          onBack={() => {
            setPin("");
            go("choose");
          }}
          sending={sending}
          error={error}
          locked={locked}
        />
      );
    case "set-pin":
      return (
        <SetPinView
          offline={offline}
          first={first}
          second={second}
          onFirst={setFirst}
          onSecond={setSecond}
          onSubmit={submitPin}
          onBack={() => {
            setFirst("");
            setSecond("");
            go("sign-in");
          }}
          sending={sending}
          error={pinError}
        />
      );
    case "revoked":
      return (
        <RevokedView
          offline={offline}
          unsentCount={waiting.length}
          onSignInNew={() => go("sign-in")}
          onClear={() => removeItems(waiting.map((item) => item.id))}
        />
      );
  }
}
