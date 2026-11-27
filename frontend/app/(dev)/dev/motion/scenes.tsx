"use client";

/*
 * Development-only stage for the interface motion:
 * /dev/motion?scene=nav|bar|sheet|step|choice|send|send-offline|receipt|status|checklist|queue|publish.
 * Every scene uses the real components and a button or two to cause the change, so each effect can
 * be watched (and recorded) on its own.
 */

import { useSearchParams } from "next/navigation";
import { useState, type ReactElement, type ReactNode } from "react";
import type { SnapshotRecord } from "../../../../lib/api/types";
import { useT } from "../../../../lib/i18n/client";
import { AppShell, BottomNav, Button, ChoiceTileGroup, Sheet, StaffShell, StatusBadge, type ReportStatus } from "../../../../ui";
import { FileIcon, HomeIcon, InboxIcon, MessageIcon, PlusIcon, UploadIcon } from "../../../../ui/icons";
import { ChecklistListView, type StageState } from "../../../(observer)/o/_views/ChecklistViews";
import { CheckView, StepShell } from "../../../(observer)/o/_views/IncidentViews";
import { ReceiptView } from "../../../(observer)/o/_views/ReceiptView";
import { PublishView } from "../../../(staff)/s/_views/PublishView";
import { EMPTY_QUEUE_FILTERS, QueueTableView } from "../../../(staff)/s/_views/QueueTableView";
import { FIXTURE_OCCURRED_AT, FIXTURE_PLACE, FIXTURE_RECEIPT, FIXTURE_RECEIVED_AT, FIXTURE_TEXT } from "../observer/fixtures";
import { FIXTURE_QUEUE_ITEMS, FIXTURE_QUEUE_PAGE } from "../staff/fixtures";
import { DRAFT, HISTORY } from "../staff/previews/s07.fixtures";

const noop = () => undefined;

function Controls({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: "fixed", right: 8, top: 70, zIndex: 99999, display: "flex", gap: 8 }} data-testid="motion-controls">
      {children}
    </div>
  );
}

function Nav() {
  const t = useT();
  const [tab, setTab] = useState<"home" | "reports" | "messages">("home");
  const item = (id: typeof tab, label: string, icon: ReactElement) => ({ href: `#${id}`, label, icon, current: tab === id });
  return (
    <AppShell
      variant="home"
      bottomNav={
        <BottomNav
          label="Main"
          items={[
            item("home", t("common.home"), <HomeIcon />),
            { href: "#new", label: "Report", icon: <PlusIcon />, primary: true },
            item("reports", "My reports", <FileIcon />),
            item("messages", "Messages", <MessageIcon />),
          ]}
        />
      }
    >
      <Controls>
        <button data-testid="go-reports" onClick={() => setTab("reports")}>Reports</button>
        <button data-testid="go-messages" onClick={() => setTab("messages")}>Messages</button>
        <button data-testid="go-home" onClick={() => setTab("home")}>Home</button>
      </Controls>
      <div style={{ height: 300 }} />
    </AppShell>
  );
}

function Bar() {
  return (
    <AppShell title="New report" onBack={noop}>
      <h1 style={{ font: "700 1.75rem/1.2 var(--font)", margin: "24px 16px" }}>What happened?</h1>
      {Array.from({ length: 24 }, (_, i) => (
        <p key={i} style={{ margin: "0 16px 16px", font: "400 1rem/1.5 var(--font)" }}>
          {FIXTURE_TEXT}
        </p>
      ))}
    </AppShell>
  );
}

function SheetScene() {
  const [open, setOpen] = useState(false);
  return (
    <AppShell title="Sheet" onBack={noop}>
      <div style={{ padding: 16 }}>
        <Button onClick={() => setOpen(true)} data-testid="open-sheet">Open the sheet</Button>
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Menu"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => setOpen(false)}>Confirm</Button>
          </>
        }
      >
        {["Your code", "Language", "Text size", "Vibration", "Help and safety", "Sign out"].map((row) => (
          <p key={row} style={{ margin: 0, padding: "12px 0", font: "600 1rem/1.3 var(--font)", borderBottom: "1px solid var(--rule)" }}>{row}</p>
        ))}
      </Sheet>
    </AppShell>
  );
}

function StepScene() {
  const [step, setStep] = useState(1);
  return (
    <StepShell
      key={step}
      step={step}
      testId={`step-${step}`}
      onBack={() => setStep((s) => Math.max(1, s - 1))}
      actions={<Button block onClick={() => setStep((s) => Math.min(7, s + 1))} data-testid="next">Continue</Button>}
    >
      <h1 style={{ font: "700 1.75rem/1.2 var(--font)", margin: 0 }}>Step {step} of 7</h1>
      <p style={{ margin: 0 }}>{FIXTURE_TEXT}</p>
      <Button variant="secondary" onClick={() => setStep((s) => Math.max(1, s - 1))} data-testid="prev">Back a step</Button>
    </StepShell>
  );
}

function ChoiceScene() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <AppShell title="Choice" onBack={noop}>
      <div style={{ padding: 16 }}>
        <ChoiceTileGroup
          legend="What did you see?"
          name="c"
          value={value}
          onChange={setValue}
          options={[
            { value: "queues", label: "Queues or crowding" },
            { value: "equipment", label: "Equipment failure" },
            { value: "materials", label: "Late or missing materials" },
          ]}
        />
      </div>
    </AppShell>
  );
}

