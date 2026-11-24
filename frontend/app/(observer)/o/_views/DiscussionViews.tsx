"use client";

/* O-18 Discussions: list (invitations and memberships) and thread. Views only. */

import Link from "next/link";
import type { DiscussionSummary, FlagReason, Post } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { AppShell, Banner, Button, EmptyState, Sheet, TextArea } from "../../../../ui";
import { formatWatDateTime } from "../../../../ui/format";
import { ChevronRightIcon, InfoIcon } from "../../../../ui/icons";
import styles from "../_components/observer.module.css";
import s from "../_components/screens.module.css";

export type DiscussionListLoad = "loading" | "ok" | "offline" | "error" | "unavailable";

const areaName = (area: DiscussionSummary["area"]) => area.ward_name ?? area.lga_name;

export type DiscussionListViewProps = {
  offline: boolean;
  load: DiscussionListLoad;
  items: DiscussionSummary[];
  /** Invitation being answered, and which answer. */
  busy: { id: string; action: "accept" | "decline" } | null;
  notice: string | null;
  onAnswer: (id: string, action: "accept" | "decline") => void;
  onRetry: () => void;
  onBack: () => void;
};

export function DiscussionListView({ offline, load, items, busy, notice, onAnswer, onRetry, onBack }: DiscussionListViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const invited = items.filter((item) => item.membership === "invited");
  const joined = items.filter((item) => item.membership === "member");
  return (
    <AppShell
      title={t("o18.title")}
      onBack={onBack}
      offline={offline}
      banner={
        load === "unavailable" ? (
          <Banner tone="wait" title={t("common.error.unavailable")} />
        ) : load === "error" ? (
          <Banner tone="attn" title={t("o18.loadError")} action={<Button variant="secondary" onClick={onRetry}>{t("ui.retry")}</Button>} />
        ) : notice ? (
          <Banner tone="attn" title={t(notice)} data-testid="o18-notice" />
        ) : undefined
      }
      data-testid="o18"
    >
      <div className={styles.screen}>
        <h1 className={styles.title}>{t("o18.title")}</h1>
        <p className={styles.lead}>{t("o18.hint")}</p>
        {load === "loading" ? <p className={styles.meta}>{t("o18.loading")}</p> : null}
        {load === "offline" && !items.length ? <p className={styles.note}>{t("o18.offline")}</p> : null}
        {load === "ok" && !items.length ? <EmptyState title={t("o18.empty")} data-testid="o18-empty" /> : null}
        {invited.length ? (
          <section className={styles.stack} aria-labelledby="o18-invitations">
            <h2 className={styles.sectionTitle} id="o18-invitations">
              {t("o18.invitations")}
            </h2>
            {invited.map((item) => (
              <article key={item.id} className={s.invite} data-testid="o18-invite">
                <h3 className={s.inviteTitle}>{item.title}</h3>
                <p className={styles.meta}>
                  {t("o18.invite.from")} · {t("o18.invite.area", { area: areaName(item.area) ?? "" })}
                </p>
                <p className={styles.note}>
                  <InfoIcon aria-hidden="true" />
                  <span>{t("o18.invite.rules")}</span>
                </p>
                <div className={styles.itemActions}>
                  <Button variant="secondary" disabled={offline} loading={busy?.id === item.id && busy.action === "accept"} onClick={() => onAnswer(item.id, "accept")} data-testid="o18-join">
                    {t("o18.invite.join")}
                  </Button>
                  <Button variant="quiet" disabled={offline} loading={busy?.id === item.id && busy.action === "decline"} onClick={() => onAnswer(item.id, "decline")} data-testid="o18-decline">
                    {t("o18.invite.decline")}
                  </Button>
                </div>
                {offline ? <p className={styles.meta}>{t("o18.needNetwork")}</p> : null}
              </article>
            ))}
          </section>
        ) : null}
        {joined.length ? (
          <section className={styles.tight} aria-labelledby="o18-joined">
            <h2 className={styles.sectionTitle} id="o18-joined">
              {t("o18.joined")}
            </h2>
            <ul className={s.tasks}>
              {joined.map((item) => (
                <li key={item.id}>
                  <Link href={`/o/discussions/${item.id}`} className={s.taskLink} style={{ gridTemplateColumns: "minmax(0, 1fr) auto 24px" }} data-testid="o18-row">
                    <span className={styles.tight} style={{ gap: 2 }}>
                      <span>{item.title}</span>
                      <span className={styles.meta}>
                        {areaName(item.area)} · {t("o18.members", { count: item.member_count })} ·{" "}
                        {item.status === "closed" ? t("o18.closed") : t("o18.closesAt", { time: formatWatDateTime(item.closes_at, locale) })}
                      </span>
                    </span>
                    {item.unread_posts > 0 ? (
                      <span className={s.count} aria-label={t("o18.unread", { count: item.unread_posts })}>
                        {item.unread_posts}
                      </span>
                    ) : (
                      <span />
                    )}
                    <ChevronRightIcon className={s.chev} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

/* ---------- Thread ---------- */

export type ThreadPost = Post & { queued?: boolean };

export type ThreadViewProps = {
  offline: boolean;
  load: "loading" | "ok" | "offline" | "error" | "removed";
  title: string;
  topic: string;
  area: string;
  closesAt: string | null;
  closed: boolean;
  /** Invited but not joined: title and area only (DIS-02). */
  invited: boolean;
  posts: ThreadPost[];
  hasMore: boolean;
  onMore: () => void;
  draft: string;
  onDraft: (text: string) => void;
  draftError: string | null;
  /** Phone-number or name warning before posting (O-09 wording). */
  nameWarning: boolean;
  onKeep: () => void;
  posting: boolean;
  onPost: () => void;
  flagPost: Post | null;
  onFlag: (post: Post) => void;
  onFlagReason: (reason: FlagReason) => void;
  onCloseFlag: () => void;
  flagged: boolean;
  leave: null | "confirm" | "sending";
  onLeave: () => void;
  onConfirmLeave: () => void;
  onCancelLeave: () => void;
  onRetry: () => void;
  onBack: () => void;
};

const REASONS: FlagReason[] = ["names_a_person", "too_specific_location", "abusive", "other"];

export function ThreadView(props: ThreadViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const { offline, load, posts, closed, invited } = props;

  if (load === "removed" || load === "loading" || (load !== "ok" && !props.title)) {
    return (
      <AppShell title={t("o18.title")} onBack={props.onBack} offline={offline} data-testid="o18-thread">
        <div className={styles.screen}>
          <h1 className={styles.title}>{load === "removed" ? t("o18.thread.removed") : load === "loading" ? t("o18.loading") : t("o18.loadError")}</h1>
          {load === "error" || load === "offline" ? (
            <div>
              <Button variant="secondary" disabled={offline} onClick={props.onRetry}>
                {t("ui.retry")}
              </Button>
            </div>
          ) : null}
        </div>
      </AppShell>
    );
  }

  const canPost = !closed && !invited;
  return (
    <AppShell
      title={t("o18.title")}
      onBack={props.onBack}
      offline={offline}
      banner={closed ? <Banner tone="wait" title={t("o18.closed")} critical data-testid="o18-closed" /> : props.flagged ? <Banner tone="ok" title={t("o18.thread.flagged")} /> : undefined}
      actions={
        canPost ? (
          <div className={styles.tight}>
            <TextArea
              label={t("o18.thread.postLabel")}
              hint={t("o18.thread.postHint")}
              value={props.draft}
              onChange={(event) => props.onDraft(event.target.value)}
              maxLength={1000}
              rows={2}
              error={props.draftError ?? undefined}
              data-testid="o18-post-text"
            />
            {props.nameWarning ? (
              <Banner
                tone="attn"
                title={t("o09.nameWarning")}
                action={
                  <Button variant="secondary" onClick={props.onKeep} data-testid="o18-keep">
                    {t("o09.nameKeep")}
                  </Button>
                }
              />
            ) : null}
            <Button block loading={props.posting} loadingLabel={t("o18.thread.posting")} onClick={props.onPost} data-testid="o18-post">
              {t("o18.thread.post")}
            </Button>
          </div>
        ) : undefined
      }
      data-testid="o18-thread"
    >
      <div className={styles.screen}>
        <h1 className={styles.title}>{props.title}</h1>
        <p className={styles.meta}>
          {[props.topic, props.area, props.closesAt && !closed ? t("o18.closesAt", { time: formatWatDateTime(props.closesAt, locale) }) : null].filter(Boolean).join(" · ")}
        </p>
        <p className={styles.note}>
          <InfoIcon aria-hidden="true" />
          <span>{invited ? t("o18.invite.rules") : t("o18.thread.shareNote")}</span>
        </p>
        {invited ? null : posts.length === 0 ? (
          <p className={styles.meta}>{t("o18.thread.empty")}</p>
        ) : (
          <ol className={s.posts} aria-label={props.title} aria-live="polite" data-testid="o18-posts">
            {posts.map((post) => (
              <li key={post.id} className={s.post}>
                <div className={s.postHead}>
                  <span className={s.postAuthor}>{post.is_me ? t("o18.thread.you") : post.author_label === "Moderator" ? t("o18.thread.moderator") : post.author_label}</span>
                  <span>{post.queued ? t("o18.thread.queued") : formatWatDateTime(post.created_at, locale)}</span>
                </div>
                {post.state === "hidden" ? <p className={s.postHidden}>{t("o18.thread.hidden")}</p> : <p className={s.postText}>{post.body}</p>}
                {!post.is_me && !post.queued && post.state !== "hidden" && !closed ? (
                  <div className={s.postActions}>
                    <Button variant="quiet" onClick={() => props.onFlag(post)} aria-label={`${t("o18.thread.flag")}: ${post.author_label}`} data-testid="o18-flag">
                      {t("o18.thread.flag")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {props.hasMore ? (
          <div>
            <Button variant="secondary" disabled={offline} onClick={props.onMore} data-testid="o18-more">
              {t("o18.thread.more")}
            </Button>
          </div>
        ) : null}
        {!invited && !closed ? (
          <div className={s.dangerZone}>
            <div>
              <Button variant="secondary" className={s.dangerOutline} disabled={offline} onClick={props.onLeave} data-testid="o18-leave">
                {t("o18.thread.leave")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Sheet open={props.flagPost !== null} onClose={props.onCloseFlag} title={t("o18.thread.flagTitle")} description={t("o18.thread.flagBody")} data-testid="o18-flag-sheet">
        <div className={styles.stack}>
          {REASONS.map((reason) => (
            <Button key={reason} variant="secondary" block disabled={offline} onClick={() => props.onFlagReason(reason)} data-testid={`o18-flag-${reason}`}>
              {t(`o18.thread.flagReason.${reason}`)}
            </Button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={props.leave !== null}
        onClose={props.onCancelLeave}
        title={t("o18.thread.leaveTitle")}
        description={t("o18.thread.leaveBody")}
        footer={
          <>
            <Button variant="secondary" block autoFocus onClick={props.onCancelLeave}>
              {t("ui.cancel")}
            </Button>
            <Button variant="danger" block disabled={offline} loading={props.leave === "sending"} onClick={props.onConfirmLeave} data-testid="o18-leave-confirm">
              {t("o18.thread.leaveConfirm")}
            </Button>
          </>
        }
      />
    </AppShell>
  );
}
