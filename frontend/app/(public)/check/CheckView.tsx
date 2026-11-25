"use client";

import Link from "next/link";
import type { FormEvent, Ref } from "react";
import { localeTags, formatNumber, type Locale } from "../../../lib/i18n";
import { useT } from "../../../lib/i18n/client";
import type { CheckResponse } from "../../../lib/api/types";
import { EMERGENCY_NUMBER } from "../../../lib/config";
import { Button, ButtonLink } from "../../../ui/Button/Button";
import { TextArea } from "../../../ui/Field/TextArea";
import { PhoneIcon } from "../../../ui/icons";
import { StatusShape } from "../../../ui/StatusBadge/StatusBadge";
import { formatWatDate } from "../_lib/public";
import styles from "./check.module.css";

export const CHECK_MIN = 5;
export const CHECK_MAX = 500;

export type CheckErrorReason = "too_many" | "offline" | "unavailable" | "failed";

export type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "checked"; response: NonNullable<CheckResponse["response"]> }
  | { kind: "not_checked"; ask: "idle" | "asking" | "queued" | "matched" }
  | { kind: "safety" }
  | { kind: "error"; reason: CheckErrorReason };

const ERROR_KEYS: Record<CheckErrorReason, string> = {
  too_many: "p08.error.tooMany",
  offline: "p08.error.offline",
  unavailable: "p08.error.unavailable",
  failed: "p08.error.failed",
};

export type CheckViewProps = {
  locale: Locale;
  text: string;
  onText: (value: string) => void;
  problem: string | null;
  state: CheckState;
  onSubmit: (event: FormEvent) => void;
  onAsk: () => void;
  inputRef?: Ref<HTMLTextAreaElement>;
  resultRef?: Ref<HTMLDivElement>;
};

/** Form plus exactly one result card. Takes everything as props so previews render without the network. */
export function CheckView({ locale, text, onText, problem, state, onSubmit, onAsk, inputRef, resultRef }: CheckViewProps) {
  const t = useT();
  const tag = localeTags[locale];
  return (
    <div className={styles.check}>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <TextArea
          ref={inputRef}
          label={t("p08.label")}
          hint={t("p08.hint")}
          error={problem ?? undefined}
          value={text}
          onChange={(event) => onText(event.target.value)}
          maxLength={CHECK_MAX}
          rows={4}
          data-testid="check-text"
        />
        <div className={styles.submit}>
          <Button type="submit" loading={state.kind === "checking"} loadingLabel={t("p08.checking")} data-testid="check-submit">
            {t("p08.check")}
          </Button>
        </div>
      </form>

      <div ref={resultRef} tabIndex={-1} className={styles.result} aria-live="polite" data-testid="check-result">
        {state.kind === "checked" ? (
          <section className={styles.card} aria-labelledby="p08-checked" data-testid="check-checked">
            <h2 id="p08-checked" tabIndex={-1} data-result-heading className={styles.cardTitle}>{t("p08.checked.title")}</h2>
            <blockquote className={styles.quote}>
              <p>{state.response.text}</p>
            </blockquote>
            {state.response.language !== locale ? <p className={styles.note}>{t("p08.englishOnly")}</p> : null}
            <ul className={styles.facts}>
              {state.response.approved_at ? (
                <li>{t("p08.approvedOn", { date: formatWatDate(state.response.approved_at, tag) })}</li>
              ) : null}
              <li>{t("p08.reviewers")}</li>
              {state.response.observer_support ? (
                <li>
                  {t("p08.support", {
                    states: typeof state.response.observer_support.states === "number" ? formatNumber(state.response.observer_support.states, tag) : t("p08.fewer"),
                    wards: typeof state.response.observer_support.wards === "number" ? formatNumber(state.response.observer_support.wards, tag) : t("p08.fewer"),
                  })}
                </li>
              ) : null}
            </ul>
          </section>
        ) : state.kind === "not_checked" ? (
          <section className={styles.card} aria-labelledby="p08-not" data-testid="check-not-checked">
            {state.ask === "queued" || state.ask === "matched" ? (
              <h2 id="p08-not" tabIndex={-1} data-result-heading className={styles.cardTitle}>
                {t(state.ask === "queued" ? "p08.queued" : "p08.matched")}
              </h2>
            ) : (
              <>
                <h2 id="p08-not" tabIndex={-1} data-result-heading className={styles.cardTitle}>{t("p08.notChecked.title")}</h2>
                <div className={styles.submit}>
                  <Button variant="secondary" onClick={onAsk} loading={state.ask === "asking"} loadingLabel={t("p08.asking")} data-testid="check-ask">
                    {t("p08.ask")}
                  </Button>
                </div>
              </>
            )}
          </section>
        ) : state.kind === "safety" ? (
          <section className={`${styles.card} ${styles.danger}`} aria-labelledby="p08-safety" data-testid="check-safety">
            <h2 id="p08-safety" tabIndex={-1} data-result-heading className={styles.cardTitle}>{t("p08.safety.title")}</h2>
            <div className={styles.submit}>
              <ButtonLink href={`tel:${EMERGENCY_NUMBER}`} variant="danger" icon={<PhoneIcon />} data-testid="check-call">
                {t("p08.safety.call", { number: EMERGENCY_NUMBER })}
              </ButtonLink>
            </div>
            <p className={styles.text}>
              <Link href="/o/new/what?as=citizen" className={styles.link}>{t("p08.safety.report")}</Link>
            </p>
          </section>
        ) : state.kind === "error" ? (
          <div className={styles.problem} role="alert" data-testid="check-error">
            <span className={styles.shape}>
              <StatusShape tone={state.reason === "unavailable" ? "wait" : "danger"} size={18} />
            </span>
            <p className={styles.text}>{t(ERROR_KEYS[state.reason])}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