function SendScene({ offline }: { offline: boolean }) {
  const [status, setStatus] = useState<"sending" | "savedOffline" | null>(null);
  return (
    <CheckView
      onBack={noop}
      onDiscard={noop}
      category="intimidation_violence"
      access={[]}
      danger={false}
      place={FIXTURE_PLACE}
      occurredAt={FIXTURE_OCCURRED_AT}
      justNow={false}
      description={FIXTURE_TEXT}
      firsthand
      media={[]}
      errors={{}}
      status={status}
      offline={offline}
      outboxCount={2}
      onEdit={noop}
      onSend={() => {
        setStatus("sending");
        window.setTimeout(() => setStatus(offline ? "savedOffline" : null), 1800);
      }}
      onHome={noop}
    />
  );
}

function ReceiptScene() {
  const [key, setKey] = useState(0);
  return (
    <>
      <Controls>
        <button data-testid="replay" onClick={() => setKey((k) => k + 1)}>Replay</button>
      </Controls>
      <ReceiptView
        key={key}
        code={FIXTURE_RECEIPT}
        receivedAt={FIXTURE_RECEIVED_AT}
        justSent
        citizen={false}
        items={[]}
        removeBlocked={false}
        offline={false}
        onRetry={noop}
        onRemove={noop}
        onChooseAgain={noop}
        onAnother={noop}
        onHome={noop}
      />
    </>
  );
}

function StatusScene() {
  const [status, setStatus] = useState<ReportStatus>("on-phone");
  return (
    <AppShell title="Report" onBack={noop}>
      <div style={{ padding: 24, display: "grid", gap: 16, justifyItems: "start" }}>
        <StatusBadge status={status} size="lg" morph />
        <Button onClick={() => setStatus((s) => (s === "on-phone" ? "received" : "on-phone"))} data-testid="flip">Flip status</Button>
      </div>
    </AppShell>
  );
}

const STAGES = ["arrival", "opening", "accreditation", "voting", "closing", "results"] as const;

function ChecklistScene() {
  const [done, setDone] = useState(1);
  const [key, setKey] = useState(0);
  return (
    <>
      <Controls>
        <button
          data-testid="send-stage"
          onClick={() => {
            setDone((d) => Math.min(6, d + 1));
            setKey((k) => k + 1);
          }}
        >
          Send next stage
        </button>
      </Controls>
      <ChecklistListView
        key={key}
        offline={false}
        onBack={noop}
        unitLabel="Kantudu Primary School I"
        stages={STAGES.map((slug, i) => ({ slug, state: (i < done ? "received" : "notStarted") as StageState, receivedAt: "2026-12-05T08:42:00+01:00", href: "#" }))}
      />
    </>
  );
}

function StaffFrame({ intake, children, title }: { intake: boolean; children: ReactNode; title: string }) {
  return (
    <StaffShell
      title={title}
      organisation="Kano State"
      user={{ name: "Amina Bello", role: "Reviewer" }}
      intake={{ paused: intake, href: "#" }}
      nav={[
        { href: "#queue", label: "Review queue", icon: InboxIcon, current: title === "Review queue", group: "Review" },
        { href: "#publish", label: "Publish", icon: UploadIcon, current: title === "Publish", group: "Monitor" },
      ]}
    >
      {children}
    </StaffShell>
  );
}

function QueueScene() {
  const [items, setItems] = useState(FIXTURE_QUEUE_ITEMS.slice(1));
  const [pending, setPending] = useState(0);
  const [intake, setIntake] = useState(false);
  return (
    <StaffFrame intake={intake} title="Review queue">
      <Controls>
        <button data-testid="arrive" onClick={() => setPending(1)}>New case arrives</button>
        <button data-testid="pause" onClick={() => setIntake((v) => !v)}>Pause intake</button>
      </Controls>
      <QueueTableView
        data={{ ...FIXTURE_QUEUE_PAGE, items }}
        loading={false}
        error={null}
        filters={EMPTY_QUEUE_FILTERS}
        onFiltersChange={noop}
        newCount={pending}
        onShowNew={() => {
          setItems([FIXTURE_QUEUE_ITEMS[0], ...items]);
          setPending(0);
        }}
        onOpenCase={noop}
      />
    </StaffFrame>
  );
}

function PublishScene() {
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>(HISTORY);
  const [selected, setSelected] = useState<string>(DRAFT.id);
  return (
    <StaffFrame intake={false} title="Publish">
      <PublishView
        snapshots={snapshots}
        selectedId={selected}
        hourly={false}
        loading={false}
        error={null}
        onSelect={setSelected}
        onGenerate={async () => {
          const next: SnapshotRecord = { ...DRAFT, id: `snap-new-${snapshots.length}`, status: "draft", version: snapshots.length + 1 };
          setSnapshots([next, ...snapshots]);
          setSelected(next.id);
          return { ok: true };
        }}
        onApprove={async (record) => {
          setSnapshots((list) => list.map((s) => (s.id === record.id ? { ...s, status: "published", published_at: "2026-12-05T11:20:00+01:00" } : s)));
          return { ok: true };
        }}
        onDiscard={async () => ({ ok: true })}
      />
    </StaffFrame>
  );
}

export function MotionScenes() {
  const scene = useSearchParams().get("scene") ?? "nav";
  switch (scene) {
    case "nav": return <Nav />;
    case "bar": return <Bar />;
    case "sheet": return <SheetScene />;
    case "step": return <StepScene />;
    case "choice": return <ChoiceScene />;
    case "send": return <SendScene offline={false} />;
    case "send-offline": return <SendScene offline />;
    case "receipt": return <ReceiptScene />;
    case "status": return <StatusScene />;
    case "checklist": return <ChecklistScene />;
    case "queue": return <QueueScene />;
    case "publish": return <PublishScene />;
    default: return <p>Unknown scene</p>;
  }
}
