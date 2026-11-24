"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n/client";
import { Button } from "../Button/Button";
import { MicIcon, StopIcon } from "../icons";
import styles from "./DictationButton.module.css";

export type DictationState = "idle" | "note" | "listening" | "unavailable" | "denied";

export type DictationButtonProps = {
  /** BCP 47 tag for the speech engine (e.g. "en-NG", "ha-NG"). */
  lang: string;
  /** Called with each final piece of recognised text. */
  onText: (text: string) => void;
  /** Render a fixed state (component gallery and state viewer). */
  state?: DictationState;
  "data-testid"?: string;
};

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart?: (() => void) | null;
};

type RecognitionCtor = new () => Recognition;

const NOTE_KEY = "eg.dictationNoteSeen";
/** Stop after 60 s of speech or 8 s of silence (O-09). */
const MAX_SPEECH_MS = 60_000;
const SILENCE_MS = 8_000;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function noteSeen(): boolean {
  try {
    return window.localStorage.getItem(NOTE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Speak instead of typing. Uses the browser's speech engine where it exists;
 * otherwise explains keyboard voice typing. The first use shows a one-time note
 * that the phone's speech service may process the audio (decision Q6).
 */
export function DictationButton({ lang, onText, state: fixedState, "data-testid": testId = "dictation" }: DictationButtonProps) {
  const t = useT();
  const [ownState, setOwnState] = useState<DictationState>("idle");
  const state = fixedState ?? ownState;
  const recognition = useRef<Recognition | null>(null);
  const silence = useRef<number | undefined>(undefined);
  const limit = useRef<number | undefined>(undefined);
  const stopRef = useRef<HTMLButtonElement>(null);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  });

  useEffect(() => () => recognition.current?.abort(), []);

  useEffect(() => {
    if (state === "listening") stopRef.current?.focus();
  }, [state]);

  function clearTimers() {
    window.clearTimeout(silence.current);
    window.clearTimeout(limit.current);
  }

  function stop() {
    clearTimers();
    recognition.current?.stop();
  }

  function armSilence() {
    window.clearTimeout(silence.current);
    silence.current = window.setTimeout(stop, SILENCE_MS);
  }

  function start() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setOwnState("unavailable");
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event) => {
      armSilence();
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) onTextRef.current(text);
        }
      }
    };
    rec.onerror = (event) => {
      clearTimers();
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setOwnState("denied");
      else if (event.error === "language-not-supported" || event.error === "network" || event.error === "audio-capture") setOwnState("unavailable");
      else setOwnState("idle");
    };
    rec.onend = () => {
      clearTimers();
      setOwnState((current) => (current === "listening" ? "idle" : current));
    };
    recognition.current = rec;
    try {
      rec.start();
      setOwnState("listening");
      armSilence();
      limit.current = window.setTimeout(stop, MAX_SPEECH_MS);
    } catch {
      setOwnState("unavailable");
    }
  }

  function onSpeak() {
    if (!recognitionCtor()) {
      setOwnState("unavailable");
      return;
    }
    if (!noteSeen()) {
      setOwnState("note");
      return;
    }
    start();
  }

  if (state === "listening") {
    return (
      <div className={styles.listening} data-testid={testId}>
        <p className={styles.live} role="status" aria-live="polite">
          <span className={styles.dot} aria-hidden="true" />
          {t("o09.listening")}
        </p>
        <Button ref={stopRef} variant="primary" block icon={<StopIcon />} onClick={stop} data-testid={`${testId}-stop`}>
          {t("o09.stop")}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.wrap} data-testid={testId}>
      <Button variant="secondary" block icon={<MicIcon />} onClick={onSpeak} data-testid={`${testId}-speak`}>
        {t("o09.speak")}
      </Button>
      {state === "note" ? (
        <div className={styles.note} role="status">
          <p>{t("o09.speakNote")}</p>
          <Button
            variant="secondary"
            onClick={() => {
              try {
                window.localStorage.setItem(NOTE_KEY, "1");
              } catch {
                // Private mode: the note shows again next time.
              }
              start();
            }}
            data-testid={`${testId}-note-ok`}
          >
            {t("o09.speakNoteOk")}
          </Button>
        </div>
      ) : null}
      {state === "unavailable" ? (
        <p className={styles.info} role="status" data-testid={`${testId}-unavailable`}>
          {t("o09.speakUnavailable")}
        </p>
      ) : null}
      {state === "denied" ? (
        <p className={styles.info} role="status" data-testid={`${testId}-denied`}>
          {t("o09.micDenied")}
        </p>
      ) : null}
    </div>
  );
}
