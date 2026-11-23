"use client";

import { useState } from "react";
import type { Claim, ClaimMatchesResponse, Language, SeenOn } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { Banner, Button, EmptyState, Field, TextArea } from "../../../../ui";
import styles from "./RumourView.module.css";

export interface RumourViewProps {
  claims: Claim[];
  selectedClaim: Claim | null;
  matches: ClaimMatchesResponse | null;
  loading: boolean;
  error: string | null;
  currentUserName?: string;
  onSelectClaim?: (id: string) => void;
  onCreateClaim?: (text: string, seenOn: SeenOn, language: Language) => void;
  onSaveDraft?: (id: string, text: string, version: number) => void;
  onApprove?: (id: string, version: number) => void;
  onReject?: (id: string, note: string, version: number) => void;
  onDismiss?: (id: string, note: string, version: number) => void;
  "data-testid"?: string;
}

export function RumourView({
  claims,
  selectedClaim,
  matches,
  loading,
  error,
  currentUserName,
  onSelectClaim,
  onCreateClaim,
  onSaveDraft,
  onApprove,
  onReject,
  onDismiss,
  "data-testid": testId = "rumour-view",
}: RumourViewProps) {
  const t = useT();

  const [showNewModal, setShowNewModal] = useState(false);
  const [newText, setNewText] = useState("");
  const [newSeenOn, setNewSeenOn] = useState<SeenOn>("whatsapp");
  const [newLang, setNewLang] = useState<Language>("en");

  // Draft state
  const [responseText, setResponseText] = useState(
    selectedClaim?.response?.text || ""
  );
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || !onCreateClaim) return;
    onCreateClaim(newText, newSeenOn, newLang);
    setNewText("");
    setShowNewModal(false);
  };

  const isDrafter =
    Boolean(selectedClaim?.response?.drafted_by &&
    currentUserName &&
    selectedClaim.response.drafted_by.toLowerCase() === currentUserName.toLowerCase());

  return (
    <div className={styles.container} data-testid={testId}>
      {error && <Banner tone="danger" title={error} critical />}

      <div className={styles.topSection}>
        <div>
          <h2 style={{ margin: 0, font: "var(--t-heading)" }}>{t("s06.claimsList")}</h2>
        </div>
        <Button variant="primary" onClick={() => setShowNewModal(!showNewModal)}>
          {t("s06.newClaim")}
        </Button>
      </div>

      {/* New Claim Form */}
      {showNewModal && (
        <div className={styles.card}>
          <h3 style={{ margin: 0 }}>{t("s06.newClaim")}</h3>
          <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            <TextArea
              id="claim-text"
              label={t("s06.claimText")}
              required
              maxLength={4000}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
            />
            <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap" }}>
              <div>
                <label htmlFor="claim-seen-on">
                  <strong>{t("s06.source")}</strong>
                </label>
                <select
                  id="claim-seen-on"
                  className="eg-select"
                  value={newSeenOn}
                  onChange={(e) => setNewSeenOn(e.target.value as SeenOn)}
                  style={{ display: "block", marginTop: "var(--s-1)" }}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="facebook">Facebook</option>
                  <option value="x">X / Twitter</option>
                  <option value="tiktok">TikTok</option>
                  <option value="sms">SMS</option>
                  <option value="radio">Radio</option>
                  <option value="in_person">In person</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="claim-lang">
                  <strong>Language</strong>
                </label>
                <select
                  id="claim-lang"
                  className="eg-select"
                  value={newLang}
                  onChange={(e) => setNewLang(e.target.value as Language)}
                  style={{ display: "block", marginTop: "var(--s-1)" }}
                >
                  <option value="en">English</option>
                  <option value="pcm">Naijá</option>
                  <option value="ha">Hausa</option>
                  <option value="yo">Yorùbá</option>
                  <option value="ig">Igbo</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: "var(--s-2)" }}>
              <Button type="submit" variant="primary" disabled={!newText.trim()}>
                {t("common.save")}
              </Button>
              <Button type="button" variant="quiet" onClick={() => setShowNewModal(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Main Split Layout */}
      <div className={styles.layoutSplit}>
        {/* Claims Left List */}
        <div className={styles.claimList}>
          {loading && claims.length === 0 && (
            <div style={{ padding: "var(--s-4)", textAlign: "center", color: "var(--ink-2)" }}>
              {t("staff.loading")}
            </div>
          )}

          {!loading && claims.length === 0 && (
            <EmptyState title="No claims logged yet" />
          )}

          {claims.map((claim) => {
            const isSelected = selectedClaim?.id === claim.id;

            return (
              <div
                key={claim.id}
                className={styles.claimRow}
                data-selected={isSelected}
                onClick={() => {
                  onSelectClaim?.(claim.id);
                  setResponseText(claim.response?.text || "");
                }}
              >
                <strong>{(claim.text || "").slice(0, 80)}{(claim.text || "").length > 80 ? "…" : ""}</strong>
                <div className={styles.claimMeta}>
                  <span>Source: {claim.seen_on}</span>
                  <span
                    style={{
                      fontWeight: 600,
                      color:
                        claim.harm.level === "high"
                          ? "var(--danger)"
                          : claim.harm.level === "medium"
                          ? "var(--attn-ink)"
                          : "var(--ink-2)",
                    }}
                  >
                    {t("s06.harmLevel", { level: claim.harm.level })}
                  </span>
                  <span>{claim.status}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Claim Detail */}
        {selectedClaim ? (
          <div className={styles.card}>
            <div>
              <span style={{ fontSize: "0.8125rem", color: "var(--ink-2)" }}>
                Source: <strong>{selectedClaim.seen_on}</strong> · Status: <strong>{selectedClaim.status}</strong>
              </span>
              <p style={{ font: "var(--t-body)", whiteSpace: "pre-wrap", marginTop: "var(--s-2)" }}>
                {selectedClaim.text}
              </p>
            </div>

            {/* Image Verification Guide (A9) */}
            {selectedClaim.image_check && (
              <div className={styles.guideBox}>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>{t("s06.imageGuide.title")}</h3>
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--ink-2)" }}>
                  {t("s06.imageGuide.notice")}
                </p>
                <ul className={styles.promptList}>
                  {selectedClaim.image_check.prompts.map((p) => (
                    <li key={p}>
                      {p === "reverse_search" && t("s06.imageGuide.reverseSearch")}
                      {p === "check_date_vs_claim" && t("s06.imageGuide.checkDate")}
                      {p === "look_for_edits" && t("s06.imageGuide.lookEdits")}
                      {p !== "reverse_search" && p !== "check_date_vs_claim" && p !== "look_for_edits" && p}
                    </li>
                  ))}
                </ul>
                {selectedClaim.image_check.error_level_hint && (
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--ink-2)" }}>
                    {t("s06.imageGuide.compression", { hint: selectedClaim.image_check.error_level_hint })}
                  </p>
                )}
              </div>
            )}

            {/* Matched Field Observations */}
            {matches && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>{t("s06.matches.title")}</h3>
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--ink-2)" }}>
                  {t("s06.matches.corroboratedOnly")}
                </p>

                {matches.observations.length === 0 ? (
                  <p style={{ fontSize: "0.875rem", color: "var(--ink-2)" }}>
                    No corroborating field reports matched.
                  </p>
                ) : (
                  matches.observations.map((obs) => (
                    <div
                      key={obs.report_id}
                      style={{
                        padding: "var(--s-2) var(--s-3)",
                        background: "var(--paper-2)",
                        border: "1px solid var(--rule)",
                        borderRadius: "var(--radius)",
                        fontSize: "0.875rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <strong>{obs.category}</strong>
                        <span>{Math.round(obs.similarity * 100)}% similarity</span>
                      </div>
                      <p style={{ margin: "4px 0 0" }}>{obs.excerpt}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Response Drafting & Second-Person Approval */}
            <div className={styles.responseBox}>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>{t("s06.response.title")}</h3>

              {selectedClaim.response?.drafted_by && (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--ink-2)" }}>
                  {t("s06.response.draftedBy", {
                    name: selectedClaim.response.drafted_by,
                    time: selectedClaim.response.drafted_at,
                  })}
                </p>
              )}

              {selectedClaim.response?.approved_by && (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--ok)", fontWeight: 600 }}>
                  {t("s06.response.approvedBy", {
                    name: selectedClaim.response.approved_by,
                    time: selectedClaim.response.approved_at || "",
                  })}
                </p>
              )}

              {/* Second-person approval notice */}
              {isDrafter && !selectedClaim.response?.approved_by && (
                <div className={styles.secondPersonNotice}>
                  <p style={{ margin: 0 }}>{t("s06.response.secondPersonNotice")}</p>
                </div>
              )}

              <TextArea
                id="claim-response-text"
                label={t("s06.response.textLabel")}
                maxLength={1500}
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
              />

              <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!responseText.trim()}
                  onClick={() => onSaveDraft?.(selectedClaim.id, responseText, selectedClaim.version)}
                >
                  {t("s06.response.saveDraft")}
                </Button>

                {selectedClaim.response && !selectedClaim.response.approved_by && (
                  <>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={isDrafter}
                      title={isDrafter ? t("s06.response.secondPersonNotice") : undefined}
                      onClick={() => onApprove?.(selectedClaim.id, selectedClaim.version)}
                    >
                      {t("s06.response.approve")}
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      onClick={() => setShowRejectForm(!showRejectForm)}
                    >
                      {t("s06.response.reject")}
                    </Button>
                  </>
                )}

                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => onDismiss?.(selectedClaim.id, "Dismissed by coordinator", selectedClaim.version)}
                >
                  {t("s06.response.dismiss")}
                </Button>
              </div>

              {showRejectForm && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
                  <Field
                    id="reject-note"
                    label={t("s06.response.rejectNote")}
                    required
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                  />
                  <div>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={!rejectNote.trim()}
                      onClick={() => {
                        onReject?.(selectedClaim.id, rejectNote, selectedClaim.version);
                        setShowRejectForm(false);
                      }}
                    >
                      {t("s06.response.reject")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.card}>
            <p style={{ color: "var(--ink-2)", textAlign: "center" }}>
              Select a claim to view details, match observations, and draft public response.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
