"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../../lib/api/client";
import type { AskResponse, Language } from "../../../../lib/api/types";
import { useLocale } from "../../../../lib/i18n/client";
import { useFocusTitle, useNetwork } from "../_lib/network";
import { minutesFrom } from "../_lib/status";
import { useSignedIn } from "../_lib/useSignedIn";
import { AskView, type AskState } from "../_views/AskView";

const SPEECH_LANG: Record<string, string> = { en: "en-NG", pcm: "en-NG", ha: "ha-NG", yo: "yo-NG", ig: "ig-NG" };

/** Guide pages the service worker has kept on this phone (`/guide/<slug>`), titled from their slug. */
async function savedGuides(): Promise<Array<{ title: string; href: string }>> {
  if (typeof caches === "undefined") return [];
  const found = new Map<string, string>();
  try {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        const match = /^\/guide\/([a-z0-9-]+)$/.exec(url.pathname);
        if (match) found.set(url.pathname, match[1].replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()));
      }
    }
  } catch {
    return [];
  }
  return Array.from(found, ([href, title]) => ({ href, title }));
}

/** O-19 Ask ElectraGuard: ASK-01, retrieval only. Questions are not kept on the phone. */
export default function AskPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const { session } = useSignedIn();
  const { offline } = useNetwork();
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AskState>(null);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [retryMinutes, setRetryMinutes] = useState(1);
  const [guides, setGuides] = useState<Array<{ title: string; href: string }>>([]);
  useFocusTitle("o19");

  useEffect(() => {
    void savedGuides().then(setGuides);
  }, []);

  if (!session) return null;

  return (
    <AskView
      offline={offline}
      question={question}
      onQuestion={(text) => {
        setQuestion(text);
        if (state === "empty") setState(null);
      }}
      dictationLang={SPEECH_LANG[locale] ?? "en-NG"}
      onDictated={(text) => setQuestion((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${text}`.slice(0, 500))}
      state={state}
      answer={answer}
      retryMinutes={retryMinutes}
      guides={guides}
      onAsk={async () => {
        const text = question.trim();
        if (text.length < 3) {
          setState("empty");
          return;
        }
        if (state === "asking" || offline) return;
        setState("asking");
        const result = await api("ASK-01", { body: { question: text, language: locale as Language, audience: "observer" } });
        if (result.ok) {
          setAnswer(result.data);
          setState("answer");
        } else if (result.status === 404) {
          setState("unavailable");
        } else if (result.error.code === "validation_failed") {
          setState("empty");
        } else if (result.error.code === "rate_limited") {
          setRetryMinutes(minutesFrom(result.retry_after_seconds, 60));
          setState("rate_limited");
        } else {
          setState("error");
        }
      }}
      onBack={() => router.push("/o")}
    />
  );
}
