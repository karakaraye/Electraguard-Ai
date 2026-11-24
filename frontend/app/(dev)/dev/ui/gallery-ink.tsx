"use client";

/*
 * Ink and Paper (Phase 0): every restyled and new component in every state, light and dark side by side,
 * plus one example at 200% text. Development builds only. Sample values are the project's synthetic
 * codes (OBS-7K2P9X, EG-4H7Q-92KD).
 */
import { useState, type ReactNode } from "react";
import { Splash } from "../../../../ui/Splash/Splash";
import {
  ArtPlate,
  AppShell,
  Banner,
  BottomNav,
  Button,
  ChoiceTileGroup,
  DayArc,
  EmptyState,
  Field,
  HeroCard,
  OutboxBadge,
  QuestionCard,
  ReceiptCard,
  ReportList,
  ReportRow,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  StatusBadge,
  Stepper,
  SunRings,
  SuggestionCard,
  TextArea,
  useToast,
  YesNo,
  type DayArcStage,
  type ReportStatus,
} from "../../../../ui";
import * as Icons from "../../../../ui/icons";
import { categoryPictograms } from "../../../../ui/icons";
import styles from "./gallery.module.css";

const NOW = Date.parse("2026-11-22T13:05:00+01:00");

function Group({ id, title, note, children }: { id: string; title: string; note?: string; children: (theme: "light" | "dark") => ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={`${id}-h`} data-testid={`ink-${id}`}>
      <h2 className={styles.sectionTitle} id={`${id}-h`}>
        {title}
      </h2>
      {note ? <p className={styles.note}>{note}</p> : null}
      <div className={styles.pair}>
        {(["light", "dark"] as const).map((theme) => (
          <div key={theme} className={styles.pane} data-theme={theme}>
            <p className={styles.paneLabel}>{theme}</p>
            <div className={styles.paneBody}>{children(theme)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const categories = [
  { value: "materials", label: "Late or missing materials", pictogram: categoryPictograms.materials },
  { value: "equipment", label: "Equipment failure", pictogram: categoryPictograms.equipment },
  { value: "queues", label: "Queues or crowding", pictogram: categoryPictograms.queues },
  { value: "intimidation", label: "Intimidation or violence", pictogram: categoryPictograms.intimidation },
  { value: "not-sure", label: "Not sure", pictogram: categoryPictograms["not-sure"], disabled: true },
];

const allStatuses: ReportStatus[] = ["received", "in-review", "question", "on-phone", "failed", "withdrawn", "closed", "urgent"];

function stagesFor(sent: number): DayArcStage[] {
  const names = ["Arrival", "Opening", "Accreditation", "Voting", "Closing and counting", "Results posted"];
  return names.map((label, index) => ({
    id: String(index),
    label,
    state: index < sent ? "sent" : index === sent ? "next" : "later",
  }));
}

const stateLabels = { sent: "sent", next: "next", later: "later" } as const;

function PlateArt() {
  return (
    <svg viewBox="0 0 350 150" aria-hidden="true" focusable="false">
      <rect width="350" height="150" fill="var(--sun-wash)" />
      <circle cx="270" cy="52" r="28" fill="var(--sun)" />
      <path d="M0 120 Q120 108 200 114 T350 110 V150 H0Z" fill="var(--art-ground)" />
      <g stroke="var(--art-line)" strokeWidth="1.3" fill="var(--art-wall)">
        <path d="M150 120 V72 H330 V120" />
        <path d="M140 74 L160 54 H320 L340 74Z" />
      </g>
      <g fill="var(--art-line)">
        <circle cx="40" cy="86" r="6" />
        <path d="M32 120 V100 Q40 92 48 100 V120Z" />
        <circle cx="64" cy="84" r="6" />
        <path d="M56 120 L58 98 Q64 90 70 98 L73 120Z" opacity=".8" />
      </g>
    </svg>
  );
}

function ToastButtons() {
  const toast = useToast();
  return (
    <div className={styles.stack}>
      <Button variant="secondary" onClick={() => toast.show({ text: "Copied" })}>
        Show a toast (4 s)
      </Button>
      <Button variant="secondary" onClick={() => toast.show({ text: "Report withdrawn", actionLabel: "Undo", onAction: () => {} })}>
        Show a toast with Undo (5 s)
      </Button>
    </div>
  );
}

function PairedStates() {
  const [category, setCategory] = useState<string | null>("queues");
  const [danger, setDanger] = useState<boolean | null>(true);
  const [seg, setSeg] = useState("all");
  const [segSun, setSegSun] = useState("nation");
  const [answer, setAnswer] = useState("");
  const [filled, setFilled] = useState("The presiding officer closed the gate at 08:00.");
  const [count, setCount] = useState(2);
  const [sheet, setSheet] = useState<"light" | "dark" | null>(null);
  const [ripple, setRipple] = useState(0);

  return (
    <>
      <Group id="ink-splash" title="Splash" note="Screen 1, settled frame. Live: once per install on /o and /o/start, at most 1.2 s, a tap skips it.">
        {() => (
          <div style={{ width: 360, height: 640, maxWidth: "100%", borderRadius: 22, overflow: "hidden", border: "1px solid var(--rule)" }}>
            <Splash credit="by Cairn" preview />
          </div>
        )}
      </Group>
      <Group id="ink-buttons" title="Button" note="Primary, secondary, quiet, danger, on-ink; default, disabled, loading. Staff density below.">
        {() => (
          <div className={styles.stack}>
            <Button>Send report</Button>
            <Button variant="secondary">Save and send when online</Button>
            <Button variant="quiet">Report something else</Button>
            <Button variant="danger">Withdraw this report</Button>
            <div className={styles.onInk}>
              <Button variant="onInk" block>
                Report something
              </Button>
            </div>
            <Button disabled>Continue</Button>
            <Button loading loadingLabel="Sending">
              Send report
            </Button>
            <Button variant="secondary" loading>
              Save
            </Button>
            <div className={styles.stack} data-density="staff">
              <Button>Start review (44 px)</Button>
              <Button variant="secondary">Ask a formal question</Button>
            </div>
          </div>
        )}
      </Group>

      <Group id="ink-choice" title="ChoiceTile and YesNo" note="Tap a tile: sunlight sweeps out from the disc, the check badge pops. Disabled tile is dashed.">
        {(theme) => (
          <div className={styles.stack}>
            <ChoiceTileGroup
              legend="What happened?"
              headingLevel={2}
              hint="Choose the closest one. Not sure is fine."
              name={`cat-${theme}`}
              value={category}
              onChange={setCategory}
              columns={2}
              options={categories}
            />
            <YesNo
              legend="Is anyone in danger now?"
              name={`yn-${theme}`}
              value={danger}
              onChange={setDanger}
              yesLabel="Yes, someone is in danger"
              yesIcon={<Icons.AlertIcon />}
              yesTone="danger"
              noLabel="No"
              stacked
            />
          </div>
        )}
      </Group>

      <Group id="ink-progress" title="Stepper and StatusBadge" note="Every chip has a shape and a word: filled circle with tick, half circle, diamond, hollow circle, triangle, dashed circle.">
        {() => (
          <div className={styles.stack}>
            <Stepper current={3} total={7} />
            <div className={styles.row}>
              {allStatuses.map((status) => (
                <StatusBadge key={status} status={status} />
              ))}
            </div>
          </div>
        )}
      </Group>

      <Group id="ink-banner" title="Banner" note="Info (sun wash), attention, danger, success, waiting / offline (ink fill).">
        {() => (
          <div className={styles.stack}>
            <Banner tone="info" title="New guidance for closing time" />
            <Banner tone="attn" title="A reviewer asked you a question" action={<Button variant="secondary">Answer</Button>} />
            <Banner tone="danger" critical title="New reports are paused">
              <p>You can still write them. They will wait on this phone.</p>
            </Banner>
            <Banner tone="ok" title="Your PIN is saved" />
            <Banner tone="wait" title="You are offline. Reports wait on this phone." />
          </div>
        )}
      </Group>

      <Group id="ink-fields" title="Field, TextArea, Select" note="Raised paper, 1px control border, 2px ink on focus, danger triangle and message on error.">
        {() => (
          <div className={styles.stack}>
            <Field label="Observer code" hint="It is on your card, for example OBS-7K2P9X." numeric defaultValue="OBS-7K2P9X" />
            <Field label="PIN" type="password" inputMode="numeric" numeric error="The code or PIN is not right. Check the card and try again." defaultValue="123" />
            <Field label="Receipt code" disabled defaultValue="EG-4H7Q-92KD" numeric />
            <TextArea label="Tell us what you saw" maxLength={600} defaultValue="The queue reached the road before 08:00." />
            <Select label="State" options={[{ value: "oyo", label: "Oyo" }, { value: "lagos", label: "Lagos" }]} />
          </div>
        )}
      </Group>

      <Group id="ink-receipt" title="ReceiptCard" note="The ticket: eyebrow, code, time, tear line with notches, Copy and Save. Copy shows Copied for 2 s.">
        {() => (
          <ReceiptCard
            code="EG-4H7Q-92KD"
            receivedAt={NOW}
            animate={false}
            next={["A trained reviewer reads your report.", "If they have a question, it shows under My reports.", "Check the status any time with this code."]}
          />
        )}
      </Group>

      <Group id="ink-rows" title="ReportRow (ListCard) and EmptyState" note="Unread is bold with a dot. EmptyState takes an optional spot illustration.">
        {() => (
          <div className={styles.stack}>
            <ReportList label="My reports">
              <ReportRow href="#ink-rows" category="queues" categoryLabel="Queues or crowding" place="PU 009, Ward 07" observedAt={NOW} reference="EG-4H7Q-92KD" status="question" unread />
              <ReportRow href="#ink-rows" category="equipment" categoryLabel="Equipment failure" place="PU 009, Ward 07" observedAt={NOW - 3_600_000} reference="EG-8M2C-17TR" status="in-review" />
              <ReportRow href="#ink-rows" category="materials" categoryLabel="Late or missing materials" place="PU 009, Ward 07" observedAt={NOW - 7_200_000} status="on-phone" />
            </ReportList>
            <EmptyState
              title="No reports yet."
              art={
                <svg viewBox="0 0 120 90" width="120" height="90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="26" y="14" width="50" height="64" rx="5" />
                  <path d="M38 30h26M38 42h26M38 54h16" />
                  <path d="m78 70 22-30 6 4-22 30-9 4z" />
                </svg>
              }
              action={<Button variant="secondary">Report something</Button>}
            >
              <p>When you send a report, it will show here.</p>
            </EmptyState>
          </div>
        )}
      </Group>

      <Group id="ink-suggestion" title="SuggestionCard" note="Eyebrow reads Suggested, not decided.">
        {() => (
          <div className={styles.stack}>
            <SuggestionCard field="Category" value="Intimidation or violence" confidence="high" reasons={["Danger reported", "Seen firsthand"]} />
            <SuggestionCard field="Urgency" value="Normal" confidence="low" reasons={["No danger reported"]} state="accepted" />
          </div>
        )}
      </Group>

      <Group id="ink-sunrings" title="SunRings" note="Static, and a one-shot ripple (press to replay).">
        {() => (
          <div className={styles.row}>
            <SunRings size={120} />
            <SunRings size={120} rings={4} />
            <SunRings key={ripple} size={120} ripple>
              <span style={{ fontWeight: 800 }}>EG</span>
            </SunRings>
            <Button variant="secondary" onClick={() => setRipple((n) => n + 1)}>
              Replay ripple
            </Button>
          </div>
        )}
      </Group>

      <Group id="ink-dayarc" title="DayArc" note="Sun follows the WAT clock: before dawn (below the line), mid-morning, afternoon, after closing. Six stages, names only in the hidden list.">
        {() => (
          <div className={styles.stack}>
            {[
              { at: "2026-11-22T06:10:00+01:00", sent: 0, next: "Next: Arrival" },
              { at: "2026-11-22T09:40:00+01:00", sent: 2, next: "Next: Accreditation" },
              { at: "2026-11-22T14:50:00+01:00", sent: 4, next: "Next: Closing and counting" },
              { at: "2026-11-22T18:20:00+01:00", sent: 6, next: "All stages sent" },
            ].map((item) => (
              <div key={item.at} className={styles.card}>
                <p className={styles.cardTitle}>Polling-day checklist: {item.sent} of 6 sent</p>
                <DayArc
                  stages={stagesFor(item.sent)}
                  now={new Date(item.at)}
                  nextLabel={item.next}
                  listLabel="Polling-day stages"
                  stateLabels={stateLabels}
                />
              </div>
            ))}
          </div>
        )}
      </Group>

      <Group id="ink-hero" title="HeroCard" note="Default and intake paused (sun greyed, not interactive).">
        {() => (
          <div className={styles.stack}>
            <HeroCard title="Report something" body="Tell us what you see at your polling unit." href="#ink-hero" />
            <HeroCard title="Report something" paused pausedText="New reports are paused. You can still write them; they will wait on this phone." />
          </div>
        )}
      </Group>

      <Group id="ink-question" title="QuestionCard" note="Empty (Send disabled), filled, sending, sent.">
        {() => (
          <div className={styles.stack}>
            <QuestionCard
              eyebrow="Reviewer question - 09:41"
              question="Was the ballot box sealed when the voting started?"
              label="Your answer"
              value={answer}
              onChange={setAnswer}
              onSend={() => {}}
              sendLabel="Send answer"
            />
            <QuestionCard
              eyebrow="Reviewer question - 09:41"
              question="Was the ballot box sealed when the voting started?"
              label="Your answer"
              value={filled}
              onChange={setFilled}
              onSend={() => {}}
              sendLabel="Send answer"
              sending
            />
            <QuestionCard
              eyebrow="Reviewer question - 09:41"
              question="Was the ballot box sealed when the voting started?"
              label="Your answer"
              value=""
              onChange={() => {}}
              onSend={() => {}}
              sendLabel="Send answer"
              sent
              sentText="Sent. The reviewer will see it."
            />
          </div>
        )}
      </Group>

      <Group id="ink-segmented" title="SegmentedControl" note="Paper tone (private pages) and sun tone (public pages). Arrow keys move.">
        {() => (
          <div className={styles.stack}>
            <SegmentedControl
              label="Filter reports"
              value={seg}
              onChange={setSeg}
              options={[
                { value: "all", label: "All (5)" },
                { value: "needs", label: "Needs you (1)" },
                { value: "phone", label: "On this phone (2)" },
              ]}
            />
            <SegmentedControl
              tone="sun"
              label="Area"
              value={segSun}
              onChange={setSegSun}
              options={[
                { value: "nation", label: "Nation" },
                { value: "state", label: "State" },
                { value: "lga", label: "LGA" },
              ]}
            />
          </div>
        )}
      </Group>

      <Group id="ink-toast" title="Toast" note="One at a time, ink fill, above the action bar. Polite live region. The second button shows Undo (5 s).">
        {() => <ToastButtons />}
      </Group>

      <Group id="ink-outbox" title="OutboxBadge" note="Waiting, sending (ring), failed (triangle), and a bump when the count goes up.">
        {() => (
          <div className={styles.row}>
            <OutboxBadge count={count} label={`${count} reports waiting to send`} />
            <OutboxBadge count={2} state="sending" label="2 reports sending" />
            <OutboxBadge count={1} state="failed" label="1 report did not send" />
            <Button variant="secondary" onClick={() => setCount((n) => n + 1)}>
              Add one
            </Button>
          </div>
        )}
      </Group>

      <Group id="ink-skeleton" title="Skeleton" note="Appears after 300 ms; shimmer 1.2 s; none under reduced motion.">
        {() => (
          <div className={styles.stack} aria-busy="true">
            <Skeleton lines={1} height={56} />
            <Skeleton lines={3} />
          </div>
        )}
      </Group>

      <Group id="ink-art" title="ArtPlate" note="Light: the art meets the paper. Dark: a rounded paper window with a soft fade. Inline SVG here; real plates arrive in Phase 1.">
        {() => (
          <ArtPlate>
            <PlateArt />
          </ArtPlate>
        )}
      </Group>

      <Group id="ink-nav" title="BottomNav and AppShell bars" note="Home bar (mark and name, outbox, menu), task bar (Back, Stepper), bottom navigation with a needs-you badge.">
        {(theme) => (
          <div className={styles.stack}>
            <div className={styles.frame}>
              <AppShell
                preview
                theme={theme}
                variant="home"
                hideBack
                end={<OutboxBadge count={2} label="2 reports waiting to send" />}
                onMenu={() => {}}
                offline
                actions={<Button block>Report something</Button>}
              >
                <h1 style={{ font: "var(--t-title)", margin: 0 }}>Good morning</h1>
              </AppShell>
            </div>
            <div className={styles.frame}>
              <AppShell preview theme={theme} title="Step 3 of 7" offline={false} actions={<Button block>Continue</Button>}>
                <Stepper current={3} total={7} />
                <h1 style={{ font: "var(--t-title)", margin: 0 }}>Where did it happen?</h1>
              </AppShell>
            </div>
            <BottomNav
              label="Main"
              items={[
                { href: "#ink-nav", label: "Home", icon: <Icons.HomeIcon />, current: true },
                { href: "#ink-nav", label: "My reports", icon: <Icons.ListIcon />, badge: 2, badgeLabel: "2 need you" },
                { href: "#ink-nav", label: "Profile", icon: <Icons.UsersIcon /> },
              ]}
            />
          </div>
        )}
      </Group>

      <Group id="ink-sheet" title="Sheet" note="Native dialog: focus moves in, Tab is trapped, Escape closes, focus returns to the trigger.">
        {(theme) => (
          <>
            <Button variant="secondary" onClick={() => setSheet(theme)}>
              Open sheet ({theme})
            </Button>
            <Sheet
              open={sheet === theme}
              onClose={() => setSheet(null)}
              title="Withdraw this report?"
              description={<p>A reviewer has not started yet. Once you withdraw it, they will not see it.</p>}
              footer={
                <>
                  <Button variant="danger" block onClick={() => setSheet(null)}>
                    Withdraw report
                  </Button>
                  <Button variant="secondary" block onClick={() => setSheet(null)}>
                    Keep it
                  </Button>
                </>
              }
            />
          </>
        )}
      </Group>

      <section className={styles.section} aria-labelledby="ink-200-h" data-testid="ink-200">
        <h2 className={styles.sectionTitle} id="ink-200-h">
          200% text
        </h2>
        <p className={styles.note}>A 390 px phone at double size (195 px of layout): tiles go to one column, titles wrap, nothing is cut.</p>
        <div className={styles.zoomFrame} data-theme="light">
          <div className={styles.zoomInner}>
            <Stepper current={1} total={7} />
            <ChoiceTileGroup
              legend="What happened?"
              headingLevel={2}
              name="zoom-cat"
              value="queues"
              onChange={() => {}}
              columns={2}
              options={categories.slice(0, 3)}
            />
            <HeroCard title="Report something" body="Tell us what you see at your polling unit." href="#ink-200" />
            <div style={{ height: 12 }} />
            <Button block>Continue</Button>
          </div>
        </div>
      </section>
    </>
  );
}

export function InkGallery() {
  return (
    <div className={styles.inkRoot}>
      <h2 className={styles.inkTitle}>Ink and Paper</h2>
      <p className={styles.note}>Phase 0 foundations. Each group shows light and dark side by side.</p>
      <PairedStates />
    </div>
  );
}
