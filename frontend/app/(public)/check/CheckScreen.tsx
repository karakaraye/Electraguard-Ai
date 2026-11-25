"use client";

import { useRef, useState, type FormEvent } from "react";
import { api, uuidv4 } from "../../../lib/api/client";
import { useLocale, useT } from "../../../lib/i18n/client";
import { CheckView, CHECK_MAX, CHECK_MIN, type CheckState } from "./CheckView";

const DEVICE_KEY = "eg.check.device";

/** A random id kept on this device so repeat asks about one rumour count once. Storage may be blocked. */
function deviceToken(): string {
  try {
    const stored = window.localStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
    const made = uuidv4();
    window.localStorage.setItem(DEVICE_KEY, made);
    return made;
  } catch {
    return uuidv4();
  }
}

/** P-08 behaviour: CHK-01 on Check, CHK-02 only on the "Ask our reviewers" button. */
export function CheckScreen() {
  const t = useT();
  const { locale } = useLocale();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [state, setState] = useState<CheckState>({ kind: "idle" });
  const resultRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const checked = useRef("");

  function focusResult() {
    requestAnimationFrame(() => {
      const region = resultRef.current;
      const heading = region?.querySelector<HTMLElement>("[data-result-heading]");
      (heading ?? region)?.focus();
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    const length = [...value].length;
    if (length < CHECK_MIN || length > CHECK_MAX) {
      setProblem(t(length < CHECK_MIN ? "p08.tooShort" : "p08.tooLong"));
      inputRef.current?.focus();
      return;
    }
    setProblem(null);
    setState({ kind: "checking" });
    checked.current = value;
    const result = await api("CHK-01", { query: { q: value, lang: locale } });
    if (result.ok) {
      const data = result.data;
      if (data.result === "checked" && data.response) setState({ kind: "checked", response: data.response });
      else if (data.result === "safety") setState({ kind: "safety" });
      else setState({ kind: "not_checked", ask: "idle" });
    } else if (result.status === 0) setState({ kind: "error", reason: "offline" });
    else if (result.error.code === "rate_limited") setState({ kind: "error", reason: "too_many" });
    else if (result.status === 404) setState({ kind: "error", reason: "unavailable" });
    else if (result.error.code === "validation_failed") {
      setState({ kind: "idle" });
      setProblem(t("p08.invalid"));
    } else setState({ kind: "error", reason: "failed" });
    focusResult();
  }

  async function ask() {
    setState({ kind: "not_checked", ask: "asking" });
    const result = await api("CHK-02", { body: { text: checked.current, lang: locale, device_token: deviceToken() } });
    if (result.ok) setState({ kind: "not_checked", ask: result.data.result === "matched" ? "matched" : "queued" });
    else if (result.status === 0) setState({ kind: "error", reason: "offline" });
    else if (result.error.code === "rate_limited") setState({ kind: "error", reason: "too_many" });
    else if (result.status === 404) setState({ kind: "error", reason: "unavailable" });
    else setState({ kind: "error", reason: "failed" });
    focusResult();
  }

  return (
    <CheckView
      locale={locale}
      text={text}
      onText={setText}
      problem={problem}
      state={state}
      onSubmit={submit}
      onAsk={ask}
      inputRef={inputRef}
      resultRef={resultRef}
    />
  );
}
