"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { api } from "../../../lib/api/client";
import type { ReceiptStatusResponse } from "../../../lib/api/types";
import { useLocale, useT } from "../../../lib/i18n/client";
import { localeTags } from "../../../lib/i18n";
import { Button } from "../../../ui/Button/Button";
import { Field } from "../../../ui/Field/Field";
import { StatusBadge } from "../../../ui/StatusBadge/StatusBadge";
import { formatWatDate, normaliseReceiptCode, OUTCOME_KEYS, STATUS_EXPLAIN_KEYS } from "../_lib/public";
import styles from "./receipt.module.css";

export type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "format" }
  | { kind: "found"; data: ReceiptStatusResponse }
  | { kind: "not_found" }
  | { kind: "too_many" }
  | { kind: "offline" }
  | { kind: "unavailable" };

/**
 * Check a report by its receipt code (REP-06). The code is checked on the phone first
 * (shape and check symbol), so a typo never costs a request. Shows status and outcome
 * only, with dates and no times: exactly what the contract returns.
 */
export function ReceiptCheck({ initial = { kind: "idle" }, initialCode = "" }: { initial?: CheckState; initialCode?: string }) {
  const t = useT();
  const { locale } = useLocale();
  const tag = localeTags[locale];
  const [code, setCode] = useState(initialCode);
  const [state, setState] = useState<CheckState>(initial);
  const resultRef = useRef<HTMLDivElement>(null);
  const id = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normal = normaliseReceiptCode(code);
    if (!normal) {
      setState({ kind: "format" });
      return;
    }
    setCode(normal);
    setState({ kind: "checking" });
    const result = await api("REP-06", { params: { receipt_code: normal } });
    if (result.ok) setState({ kind: "found", data: result.data });
    else if (result.status === 0) setState({ kind: "offline" });
    else if (result.error.code === "receipt_code_invalid") setState({ kind: "format" });
    else if (result.error.code === "rate_limited") setState({ kind: "too_many" });
    // A contract 404 carries the JSON error body; a bare 404 (no message of its own) means the endpoint is not deployed.
    else if (result.status === 404 && result.error.message && result.error.message !== "Not Found") setState({ kind: "not_found" });
    else setState({ kind: "unavailable" });
    requestAnimationFrame(() => resultRef.current?.focus());
  }

  const error = state.kind === "format" ? t("p01.formatError") : undefined;

  return (
    <div className={styles.check}>
      <form className={styles.form} onSubmit={submit} noValidate aria-describedby={`${id}-result`}>
        <Field
          label={t("p01.label")}
          hint={t("p01.hint")}
          error={error}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          maxLength={20}
          numeric
          data-testid="receipt-code"
        />
        <Button type="submit" variant="secondary" loading={state.kind === "checking"} loadingLabel={t("p01.checking")} data-testid="receipt-check">
          {t("p01.check")}
        </Button>
      </form>

      <div id={`${id}-result`} ref={resultRef} tabIndex={-1} className={styles.result} aria-live="polite" data-testid="receipt-result">
        {state.kind === "found" ? (
          <div className={styles.found}>
            <p className={`${styles.code} eg-tnum`}>{state.data.receipt_code}</p>
            <StatusBadge status={state.data.status === "in_review" ? "in-review" : state.data.status} size="lg" />
            <p className={styles.explain}>{t(STATUS_EXPLAIN_KEYS[state.data.status])}</p>
            {state.data.status === "closed" && state.data.outcome ? (
              <p className={styles.outcome}>{t("p02.check.outcome", { outcome: t(OUTCOME_KEYS[state.data.outcome]) })}</p>
            ) : null}
            {state.data.has_open_question ? <p className={styles.question}>{t("p02.check.question")}</p> : null}
            <dl className={styles.dates}>
              <div>
                <dt>{t("p02.check.receivedLabel")}</dt>
                <dd>{formatWatDate(state.data.received_on, tag)}</dd>
              </div>
              <div>
                <dt>{t("p02.check.updatedLabel")}</dt>
                <dd>{formatWatDate(state.data.updated_on, tag)}</dd>
              </div>
            </dl>
          </div>
        ) : state.kind === "not_found" ? (
          <p className={styles.problem}>{t("p01.notFound")}</p>
        ) : state.kind === "too_many" ? (
          <p className={styles.problem}>{t("p02.check.tooMany")}</p>
        ) : state.kind === "offline" ? (
          <p className={styles.problem}>{t("p01.offline")}</p>
        ) : state.kind === "unavailable" ? (
          <p className={styles.problem}>{t("p02.check.unavailable")}</p>
        ) : null}
      </div>
    </div>
  );
}
