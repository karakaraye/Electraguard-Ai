"use client";

import { useState, type ReactNode } from "react";
import type { CaseDetail, Category, Outcome, Urgency } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { Banner, Button, SuggestionCard, TextArea, Timeline } from "../../../../ui";
import { CheckIcon, InfoIcon, ShieldCheckIcon } from "../../../../ui/icons";
import styles from "./CaseView.module.css";

const LANGUAGE_NAMES: Record<string, string> = {
  ha: "Hausa",
  yo: "Yoruba",
  ig: "Igbo",
  pcm: "Pidgin",
  en: "English",
};

export interface CaseViewProps {
  caseData: CaseDetail | null;
  loading: boolean;
  error: string | null;
  onStartReview?: () => void;
  onAskQuestion?: (question: string) => void;
  onCloseCase?: (outcome: Outcome, rationale: string, expectedMediaIds: string[]) => void;
  onAcceptSuggestion?: (type: "category" | "urgency") => void;
  onCorrectSuggestion?: (type: "category" | "urgency", value: string) => void;
  onDuplicateDecision?: (otherId: string, decision: "link" | "keep_separate") => void;
  onSaveRedaction?: (spans: Array<{ start: number; end: number }>) => void;
  "data-testid"?: string;
}

export function CaseView({
  caseData,
  loading,
  error,
  onStartReview,
  onAskQuestion,
  onCloseCase,
  onAcceptSuggestion,
  onCorrectSuggestion,
  onDuplicateDecision,
  onSaveRedaction,
  "data-testid": testId = "case-view",
}: CaseViewProps) {
  const t = useT();

  // Action states
  const [questionText, setQuestionText] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("corroborated");
  const [rationale, setRationale] = useState("");
  const [correctCategory, setCorrectCategory] = useState<Category>("intimidation_violence");
  const [correctUrgency, setCorrectUrgency] = useState<Urgency>("normal");
  const [showCorrectCategory, setShowCorrectCategory] = useState(false);
  const [showCorrectUrgency, setShowCorrectUrgency] = useState(false);

  // Redaction state
  const [spans, setSpans] = useState<Array<{ start: number; end: number }>>(
    () => caseData?.original.redactions || []
  );
  const [selectedText, setSelectedText] = useState("");
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [showWordList, setShowWordList] = useState(false);

  if (error) {
    return (
      <div className={styles.container} data-testid={testId}>
        <Banner tone="danger" title={error} critical />
      </div>
    );
  }

  if (loading || !caseData) {
    return (
      <div className={styles.container} data-testid={testId}>
        <div style={{ padding: "var(--s-4)", textAlign: "center", color: "var(--ink-2)" }}>
          {t("staff.loading")}
        </div>
      </div>
    );
  }

  const allowed = caseData.allowed_actions || [];
  const canStart = caseData.status === "received";
  const canAsk = allowed.includes("ask") || caseData.status === "in_review";
  const canClose = allowed.includes("close") || caseData.status === "in_review" || caseData.status === "question";

  // Redaction helper methods & words
  const originalText = caseData.original?.description || "";
  const langName = caseData.language ? (LANGUAGE_NAMES[caseData.language] || caseData.language) : "English";

  const originalWords = Array.from(
    new Set(
      originalText
        .split(/\s+/)
        .map((w) => w.replace(/^[^\w]+|[^\w]+$/g, ""))
        .filter((w) => w.length >= 3)
    )
  );

  const isWordRedacted = (word: string) => {
    return spans.some((s) => {
      const slice = originalText.slice(s.start, s.end).toLowerCase();
      return slice === word.toLowerCase();
    });
  };

  const handleToggleWord = (word: string) => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    let match;
    const newSpans = [...spans];
    let matched = false;
    while ((match = regex.exec(originalText)) !== null) {
      matched = true;
      const start = match.index;
      const end = start + word.length;
      const already = spans.some((s) => s.start === start && s.end === end);
      if (already) {
        setSpans(spans.filter((s) => !(s.start === start && s.end === end)));
        return;
      } else {
        newSpans.push({ start, end });
      }
    }
    if (matched) {
      setSpans(newSpans);
    }
  };

  const handleTextSelection = () => {
    if (typeof window === "undefined") return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const txt = sel.toString().trim();
    if (!txt || txt.length < 2) return;
    const idx = originalText.indexOf(txt);
    if (idx !== -1) {
      setSelectedText(txt);
      setSelectionRange({ start: idx, end: idx + txt.length });
    }
  };

  const handleAddSelectionSpan = () => {
    if (selectionRange) {
      const already = spans.some((s) => s.start === selectionRange.start && s.end === selectionRange.end);
      if (!already) {
        setSpans([...spans, selectionRange]);
      }
      setSelectedText("");
      setSelectionRange(null);
      if (typeof window !== "undefined") {
        window.getSelection()?.removeAllRanges();
      }
    }
  };

  const renderRedactedDescription = () => {
    if (!originalText) return null;
    if (spans.length === 0) return <span>{originalText}</span>;

    const sorted = [...spans].sort((a, b) => a.start - b.start);
    const segments: ReactNode[] = [];
    let lastIdx = 0;

    sorted.forEach((span, idx) => {
      if (span.start > lastIdx) {
        segments.push(
          <span key={`text-${lastIdx}`}>{originalText.slice(lastIdx, span.start)}</span>
        );
      }
      segments.push(
        <mark key={`redact-${idx}`} className={styles.redactedMark}>
          <span>{t("s03.redaction.hidden")}</span>
          <button
            type="button"
            className={styles.undoRedactionBtn}
            onClick={(e) => {
              e.stopPropagation();
              setSpans(spans.filter((_, i) => i !== idx));
            }}
            title={t("s03.redaction.undo")}
            aria-label={`${t("s03.redaction.undo")} ${originalText.slice(span.start, span.end)}`}
          >
            ×
          </button>
        </mark>
      );
      lastIdx = Math.max(lastIdx, span.end);
    });

    if (lastIdx < originalText.length) {
      segments.push(
        <span key={`text-${lastIdx}`}>{originalText.slice(lastIdx)}</span>
      );
    }

    return segments;
  };

  const timelineEvents = (caseData.history?.events || []).map((ev) => ({
    id: ev.id,
    actor: ev.actor_label,
    at: ev.created_at,
    change: ev.action,
    detail: JSON.stringify(ev.change),
  }));

  return (
    <div className={styles.container} data-testid={testId}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.caseTitle}>
            {t("s03.caseRef", { ref: caseData.receipt_code })}
          </h2>
          <span className={styles.reporterTag}>
            {caseData.reporter.type === "observer"
              ? t("s03.reporter.observer", { code: caseData.reporter.label })
              : t("s03.reporter.citizen", { code: caseData.reporter.label })}
          </span>
        </div>
      </div>

      {/* Result sheet warning banner if result sheet */}
      {(caseData.kind === "result_sheet" || caseData.result_sheet_flags.length > 0) && (
        <div className={styles.resultSheetNotice}>
          <p>{t("s03.resultSheet.disclaimer")}</p>
        </div>
      )}

      {/* Description & Translation */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("s03.originalText")}</h3>
        <p className={styles.textBlock}>
          {caseData.original.redacted_description || caseData.original.description}
        </p>
        <span className={styles.translationLabel}>
          <InfoIcon size={14} />
          <span>{t("s03.language", { lang: langName })}</span>
        </span>

        {caseData.translation?.text && (
          <div style={{ marginTop: "var(--s-2)" }}>
            <span className={styles.translationLabel}>
              {t("s03.translation")}
            </span>
            <p className={styles.textBlock}>{caseData.translation.text}</p>
          </div>
        )}
      </section>

      {/* Redaction Tool */}
      <section className={styles.section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--s-2)" }}>
          <h3 className={styles.sectionTitle}>{t("s03.redaction.title")}</h3>
          <Button
            type="button"
            variant="quiet"
            onClick={() => setShowWordList(!showWordList)}
          >
            {showWordList ? "Hide word list" : "Choose words to hide"}
          </Button>
        </div>
        <p style={{ color: "var(--ink-2)", fontSize: "0.875rem", margin: 0 }}>
          {t("s03.redaction.hint")}
        </p>

        {showWordList && (
          <div className={styles.wordChecklist}>
            {originalWords.map((word) => {
              const active = isWordRedacted(word);
              return (
                <button
                  key={word}
                  type="button"
                  className={styles.wordBtn}
                  data-active={active}
                  onClick={() => handleToggleWord(word)}
                >
                  {active ? `✓ ${word} (Hidden)` : word}
                </button>
              );
            })}
          </div>
        )}

        <div className={styles.redactBox}>
          <div>
            <span style={{ fontSize: "0.8125rem", color: "var(--ink-2)", display: "block", marginBottom: "4px" }}>
              Select text below to redact personal names:
            </span>
            <div
              className={styles.selectableText}
              onMouseUp={handleTextSelection}
              onTouchEnd={handleTextSelection}
            >
              {renderRedactedDescription()}
            </div>
          </div>

          {selectedText && selectionRange && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", background: "var(--paper)", padding: "var(--s-3)", borderRadius: "var(--radius)", border: "1px solid var(--rule)" }}>
              <span>Selection: <strong>&ldquo;{selectedText}&rdquo;</strong></span>
              <Button type="button" variant="primary" onClick={handleAddSelectionSpan}>
                {t("s03.redaction.hideThisName")}
              </Button>
              <Button type="button" variant="quiet" onClick={() => { setSelectedText(""); setSelectionRange(null); }}>
                Cancel
              </Button>
            </div>
          )}

          <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center", flexWrap: "wrap" }}>
            <Button
              type="button"
              variant="primary"
              onClick={() => onSaveRedaction?.(spans)}
            >
              {t("s03.redaction.save")}
            </Button>
            {spans.length > 0 && (
              <Button
                type="button"
                variant="quiet"
                onClick={() => setSpans([])}
              >
                {t("s03.redaction.clearSpans")} ({spans.length})
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Evidence & Integrity */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("s03.evidence.title")}</h3>
        {caseData.media.length === 0 ? (
          <p style={{ color: "var(--ink-2)" }}>{t("s03.evidence.noEvidence")}</p>
        ) : (
          <div className={styles.evidenceGrid}>
            {caseData.media.map((med) => (
              <div key={med.id} className={styles.evidenceCard}>
                <strong>{med.kind.toUpperCase()}</strong>
                {med.kind === "photo" && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/api/v1/media/${med.id}/content?variant=thumb`}
                    alt="Evidence photo"
                    style={{ maxWidth: "100%", maxHeight: "200px", objectFit: "contain", borderRadius: "var(--radius)" }}
                  />
                )}
                {med.kind === "video" && (
                  <video
                    src={`/api/v1/media/${med.id}/content?variant=display`}
                    poster={`/api/v1/media/${med.id}/content?variant=poster`}
                    controls
                    style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "var(--radius)" }}
                  />
                )}
                {med.kind === "audio" && (
                  <audio
                    src={`/api/v1/media/${med.id}/content?variant=display`}
                    controls
                    style={{ width: "100%" }}
                  />
                )}
                <div className={styles.integrityMarks}>
                  <div className={styles.integrityRow} data-ok={med.integrity_verified}>
                    <ShieldCheckIcon size={14} />
                    <span>{t("s03.evidence.sha256")}</span>
                  </div>
                  <div className={styles.integrityRow} data-ok={med.exif_removed}>
                    <CheckIcon size={14} />
                    <span>{t("s03.evidence.exifRemoved")}</span>
                  </div>
                  <div className={styles.integrityRow} data-ok={med.blurred}>
                    <CheckIcon size={14} />
                    <span>{t("s03.evidence.blurred")}</span>
                  </div>
                </div>
                {med.transcript && (
                  <div>
                    <strong>{t("s03.evidence.transcript")}:</strong>
                    <p style={{ fontSize: "0.875rem" }}>{med.transcript.text}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI Suggestions (Accept / Correct) */}
      {caseData.suggestions && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("s03.suggestions.title")}</h3>
          <p style={{ fontSize: "0.875rem", color: "var(--ink-2)" }}>
            {t("s03.suggestions.notice")}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            {/* Category Suggestion */}
            {caseData.suggestions.category && (
              <div>
                <SuggestionCard
                  field="Category"
                  value={caseData.suggestions.category.value}
                  confidence={caseData.suggestions.category.confidence || "medium"}
                  reasons={caseData.suggestions.category.reasons}
                  state={
                    caseData.suggestions.category.decision === "accepted"
                      ? "accepted"
                      : caseData.suggestions.category.decision === "corrected"
                      ? "corrected"
                      : "pending"
                  }
                  correctedValue={caseData.suggestions.category.corrected_value}
                  onAccept={() => onAcceptSuggestion?.("category")}
                  onCorrect={() => setShowCorrectCategory(!showCorrectCategory)}
                />
                {showCorrectCategory && (
                  <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
                    <select
                      className="eg-select"
                      value={correctCategory}
                      onChange={(e) => setCorrectCategory(e.target.value as Category)}
                    >
                      <option value="intimidation_violence">Intimidation / Violence</option>
                      <option value="vote_buying">Vote Buying</option>
                      <option value="late_materials">Late Materials</option>
                      <option value="bvas_malfunction">BVAS Malfunction</option>
                      <option value="queues_crowding">Queues / Crowding</option>
                      <option value="other">Other</option>
                    </select>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        onCorrectSuggestion?.("category", correctCategory);
                        setShowCorrectCategory(false);
                      }}
                    >
                      {t("s03.suggestions.saveCorrection")}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Urgency Suggestion */}
            {caseData.suggestions.urgency && (
              <div>
                <SuggestionCard
                  field="Urgency"
                  value={caseData.suggestions.urgency.value}
                  confidence={caseData.suggestions.urgency.confidence || "medium"}
                  reasons={caseData.suggestions.urgency.reasons}
                  state={
                    caseData.suggestions.urgency.decision === "accepted"
                      ? "accepted"
                      : caseData.suggestions.urgency.decision === "corrected"
                      ? "corrected"
                      : "pending"
                  }
                  correctedValue={caseData.suggestions.urgency.corrected_value}
                  onAccept={() => onAcceptSuggestion?.("urgency")}
                  onCorrect={() => setShowCorrectUrgency(!showCorrectUrgency)}
                />
                {showCorrectUrgency && (
                  <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
                    <select
                      className="eg-select"
                      value={correctUrgency}
                      onChange={(e) => setCorrectUrgency(e.target.value as Urgency)}
                    >
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="normal">Normal</option>
                      <option value="low">Low</option>
                    </select>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        onCorrectSuggestion?.("urgency", correctUrgency);
                        setShowCorrectUrgency(false);
                      }}
                    >
                      {t("s03.suggestions.saveCorrection")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Duplicate Candidates (Side by side) */}
      {caseData.duplicates.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("s03.duplicates.title")}</h3>
          <div className={styles.duplicateGrid}>
            {caseData.duplicates.map((dup) => (
              <div key={dup.report_id} className={styles.duplicateCard}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{dup.receipt_code || "Unknown"}</strong>
                  <span>{t("s03.duplicates.similarity", { percent: Math.round(dup.score * 100) })}</span>
                </div>
                {!dup.accessible ? (
                  <p style={{ color: "var(--ink-2)", fontSize: "0.875rem" }}>
                    {t("s03.duplicates.inaccessible")}
                  </p>
                ) : (
                  <p style={{ fontSize: "0.875rem" }}>{dup.summary.description}</p>
                )}
                <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
                  <Button
                    type="button"
                    variant={dup.decision === "linked" ? "primary" : "secondary"}
                    onClick={() => onDuplicateDecision?.(dup.report_id, "link")}
                  >
                    {t("s03.duplicates.link")}
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => onDuplicateDecision?.(dup.report_id, "keep_separate")}
                  >
                    {t("s03.duplicates.keepSeparate")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Actions */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("s03.actions.title")}</h3>

        <div className={styles.actionsGroup}>
          {canStart && (
            <div>
              <Button type="button" variant="primary" onClick={onStartReview}>
                {t("s03.actions.startReview")}
              </Button>
            </div>
          )}

          {canAsk && (
            <div className={styles.actionForm}>
              <h4>{t("s03.actions.askQuestion")}</h4>
              <TextArea
                id="ask-question"
                label={t("s03.actions.questionLabel")}
                hint={t("s03.actions.questionHint")}
                maxLength={2000}
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
              />
              <div>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!questionText.trim()}
                  onClick={() => {
                    onAskQuestion?.(questionText);
                    setQuestionText("");
                  }}
                >
                  {t("s03.actions.submitQuestion")}
                </Button>
              </div>
            </div>
          )}

          {canClose && (
            <div className={styles.actionForm}>
              <h4>{t("s03.actions.closeCase")}</h4>
              <div>
                <label htmlFor="close-outcome">
                  <strong>{t("s03.actions.outcomeLabel")}</strong>
                </label>
                <select
                  id="close-outcome"
                  className="eg-select"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as Outcome)}
                  style={{ display: "block", marginTop: "var(--s-1)" }}
                >
                  <option value="corroborated">{t("s03.actions.outcome.corroborated")}</option>
                  <option value="insufficient_evidence">
                    {t("s03.actions.outcome.insufficient_evidence")}
                  </option>
                  <option value="out_of_scope">{t("s03.actions.outcome.out_of_scope")}</option>
                </select>
              </div>

              <TextArea
                id="close-rationale"
                label={t("s03.actions.rationaleLabel")}
                hint={t("s03.actions.rationaleHint")}
                required
                maxLength={2000}
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
              />

              <div>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!rationale.trim()}
                  onClick={() => {
                    const mediaIds = caseData.media.map((m) => m.id);
                    onCloseCase?.(outcome, rationale, mediaIds);
                  }}
                >
                  {t("s03.actions.submitClose")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Audit History */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("s03.history.title")}</h3>
        <Timeline
          events={timelineEvents}
          chain={caseData.history?.chain_intact ? "intact" : "broken"}
        />
      </section>
    </div>
  );
}
