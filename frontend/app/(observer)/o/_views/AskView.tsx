"use client";

/* O-19 Ask ElectraGuard: answers only as quoted passages from approved guides, with the source. */

import type { AskResponse, Language } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { localeNames } from "../../../../lib/i18n/config";
import { AppShell, Banner, Button, DictationCorner, DictationStatus, TextArea, useDictation } from "../../../../ui";
import { FileIcon, HelpIcon, InfoIcon } from "../../../../ui/icons";
import styles from "../_components/observer.module.css";
import s from "../_components/screens.module.css";

export type AskState = null | "asking" | "answer" | "empty" | "error" | "unavailable" | "rate_limited";

export type AskViewProps = {
  offline: boolean;
  question: string;
  onQuestion: (text: string) => void;
  dictationLang: string;
  onDictated: (text: string) => void;
  state: AskState;
  answer: AskResponse | null;
  retryMinutes: number;
  guides: Array<{ title: string; href: string }>;
  onAsk: () => void;
  onBack: () => void;
};

export function AskView(props: AskViewProps) {
  const t = useT();
  const { offline, state, answer } = props;
  const dictation = useDictation(props.dictationLang, props.onDictated);
  return (
    <AppShell title={t("o19.appTitle")} onBack={props.onBack} offline={offline} data-testid="o19">
      <div className={styles.screen}>
        <h1 className={styles.title}>{t("o19.title")}</h1>
        <p className={styles.note} data-testid="o19-note">
          <InfoIcon />
          <span>{t("o19.note")}</span>
        </p>
        <TextArea
          label={t("o19.label")}
          hint={t("o19.hint")}
          value={props.question}
          onChange={(event) => props.onQuestion(event.target.value)}
          maxLength={500}
          rows={3}
          error={state === "empty" ? t("o19.empty") : undefined}
          adornment={<DictationCorner dictation={dictation} />}
          data-testid="o19-question"
        />
        <DictationStatus dictation={dictation} />
        <Button block disabled={offline} loading={state === "asking"} loadingLabel={t("o19.asking")} onClick={props.onAsk} data-testid="o19-ask">
          {t("o19.ask")}
        </Button>
        {offline ? <p className={styles.note}>{t("o19.offline")}</p> : null}

        {state === "asking" ? (
          <p className={s.thinking} data-testid="o19-thinking">
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span className="eg-sr-only">{t("o19.asking")}</span>
          </p>
        ) : null}
        <div aria-live="polite" className={styles.stack} data-testid="o19-answer">
          {state === "error" ? <Banner tone="attn" title={t("o19.error")} action={<Button variant="secondary" onClick={props.onAsk}>{t("ui.retry")}</Button>} /> : null}
          {state === "unavailable" ? <Banner tone="wait" title={t("common.error.unavailable")} /> : null}
          {state === "rate_limited" ? <Banner tone="attn" title={t("common.error.tooManyTries", { minutes: props.retryMinutes })} /> : null}
          {state === "answer" && answer ? (
            answer.status === "abstained" || answer.passages.length === 0 ? (
              <div className={s.abstain} data-testid="o19-no-answer">
                <span className={s.outcomeDisc} aria-hidden="true">
                  <HelpIcon size={24} />
                </span>
                <p>{t("o19.noAnswer")}</p>
              </div>
            ) : (
              <>
                <p className="eg-sr-only">{t("o19.ready")}</p>
                {answer.fallback_language_used ? (
                  <p className={s.fallbackChip}>{t("o19.otherLanguage", { language: localeNames[answer.passages[0]?.source.language as Language] ?? "English" })}</p>
                ) : null}
                {answer.passages.map((passage, index) => (
                  <blockquote key={`${passage.source.document_id}-${index}`} className={s.quote} cite={passage.source.url} lang={passage.source.language}>
                    <p>{passage.text}</p>
                    <div className={s.quoteSource}>
                      <span className={s.sourceRow}>
                        <FileIcon size={20} aria-hidden="true" />
                        <span>
                          {t("o19.source", { title: passage.source.title })} · {passage.source.section} · {t("o19.version", { version: passage.source.version })}
                        </span>
                      </span>
                      <a className={s.textLink} href={passage.source.url} data-testid="o19-open-source">
                        {t("o19.openSourceNamed", { title: passage.source.title })}
                      </a>
                    </div>
                  </blockquote>
                ))}
              </>
            )
          ) : null}
        </div>

        <section className={styles.tight} aria-labelledby="o19-guides">
          <h2 className={styles.sectionTitle} id="o19-guides">
            {t("o19.savedGuides")}
          </h2>
          {props.guides.length ? (
            <ul className={s.guides}>
              {props.guides.map((guide) => (
                <li key={guide.href}>
                  <a className={s.menuLink} href={guide.href}>
                    {guide.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.meta} data-testid="o19-no-guides">
              {t("o19.noGuides")}
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
