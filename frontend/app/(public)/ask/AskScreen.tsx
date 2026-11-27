"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { api } from "../../../lib/api/client";
import type { AskResponse } from "../../../lib/api/types";
import { useLocale, useT } from "../../../lib/i18n/client";
import { localeTags } from "../../../lib/i18n";
import { Button } from "../../../ui/Button/Button";
import { TextArea } from "../../../ui/Field/TextArea";
import { DictationCorner, DictationStatus, useDictation } from "../../../ui/DictationButton/DictationButton";
import { RichText } from "../../../ui/RichText/RichText";
import { FileIcon } from "../../../ui/icons";
import { StatusShape } from "../../../ui/StatusBadge/StatusBadge";
import styles from "./ask.module.css";

export type AskState =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "answered"; question: string; data: AskResponse }
  | { kind: "abstained"; question: string }
  | { kind: "too_many" }
  | { kind: "offline" }
  | { kind: "unavailable" }
  | { kind: "error" };

const MIN = 3;
const MAX = 500;

/**
 * P-04 Ask ElectraGuard (ASK-01). Shows approved passages quoted exactly, each with its
 * source, or says plainly that there is no approved answer. Nothing is generated here
 * and nothing is presented as advice.
 */
export function AskScreen({ initial = { kind: "idle" }, initialQuestion = "" }: { initial?: AskState; initialQuestion?: string }) {
  const t = useT();
  const { locale } = useLocale();
  const [question, setQuestion] = useState(initialQuestion);
  const [problem, setProblem] = useState<string | null>(null);
  const [state, setState] = useState<AskState>(initial);
  const answerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation(localeTags[locale], (text) => setQuestion((current) => (current ? `${current} ${text}` : text).slice(0, MAX)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if ([...text].length < MIN) {
      setProblem(t("p04.tooShort"));
      inputRef.current?.focus();
      return;
    }
    setProblem(null);
    setState({ kind: "asking" });
    const result = await api("ASK-01", { body: { question: text, language: locale, audience: "public" } });
    if (result.ok) {
      setState(result.data.status === "answered" && result.data.passages.length > 0
        ? { kind: "answered", question: text, data: result.data }
        : { kind: "abstained", question: text });
    } else if (result.status === 0) setState({ kind: "offline" });
    else if (result.error.code === "rate_limited") setState({ kind: "too_many" });
    else if (result.status === 404) setState({ kind: "unavailable" });
    else if (result.error.code === "validation_failed") {
      setState({ kind: "idle" });
      setProblem(t("p04.tooLong"));
    } else setState({ kind: "error" });
    requestAnimationFrame(() => answerRef.current?.focus());
  }

  function again() {
    setQuestion("");
    setState({ kind: "idle" });
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className={styles.ask}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextArea
          ref={inputRef}
          label={t("p04.label")}
          hint={t("p04.hint")}
          error={problem ?? undefined}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={MAX}
          rows={3}
          adornment={<DictationCorner dictation={dictation} />}
          data-testid="ask-question"
        />
        <DictationStatus dictation={dictation} />
        <div className={styles.submit}>
          <Button type="submit" loading={state.kind === "asking"} loadingLabel={t("p04.asking")} data-testid="ask-submit">
            {t("p04.ask")}
          </Button>
        </div>
      </form>

      {state.kind === "asking" ? (
        <p className={styles.thinking} data-testid="ask-thinking">
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span className="eg-sr-only">{t("p04.asking")}</span>
        </p>
      ) : null}
      <div ref={answerRef} tabIndex={-1} className={styles.answer} aria-live="polite" data-testid="ask-answer">
        {state.kind === "answered" ? (
          <section aria-labelledby="p04-answer">
            <h2 id="p04-answer" className={styles.answerTitle}>{t("p04.answered")}</h2>
            {state.data.fallback_language_used ? <p className={styles.note}>{t("p04.fallback")}</p> : null}
            <ol className={styles.passages}>
              {state.data.passages.map((passage, index) => (
                <li key={`${passage.source.document_id}-${index}`}>
                  <figure className={styles.passage}>
                    <blockquote lang={localeTags[passage.source.language]} cite={passage.source.url}>
                      <RichText text={passage.text} />
                    </blockquote>
                    <figcaption className={styles.source}>
                      <span className={styles.sourceTitle}>
                        <FileIcon size={20} aria-hidden="true" />
                        {t("p04.source", { title: passage.source.title, section: passage.source.section })}
                      </span>
                      <span className={styles.version}>{t("p04.version", { version: passage.source.version })}</span>
                      {passage.source.url.startsWith("/") ? (
                        <Link href={passage.source.url} className={styles.sourceLink}>
                          {t("p04.openSource")}
                        </Link>
                      ) : null}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ol>
            <button type="button" className={styles.again} onClick={again}>
              {t("p04.again")}
            </button>
          </section>
        ) : state.kind === "abstained" ? (
          <section className={styles.abstain} aria-labelledby="p04-abstain" data-testid="ask-abstained">
            <span className={styles.shape}>
              <StatusShape tone="wait" size={18} />
            </span>
            <div>
              <h2 id="p04-abstain" className={styles.answerTitle}>{t("p04.abstain.title")}</h2>
              <p className={styles.text}>{t("p04.abstain.body")}</p>
              <p className={styles.links}>
                <Link href="/guide">{t("p04.guides")}</Link>
                <button type="button" className={styles.again} onClick={again}>
                  {t("p04.again")}
                </button>
              </p>
            </div>
          </section>
        ) : state.kind === "too_many" || state.kind === "offline" || state.kind === "unavailable" || state.kind === "error" ? (
          <div className={styles.problem} role="alert">
            <span className={styles.shape}>
              <StatusShape tone={state.kind === "unavailable" ? "wait" : "danger"} size={18} />
            </span>
            <div>
              <p className={styles.text}>{t(`p04.${state.kind === "too_many" ? "tooMany" : state.kind}`)}</p>
              {state.kind === "unavailable" ? (
                <p className={styles.links}>
                  <Link href="/guide">{t("p04.guides")}</Link>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
