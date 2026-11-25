"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api/client";
import type { ApiErrorBody, SnapshotRecord } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { PublishView, type PublishNotice, type PublishResult } from "../_views/PublishView";

type Failure = { status: number; error: ApiErrorBody["error"] | { code: string; message: string } };

export default function PublishPage() {
  const t = useT();

  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The API cannot read the schedule, so it stays unknown until this person sets it. */
  const [hourly, setHourly] = useState<boolean | null>(null);
  const [scheduleVersion, setScheduleVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<PublishNotice | null>(null);
  const [attempt, setAttempt] = useState(0);

  /** Never show the server's own words: only our own plain sentences. */
  const sentence = useCallback(
    (res: Failure, kind: "list" | "write" | "schedule" = "write") => {
      const error = res.error as { code: string; fields?: Record<string, { code: string }> };
      if (res.status === 403) return t("staff.forbidden");
      if (res.status === 404 && kind === "list") return t("staff.endpointNotReady");
      if (error.code === "stale_version") return kind === "schedule" ? t("s07.schedule.stale") : t("s07.errors.stale");
      if (error.code === "invalid_transition") return t("s07.errors.transition");
      if (error.fields?.cutoff?.code === "too_recent") return t("s07.errors.tooRecent");
      if (error.code === "validation_failed") return t("s07.errors.invalid");
      return t("staff.networkError");
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await api("PUB-01.list", { query: {} });
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(sentence(res, "list"));
        return;
      }
      setError(null);
      setSnapshots(res.data.items);
      setCursor(res.data.next_cursor);
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, sentence]);

  const reload = () => setAttempt((n) => n + 1);

  function retry() {
    setLoading(true);
    setError(null);
    reload();
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    const res = await api("PUB-01.list", { query: { cursor } });
    setLoadingMore(false);
    if (!res.ok) {
      setError(sentence(res, "list"));
      return;
    }
    setSnapshots((rows) => [...rows, ...res.data.items.filter((item) => !rows.some((row) => row.id === item.id))]);
    setCursor(res.data.next_cursor);
  }

  async function generate(cutoff: string | undefined): Promise<PublishResult> {
    setNotice(null);
    const res = await api("PUB-01.create", { body: cutoff ? { cutoff } : {} });
    if (!res.ok) return { ok: false, message: sentence(res) };
    setSnapshots((rows) => [res.data, ...rows.filter((row) => row.id !== res.data.id)]);
    setSelectedId(res.data.id);
    setNotice({ tone: "ok", text: t("s07.notice.generated") });
    return { ok: true };
  }

  async function decide(op: "PUB-01.approve" | "PUB-01.discard", record: SnapshotRecord): Promise<PublishResult> {
    setNotice(null);
    const res = await api(op, { params: { id: record.id }, body: { version: record.version } });
    if (!res.ok) {
      const stale = (res.error as { code: string }).code === "stale_version" || (res.error as { code: string }).code === "invalid_transition";
      if (stale) reload();
      return { ok: false, message: sentence(res) };
    }
    setSnapshots((rows) => rows.map((row) => (row.id === record.id ? res.data : row)));
    setNotice({ tone: "ok", text: op === "PUB-01.approve" ? t("s07.notice.published") : t("s07.notice.discarded") });
    // Publishing replaces the release that was live, so read the list again.
    if (op === "PUB-01.approve") reload();
    return { ok: true };
  }

  async function setSchedule(next: boolean): Promise<PublishResult> {
    setNotice(null);
    const res = await api("PUB-01.schedule", { body: { hourly: next, version: scheduleVersion } });
    if (!res.ok) return { ok: false, message: sentence(res, "schedule") };
    setHourly(res.data.hourly);
    setScheduleVersion(res.data.version);
    setNotice({ tone: "ok", text: res.data.hourly ? t("s07.notice.scheduleOn") : t("s07.notice.scheduleOff") });
    return { ok: true };
  }

  return (
    <PublishView
      snapshots={snapshots}
      selectedId={selectedId}
      hourly={hourly}
      loading={loading}
      error={error}
      notice={notice}
      hasMore={cursor !== null}
      loadingMore={loadingMore}
      onSelect={setSelectedId}
      onGenerate={generate}
      onApprove={(record) => decide("PUB-01.approve", record)}
      onDiscard={(record) => decide("PUB-01.discard", record)}
      onSetHourly={setSchedule}
      onLoadMore={() => void loadMore()}
      onRetry={retry}
      onDismissNotice={() => setNotice(null)}
    />
  );
}
