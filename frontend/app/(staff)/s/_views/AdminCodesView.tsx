"use client";

import { useState } from "react";
import type { CodeBatch, CodeCard, ObserverCodeRow, RevokeReason } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { Banner, Button, EmptyState, Field } from "../../../../ui";
import styles from "./AdminCodesView.module.css";

export interface AdminCodesViewProps {
  batches: CodeBatch[];
  codes: ObserverCodeRow[];
  activeCards: CodeCard[] | null;
  loading: boolean;
  error: string | null;
  onCreateBatch?: (label: string, count: number) => void;
  onPrintData?: (batchId: string) => void;
  onCloseCards?: () => void;
  onRevokeCode?: (code: string, reason: RevokeReason) => void;
  onReissueCode?: (code: string, reason: RevokeReason) => void;
  onResetPin?: (code: string) => void;
  "data-testid"?: string;
}

export function AdminCodesView({
  batches,
  codes,
  activeCards,
  loading,
  error,
  onCreateBatch,
  onPrintData,
  onCloseCards,
  onRevokeCode,
  onReissueCode,
  onResetPin,
  "data-testid": testId = "admin-codes-view",
}: AdminCodesViewProps) {
  const t = useT();

  const [showCreate, setShowCreate] = useState(false);
  const [batchLabel, setBatchLabel] = useState("");
  const [batchCount, setBatchCount] = useState<number>(50);

  const [searchQuery, setSearchQuery] = useState("");
  const [revokeCodeId, setRevokeCodeId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState<RevokeReason>("lost_phone");

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchLabel.trim() || !onCreateBatch) return;
    onCreateBatch(batchLabel, batchCount);
    setBatchLabel("");
    setShowCreate(false);
  };

  const filteredCodes = codes.filter((c) =>
    searchQuery ? c.observer_code.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  return (
    <div className={styles.container} data-testid={testId}>
      {error && <Banner tone="danger" title={error} critical />}

      {/* Top Header */}
      <div className={styles.topSection}>
        <div>
          <h2 style={{ margin: 0, font: "var(--t-heading)" }}>{t("s09.batches")}</h2>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(!showCreate)}>
          {t("s09.createBatch")}
        </Button>
      </div>

      {/* Create Batch Form */}
      {showCreate && (
        <div className={styles.batchCard}>
          <h3 style={{ margin: 0 }}>{t("s09.createBatch")}</h3>
          <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            <Field
              id="batch-label"
              label={t("s09.label")}
              placeholder="e.g. Kano Ward Monitors 2026"
              required
              maxLength={80}
              value={batchLabel}
              onChange={(e) => setBatchLabel(e.target.value)}
            />
            <Field
              id="batch-count"
              label={t("s09.count")}
              type="number"
              min={1}
              max={500}
              required
              value={batchCount}
              onChange={(e) => setBatchCount(parseInt(e.target.value) || 1)}
            />
            <div style={{ display: "flex", gap: "var(--s-2)" }}>
              <Button type="submit" variant="primary" disabled={!batchLabel.trim()}>
                {t("common.save")}
              </Button>
              <Button type="button" variant="quiet" onClick={() => setShowCreate(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Printable Cards Overlay */}
      {activeCards && activeCards.length > 0 && (
        <section className={styles.printSheet}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }} className={styles.hidePrint}>
            <div>
              <h2 style={{ margin: 0 }}>{t("s09.printCards")} ({activeCards.length} cards)</h2>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--ink-2)" }}>
                {t("s09.printNotice")}
              </p>
            </div>
            <div style={{ display: "flex", gap: "var(--s-2)" }}>
              <Button type="button" variant="primary" onClick={() => window.print()}>
                Print Cards
              </Button>
              <Button type="button" variant="quiet" onClick={onCloseCards}>
                {t("ui.close")}
              </Button>
            </div>
          </div>

          <div className={styles.cardsGrid}>
            {activeCards.map((card) => (
              <div key={card.observer_code} className={styles.codeCard}>
                <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink-2)" }}>
                  ElectraGuard Accredited Observer
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--ink-2)" }}>Observer Code:</span>
                  <div className={styles.codeCardVal}>{card.observer_code}</div>
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--ink-2)" }}>Setup PIN:</span>
                  <div className={styles.codeCardVal} style={{ letterSpacing: "0.15em" }}>{card.setup_pin}</div>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--ink-2)" }}>
                  Expires: {card.setup_expires_at}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Batches Grid */}
      <div className={styles.batchesGrid}>
        {batches.map((b) => (
          <div key={b.id} className={styles.batchCard}>
            <h3 className={styles.batchTitle}>{b.label}</h3>
            <div className={styles.batchMeta}>
              <span>{b.count} codes total</span>
              <span>·</span>
              <span>Created {b.created_at}</span>
            </div>
            <div className={styles.batchStats}>
              <span style={{ color: "var(--ok)", fontWeight: 600 }}>{b.active} active</span>
              <span style={{ color: "var(--ink-2)" }}>{b.unclaimed} unclaimed</span>
              {b.revoked > 0 && <span style={{ color: "var(--danger)" }}>{b.revoked} revoked</span>}
            </div>
            <div style={{ marginTop: "var(--s-2)" }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onPrintData?.(b.id)}
              >
                {t("s09.printCards")}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Codes Table Section */}
      <div className={styles.batchCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--s-2)" }}>
          <h2 style={{ margin: 0, fontSize: "1.125rem" }}>{t("s09.codesTable")}</h2>
          <div style={{ width: "240px" }}>
            <Field
              id="search-codes"
              label={t("s09.searchCodes")}
              placeholder="Search OBS-..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {loading && codes.length === 0 && (
          <div style={{ padding: "var(--s-4)", textAlign: "center", color: "var(--ink-2)" }}>
            {t("staff.loading")}
          </div>
        )}

        {!loading && codes.length === 0 && (
          <EmptyState title="No observer codes created yet" />
        )}

        {filteredCodes.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Observer Code</th>
                  <th>Status</th>
                  <th>Activated</th>
                  <th>Last Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCodes.map((code) => {
                  return (
                    <tr key={code.observer_code}>
                      <td>
                        <strong style={{ fontFamily: "monospace" }}>{code.observer_code}</strong>
                        {code.replaced_by && (
                          <span style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-2)" }}>
                            Replaced by {code.replaced_by}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            fontWeight: 600,
                            color:
                              code.status === "active"
                                ? "var(--ok)"
                                : code.status === "revoked"
                                ? "var(--danger)"
                                : "var(--ink-2)",
                          }}
                        >
                          {t(`s09.status.${code.status}` as const)}
                        </span>
                      </td>
                      <td>{code.activated_on || "—"}</td>
                      <td>{code.last_active_on || "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: "var(--s-2)" }}>
                          {code.status !== "revoked" && (
                            <>
                              <Button
                                type="button"
                                variant="quiet"
                                onClick={() => setRevokeCodeId(code.observer_code)}
                              >
                                {t("s09.actions.revoke")}
                              </Button>
                              <Button
                                type="button"
                                variant="quiet"
                                onClick={() => onReissueCode?.(code.observer_code, "lost_phone")}
                              >
                                {t("s09.actions.reissue")}
                              </Button>
                              <Button
                                type="button"
                                variant="quiet"
                                onClick={() => onResetPin?.(code.observer_code)}
                              >
                                {t("s09.actions.resetPin")}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revoke confirmation dialog */}
      {revokeCodeId && (
        <div className={styles.batchCard} style={{ border: "2px solid var(--danger)" }}>
          <h3 style={{ margin: 0, color: "var(--danger)" }}>
            Revoke {revokeCodeId}?
          </h3>
          <p style={{ margin: 0, fontSize: "0.875rem" }}>
            Revoking ends all active sessions for this code immediately.
          </p>
          <div>
            <label htmlFor="revoke-reason">
              <strong>{t("s09.actions.reason")}</strong>
            </label>
            <select
              id="revoke-reason"
              className="eg-select"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value as RevokeReason)}
              style={{ display: "block", marginTop: "var(--s-1)" }}
            >
              <option value="lost_phone">Lost phone</option>
              <option value="left_programme">Left programme</option>
              <option value="suspected_misuse">Suspected misuse</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                onRevokeCode?.(revokeCodeId, revokeReason);
                setRevokeCodeId(null);
              }}
            >
              Confirm Revoke
            </Button>
            <Button type="button" variant="quiet" onClick={() => setRevokeCodeId(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
