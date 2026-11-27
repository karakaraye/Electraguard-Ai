"use client";

/** O-21 Check-in: one question from the coordinator. Yes, No or Not seen, saved on the phone with the phone's time. */

import { useState } from "react";
import type { NoticeAnswerChoice } from "../../../../lib/api/types";
import { useLocale, useT } from "../../../../lib/i18n/client";
import { noticeTitle } from "../../../../lib/notices";
import { Banner, Button, ButtonLink, ChoiceTile, OutboxBadge, StatusBadge, Tag, useNow } from "../../../../ui";
import { formatWatTime } from "../../../../ui/format";
import { ObserverEmpty } from "../_components/ObserverEmpty";
import { ObserverShell } from "../_components/ObserverShell";
import styles from "../_components/notice.module.css";
import type { NoticeView } from "../_lib/notices";

export const ANSWERS: NoticeAnswerChoice[] = ["yes", "no", "not_seen"];

export type CheckinViewProps = {
  /** Null: still loading, or not on this phone any more. */
  notice: NoticeView | null;
  loading: boolean;
  offline: boolean;
  unit: string | null;
  /** Answers saved on this phone and not sent yet (the badge). */
  waiting: number;
  now?: number;
  onSave: (choice: NoticeAnswerChoice) => void;
  onBack: () => void;
};

export function CheckinView({ notice, loading, offline, unit, waiting, now: nowProp, onSave, onBack }: CheckinViewProps) {
  const clock = useNow();
  const now = nowProp ?? clock ?? 0;
  const t = useT();
  const { locale } = useLocale();
  const [picked, setPicked] = useState<NoticeAnswerChoice | null>(null);
  const [changing, setChanging] = useState(false);
  const answer = notice?.answer ?? null;
  const closed = notice ? Date.parse(notice.expires_at) <= now : false;
  const saved = Boolean(answer) && !changing;
  const choice = picked ?? (changing ? (answer?.choice ?? null) : null);

  const end = waiting > 0 ? <OutboxBadge count={waiting} label={t("notice.waitingLabel", { count: waiting })} data-testid="o21-badge" /> : undefined;

  const actions =
    notice && !closed && !saved ? (
      <Button
        block
        disabled={!choice || (changing && choice === answer?.choice)}
        onClick={() => {
          if (!choice) return;
          onSave(choice);
          setChanging(false);
          setPicked(null);
        }}
        data-testid="o21-save"
      >
        {t("notice.save")}
      </Button>
    ) : (
      <ButtonLink href="/o" variant="secondary" block data-testid="o21-home">
        {t("notice.backHome")}
      </ButtonLink>
    );

  return (
    <ObserverShell title={t("notice.checkin.title")} onBack={onBack} end={end} offline={offline} actions={actions} data-testid="o21">
      <div className={styles.screen}>
        {offline && !saved && notice && !closed ? <p className={styles.closed} role="status" data-testid="o21-offline">{t("notice.offlineBanner")}</p> : null}
        {!notice ? (
          loading ? (
            <p className={styles.hint} data-testid="o21-loading">{t("notice.loading")}</p>
          ) : (
            <ObserverEmpty art="messagesEmpty" title={t("notice.gone.title")} headingLevel={1} data-testid="o21-gone">
              {offline ? t("notice.gone.offline") : t("notice.gone.body")}
            </ObserverEmpty>
          )
        ) : (
          <>
            <p className={styles.source}>
              {notice.type === "safety" ? <StatusBadge tone="danger" label={t("notice.type.safety")} /> : <Tag>{t(`notice.type.${notice.type}`)}</Tag>}
              <span className="eg-tnum">{t("notice.fromCoordinator", { time: formatWatTime(notice.created_at, locale) })}</span>
              {!closed && !saved ? <span className="eg-tnum">{t("notice.answerBy", { time: formatWatTime(notice.expires_at, locale) })}</span> : null}
            </p>
            <h1 className={styles.question} data-testid="o21-question">{noticeTitle(notice, locale)}</h1>
            {unit ? <p className={styles.unit}>{unit}</p> : null}

            {closed && !answer ? (
              <p className={styles.closed} role="status" data-testid="o21-closed">{t("notice.closed")}</p>
            ) : saved && answer ? (
              <>
                <dl className={styles.summary} data-testid="o21-summary">
                  <div>
                    <dt>{t("notice.yourAnswer")}</dt>
                    <dd>{t(`notice.answer.${answer.choice}`)}</dd>
                  </div>
                  <div>
                    <dt>{t("notice.answered")}</dt>
                    <dd className="eg-tnum">
                      {answer.state === "on_phone" ? t("notice.answeredPhone", { time: formatWatTime(answer.at, locale) }) : formatWatTime(answer.at, locale)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("notice.statusLabel")}</dt>
                    <dd>
                      {answer.state === "on_phone" ? (
                        <StatusBadge status="on-phone" />
                      ) : answer.state === "expired" ? (
                        <StatusBadge tone="attn" label={t("notice.answerExpired")} />
                      ) : (
                        <StatusBadge status="received" />
                      )}
                    </dd>
                  </div>
                </dl>
                {answer.state === "on_phone" ? <p className={styles.closed} role="status" data-testid="o21-saved">{t("notice.savedOnPhone")}</p> : null}
                {answer.state === "expired" ? <Banner tone="attn" title={t("notice.expiredBanner")} data-testid="o21-expired" /> : null}
                {!closed && answer.state !== "expired" ? (
                  <button type="button" className={styles.change} onClick={() => setChanging(true)} data-testid="o21-change">
                    {t("notice.change")}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <fieldset className={styles.choices}>
                  <legend className="eg-sr-only">{noticeTitle(notice, locale)}</legend>
                  {ANSWERS.map((value) => (
                    <ChoiceTile
                      key={value}
                      name="checkin-answer"
                      value={value}
                      checked={choice === value}
                      onChange={() => setPicked(value)}
                      label={t(`notice.answer.${value}`)}
                      data-testid={`o21-answer-${value}`}
                    />
                  ))}
                </fieldset>
                <p className={styles.hint}>{t("notice.notSeenHint")}</p>
              </>
            )}
          </>
        )}
      </div>
    </ObserverShell>
  );
}
