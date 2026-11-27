"use client";

import { useParams, useRouter } from "next/navigation";
import { answerNotice, useNoticeAnswers, waitingCount } from "../../../../../lib/outbox/notices";
import { useChecklistDay, watDay } from "../../_lib/checklist";
import { useFocusTitle, useNetwork } from "../../_lib/network";
import { useNotices } from "../../_lib/notices";
import { useSignedIn } from "../../_lib/useSignedIn";
import { CheckinView } from "../../_views/CheckinView";

/** O-21: answer one ward check-in, online or not. */
export default function CheckinPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSignedIn();
  const { offline } = useNetwork();
  useFocusTitle("o21");
  const code = session?.code ?? null;
  const { notices, load } = useNotices(code, offline);
  const queue = useNoticeAnswers(code);
  const day = useChecklistDay(code, watDay());
  const notice = notices.find((item) => item.id === id) ?? null;

  if (!session) return null;
  return (
    <CheckinView
      notice={notice}
      loading={load.status === "loading"}
      offline={offline}
      unit={day.unit?.label ?? null}
      waiting={waitingCount(queue)}
      onSave={(choice) => answerNotice(session.code, id, choice)}
      onBack={() => router.push("/o")}
    />
  );
}
