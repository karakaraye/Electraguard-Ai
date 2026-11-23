"use client";

import { useState } from "react";
import type { HideReason, ModerationFlag } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { Banner, Button, EmptyState, Field, TextArea } from "../../../../ui";
import { AlertIcon } from "../../../../ui/icons";
import styles from "./DiscussionModView.module.css";

export interface DiscussionModViewProps {
  flags: ModerationFlag[];
  loading: boolean;
  error: string | null;
  onHidePost?: (discussionId: string, postId: string, reason: HideReason, note?: string) => void;
  onUnhidePost?: (discussionId: string, postId: string) => void;
  onRemoveMember?: (discussionId: string, observerCode: string, reason: string) => void;
  onCloseDiscussion?: (discussionId: string) => void;
  onCreateDiscussion?: (title: string, topic: string, lgaCode: string) => void;
  "data-testid"?: string;
}

export function DiscussionModView({
  flags,
  loading,
  error,
  onHidePost,
  onUnhidePost,
  onRemoveMember,
  onCloseDiscussion,
  onCreateDiscussion,
  "data-testid": testId = "discussions-mod-view",
}: DiscussionModViewProps) {
  const t = useT();

  const [showCreate, setShowCreate] = useState(false);
  const [discTitle, setDiscTitle] = useState("");
  const [discTopic, setDiscTopic] = useState("");
  const [discArea, setDiscArea] = useState("");

  const [hideReason, setHideReason] = useState<HideReason>("names_a_person");
  const [activeHidePostId, setActiveHidePostId] = useState<string | null>(null);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!discTitle.trim() || !onCreateDiscussion) return;
    onCreateDiscussion(discTitle, discTopic, discArea || "KN-04");
    setDiscTitle("");
    setDiscTopic("");
    setShowCreate(false);
  };

  return (
    <div className={styles.container} data-testid={testId}>
      {error && <Banner tone="danger" title={error} critical />}

      <div className={styles.topSection}>
        <div>
          <h2 style={{ margin: 0, font: "var(--t-heading)" }}>
            {t("s08.flagsInbox", { count: flags.length })}
          </h2>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(!showCreate)}>
          {t("s08.createDiscussion")}
        </Button>
      </div>

      {/* Create Discussion Form */}
      {showCreate && (
        <div className={styles.modalCard}>
          <h3 style={{ margin: 0 }}>{t("s08.createDiscussion")}</h3>
          <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            <Field
              id="disc-title"
              label="Title"
              required
              maxLength={120}
              value={discTitle}
              onChange={(e) => setDiscTitle(e.target.value)}
            />
            <TextArea
              id="disc-topic"
              label={t("s08.topic")}
              maxLength={500}
              value={discTopic}
              onChange={(e) => setDiscTopic(e.target.value)}
            />
            <Field
              id="disc-area"
              label={t("s08.wardLga")}
              placeholder="e.g. KN-04 (Dala LGA)"
              value={discArea}
              onChange={(e) => setDiscArea(e.target.value)}
            />
            <div style={{ display: "flex", gap: "var(--s-2)" }}>
              <Button type="submit" variant="primary" disabled={!discTitle.trim()}>
                {t("common.save")}
              </Button>
              <Button type="button" variant="quiet" onClick={() => setShowCreate(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Loading State */}
      {loading && flags.length === 0 && (
        <div style={{ padding: "var(--s-4)", textAlign: "center", color: "var(--ink-2)" }}>
          {t("staff.loading")}
        </div>
      )}

      {/* Empty State */}
      {!loading && flags.length === 0 && (
        <EmptyState title="No open moderation flags" />
      )}

      {/* Flags List */}
      <div className={styles.flagsList}>
        {flags.map((flag) => {
          const isPostHidden = flag.post.state === "hidden";

          return (
            <div key={`${flag.discussion_id}-${flag.post.id}`} className={styles.flagCard}>
              <div className={styles.flagTop}>
                <div>
                  <strong>Author: {flag.post.author_label}</strong>
                  <span style={{ marginLeft: "var(--s-2)", color: "var(--ink-2)", fontSize: "0.8125rem" }}>
                    · Flagged {flag.flag_count} times
                  </span>
                </div>
                {flag.name_check?.possible_names && (
                  <span className={styles.nameAlert}>
                    <AlertIcon size={14} />
                    <span>{t("s08.nameCheckAlert")}</span>
                  </span>
                )}
              </div>

              <p className={styles.postContent} data-hidden={isPostHidden}>
                {flag.post.hidden_body || flag.post.body}
              </p>

              <div style={{ fontSize: "0.8125rem", color: "var(--ink-2)" }}>
                <span>Reasons: {flag.reasons.join(", ")}</span>
                {flag.post.hidden_reason && <span> · Hidden for: {flag.post.hidden_reason}</span>}
              </div>

              <div className={styles.actionsBar}>
                {!isPostHidden ? (
                  activeHidePostId === flag.post.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                      <select
                        className="eg-select"
                        value={hideReason}
                        onChange={(e) => setHideReason(e.target.value as HideReason)}
                      >
                        <option value="names_a_person">Names a person</option>
                        <option value="too_specific_location">Too specific location</option>
                        <option value="abusive">Abusive</option>
                        <option value="off_topic">Off topic</option>
                        <option value="other">Other</option>
                      </select>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => {
                          onHidePost?.(flag.discussion_id, flag.post.id, hideReason);
                          setActiveHidePostId(null);
                        }}
                      >
                        Confirm Hide
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        onClick={() => setActiveHidePostId(null)}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setActiveHidePostId(flag.post.id)}
                    >
                      {t("s08.hidePost")}
                    </Button>
                  )
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onUnhidePost?.(flag.discussion_id, flag.post.id)}
                  >
                    {t("s08.unhidePost")}
                  </Button>
                )}

                <Button
                  type="button"
                  variant="quiet"
                  onClick={() =>
                    onRemoveMember?.(flag.discussion_id, flag.post.author_label, "Violated discussion rules")
                  }
                >
                  {t("s08.removeMember")}
                </Button>

                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => onCloseDiscussion?.(flag.discussion_id)}
                >
                  {t("s08.closeDiscussion")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
