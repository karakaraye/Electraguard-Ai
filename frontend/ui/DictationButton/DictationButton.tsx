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

type Dictation = {
  state: DictationState;
  speak: () => void;
  stop: () => void;
  acceptNote: () => void;
};

/** Moves focus to the Stop button when listening starts, so a keyboard or TalkBack user can stop at once. */
function useFocusOnListen(state: DictationState) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (state === "listening") ref.current?.focus();
  }, [state]);
  return ref;
}

/**
 * Speak instead of typing. Uses the browser's speech engine where it exists;
 * otherwise explains keyboard voice typing. The first use shows a one-time note
 * that the phone's speech service may process the audio (decision Q6).
 */
export function useDictation(lang: string, onText: (text: string) => void, fixedState?: DictationState): Dictation {
  const [ownState, setOwnState] = useState<DictationState>("idle");
  const state = fixedState ?? ownState;
  const recognition = useRef<Recognition | null>(null);
  const silence = useRef<number | undefined>(undefined);
  const limit = useRef<number | undefined>(undefined);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  });

  useEffect(() => () => recognition.current?.abort(), []);

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

  function speak() {
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

  function acceptNote() {
    try {
      window.localStorage.setItem(NOTE_KEY, "1");
    } catch {
      // Private mode: the note shows again next time.
    }
    start();
  }

  return { state, speak, stop, acceptNote };
}

/**
 * The round mic button that sits in a text field's corner. While listening it
 * becomes Stop, with a still ring that says the phone is hearing you. Hidden
 * when the phone has no speech engine.
 */
export function DictationCorner({ dictation, "data-testid": testId = "dictation" }: { dictation: Dictation; "data-testid"?: string }) {
  const t = useT();
  const stopRef = useFocusOnListen(dictation.state);
  if (dictation.state === "unavailable") return null;
  const listening = dictation.state === "listening";
  return (
    <button
      ref={stopRef}
      type="button"
      className={styles.corner}
      data-listening={listening || undefined}
      onClick={listening ? dictation.stop : dictation.speak}
      data-testid={listening ? `${testId}-stop` : `${testId}-speak`}
    >
      {listening ? <StopIcon size={22} aria-hidden="true" /> : <MicIcon size={24} aria-hidden="true" />}
      <span className="eg-sr-only">{t(listening ? "o09.stop" : "o09.speak")}</span>
    </button>
  );
}

/** What dictation needs to say: listening, the one-time note, no microphone, or no speech engine. */
export function DictationStatus({ dictation, "data-testid": testId = "dictation" }: { dictation: Dictation; "data-testid"?: string }) {
  const t = useT();
  const { state } = dictation;
  if (state === "listening") {
    return (
      <p className={styles.live} role="status" aria-live="polite" data-testid={`${testId}-listening`}>
        <span className={styles.dot} aria-hidden="true" />
        {t("o09.listening")}
      </p>
    );
  }
  if (state === "note") {
    return (
      <div className={styles.note} role="status">
        <p>{t("o09.speakNote")}</p>
        <Button variant="secondary" onClick={dictation.acceptNote} data-testid={`${testId}-note-ok`}>
          {t("o09.speakNoteOk")}
        </Button>
      </div>
    );
  }
  if (state === "unavailable" || state === "denied") {
    return (
      <p className={styles.info} role="status" data-testid={`${testId}-${state}`}>
        {t(state === "denied" ? "o09.micDenied" : "o09.speakUnavailable")}
      </p>
    );
  }
  return null;
}

/** The stand-alone form (used where there is no field to sit in): a full-width Speak or Stop button. */
export function DictationButton({ lang, onText, state: fixedState, "data-testid": testId = "dictation" }: DictationButtonProps) {
  const t = useT();
  const dictation = useDictation(lang, onText, fixedState);
  const stopRef = useFocusOnListen(dictation.state);

  if (dictation.state === "listening") {
    return (
      <div className={styles.listening} data-testid={testId}>
        <DictationStatus dictation={dictation} data-testid={testId} />
        <Button ref={stopRef} variant="primary" block icon={<StopIcon />} onClick={dictation.stop} data-testid={`${testId}-stop`}>
          {t("o09.stop")}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.wrap} data-testid={testId}>
      <Button variant="secondary" block icon={<MicIcon />} onClick={dictation.speak} data-testid={`${testId}-speak`}>
        {t("o09.speak")}
      </Button>
      <DictationStatus dictation={dictation} data-testid={testId} />
    </div>
  );
}
