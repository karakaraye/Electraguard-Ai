"use client";

/*
 * Development-only component gallery. Sample text here is neutral filler for
 * reviewing layout and states; it is never shipped to a production route.
 */
import { useState, type ComponentType, type ReactNode } from "react";
import {
  AppShell,
  Banner,
  Button,
  ButtonLink,
  ChoiceTileGroup,
  DataTable,
  EmptyState,
  Field,
  LanguageSwitcher,
  MetricTile,
  ReceiptCard,
  ReportList,
  ReportRow,
  SearchSelect,
  Select,
  Sheet,
  StaffShell,
  StatusBadge,
  Stepper,
  SuggestionCard,
  TextArea,
  ThemeSwitcher,
  ToastProvider,
  Timeline,
  UploadItem,
  UploadList,
  WhenPicker,
  YesNo,
  type ReportStatus,
  type StatusTone,
  type ThemePreference,
  type WhenValue,
} from "../../../../ui";
import * as Icons from "../../../../ui/icons";
import { categoryPictograms, incidentCategories, type IconProps, type IncidentCategory } from "../../../../ui/icons";
import { InkGallery } from "./gallery-ink";
import styles from "./gallery.module.css";

const categoryNames: Record<IncidentCategory, string> = {
  materials: "Late or missing materials",
  equipment: "Equipment failure",
  queues: "Queues or crowding",
  intimidation: "Intimidation or violence",
  access: "Access barrier",
  information: "People lack information",
  misinformation: "Misinformation seen here",
  inducement: "Vote buying or inducement",
  "good-practice": "Good practice",
  "not-sure": "Not sure",
};

const states = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi",
  "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
  "Taraba", "Yobe", "Zamfara",
];

const iconEntries = Object.entries(Icons).filter(
  ([name, value]) => name.endsWith("Icon") && typeof value === "function",
) as [string, ComponentType<IconProps>][];

const allStatuses: ReportStatus[] = [
  "on-phone", "not-confirmed", "received", "in-review", "question", "closed", "withdrawn", "saved", "failed", "urgent",
];
const tones: StatusTone[] = ["ok", "attn", "wait", "danger", "info"];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={`${id}-h`}>
      <h2 className={styles.sectionTitle} id={`${id}-h`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Specimen({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={`${styles.specimen} ${wide ? styles.wide : ""}`}>
      <figcaption className={styles.specimenLabel}>{label}</figcaption>
      <div className={styles.specimenBody}>{children}</div>
    </figure>
  );
}

const queueRows = [
  { ref: "EG-4H7Q-92KD", urgency: "Urgent", rank: 0, category: "Intimidation or violence", area: "Ward 3", reports: 6 },
  { ref: "EG-8M2C-17TR", urgency: "High", rank: 1, category: "Equipment failure", area: "Ward 11", reports: 2 },
  { ref: "EG-2P9V-55AL", urgency: "Normal", rank: 2, category: "Late or missing materials", area: "Ward 7", reports: 14 },
  { ref: "EG-6W3N-80QE", urgency: "Low", rank: 3, category: "Good practice", area: "Ward 2", reports: 1 },
];

export function Gallery() {
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [category, setCategory] = useState<string | null>("queues");
  const [danger, setDanger] = useState<boolean | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [when, setWhen] = useState<WhenValue>({ mode: "now" });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [story, setStory] = useState("");
  const [suggestion, setSuggestion] = useState<"pending" | "accepted" | "corrected">("pending");
  const [selectedCase, setSelectedCase] = useState("EG-4H7Q-92KD");
  const [loading, setLoading] = useState(false);
  const fixedNow = Date.parse("2026-11-22T13:05:00+01:00");

  return (
    <ToastProvider>
    <div className={styles.gallery} data-theme={theme} data-testid="gallery">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Component gallery</h1>
          <p className={styles.lede}>Every design-system component in every state. Development builds only.</p>
        </div>
        <fieldset className={styles.themeControl}>
          <legend className="eg-sr-only">Gallery theme</legend>
          {(["system", "light", "dark"] as const).map((value) => (
            <label key={value} className={styles.themeOption} data-checked={theme === value || undefined}>
              <input type="radio" name="gallery-theme" value={value} checked={theme === value} onChange={() => setTheme(value)} />
              <span>{value === "system" ? "Device" : value === "light" ? "Light" : "Dark"}</span>
            </label>
          ))}
        </fieldset>
      </header>

      <InkGallery />

      <Section id="type" title="Type scale">
        <div className={styles.typeScale}>
          <p style={{ font: "var(--t-display)" }} className="eg-tnum">EG-4H7Q-92KD</p>
          <p style={{ font: "var(--t-title)" }}>What happened?</p>
          <p style={{ font: "var(--t-heading)" }}>Section heading</p>
          <p style={{ font: "var(--t-body-lg)" }}>Observer body text. Ẹ ọ ṣ ị ụ ṅ ɓ ɗ ƙ ƴ, Ọ̀yọ́, Ìgbò, Ɓauchi, ₦2,500.</p>
          <p style={{ font: "var(--t-body)" }}>Staff body text at sixteen pixels.</p>
          <p style={{ font: "var(--t-small)", color: "var(--ink-2)" }}>Meta and timestamps, 14:05 WAT</p>
          <p style={{ font: "var(--t-label)", letterSpacing: "var(--t-label-tracking)" }}>Field label</p>
        </div>
      </Section>

      <Section id="colour" title="Colour">
        <div className={styles.swatches}>
          {["ink", "ink-2", "ink-3", "paper", "paper-2", "rule", "rule-control"].map((name) => (
            <div key={name} className={styles.swatch}>
              <span className={styles.chip} style={{ background: `var(--${name})` }} />
              <code>--{name}</code>
            </div>
          ))}
        </div>
        <div className={styles.row}>
          {tones.map((tone) => (
            <StatusBadge key={tone} tone={tone} label={`--${tone}`} />
          ))}
        </div>
      </Section>

      <Section id="icons" title="Icons (24 px, 1.75 stroke)">
        <ul className={styles.iconGrid}>
          {iconEntries.map(([name, Icon]) => (
            <li key={name}>
              <Icon />
              <span>{name.replace(/Icon$/, "")}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="pictograms" title="Category pictograms (40 px)">
        <ul className={styles.pictoGrid}>
          {incidentCategories.map((key) => {
            const Pictogram = categoryPictograms[key];
            return (
              <li key={key}>
                <Pictogram />
                <span>{categoryNames[key]}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section id="buttons" title="Button">
        <div className={styles.grid}>
          <Specimen label="Variants">
            <div className={styles.stack}>
              <Button>Continue</Button>
              <Button variant="secondary">Save for later</Button>
              <Button variant="quiet">Edit</Button>
              <Button variant="danger">Withdraw report</Button>
            </div>
          </Specimen>
          <Specimen label="Disabled, loading, icon, link">
            <div className={styles.stack}>
              <Button disabled>Continue</Button>
              <Button loading={loading} onClick={() => setLoading(true)} loadingLabel="Sending">
                Send report
              </Button>
              <Button loading variant="secondary">
                Save for later
              </Button>
              <Button variant="secondary" icon={<Icons.CameraIcon />}>
                Take photo
              </Button>
              <ButtonLink href="#buttons" variant="secondary" icon={<Icons.ArrowRightIcon />}>
                Link styled as a button
              </ButtonLink>
            </div>
          </Specimen>
          <Specimen label="Staff density (44 px, 48 px target)">
            <div className={styles.stack} data-density="staff">
              <Button>Start review</Button>
              <Button variant="secondary">Ask a formal question</Button>
              <Button variant="quiet">Cancel</Button>
            </div>
          </Specimen>
        </div>
      </Section>

      <Section id="choice" title="ChoiceTile and YesNo">
        <div className={styles.grid}>
          <Specimen label="ChoiceTile: one selected" wide>
            <ChoiceTileGroup
              legend="What happened?"
              headingLevel={2}
              hint="Choose the closest one. Not sure is fine."
              name="category"
              value={category}
              onChange={setCategory}
              options={incidentCategories.map((key) => ({
                value: key,
                label: categoryNames[key],
                pictogram: categoryPictograms[key],
              }))}
            />
          </Specimen>
          <Specimen label="ChoiceTile: error and disabled">
            <ChoiceTileGroup
              legend="Which material is missing?"
              name="material-error"
              value={null}
              onChange={() => {}}
              columns={2}
              error="Choose one to continue."
              options={[
                { value: "a", label: "Ballot papers", pictogram: categoryPictograms.materials },
                { value: "b", label: "Card reader", pictogram: categoryPictograms.equipment, disabled: true },
              ]}
            />
          </Specimen>
          <Specimen label="YesNo">
            <div className={styles.stack}>
              <YesNo legend="Is anyone in danger right now?" name="danger" value={danger} onChange={setDanger} />
              <YesNo
                legend="Did you see this yourself?"
                name="firsthand"
                value={null}
                onChange={() => {}}
                yesLabel="I saw it"
                noLabel="Someone told me"
                error="Choose one to continue."
              />
              <YesNo legend="Disabled" name="disabled-yn" value={true} onChange={() => {}} disabled />
            </div>
          </Specimen>
        </div>
      </Section>

      <Section id="fields" title="Field, TextArea, Select, SearchSelect">
        <div className={styles.grid}>
          <Specimen label="Field states">
            <div className={styles.stack}>
              <Field label="Observer code" hint="It is on your card, for example OBS-7K2P." numeric autoCapitalize="characters" />
              <Field label="PIN" type="password" inputMode="numeric" numeric error="That PIN is not right. 2 tries left." defaultValue="123" />
              <Field label="Note to reviewer" optional />
              <Field label="Receipt code" disabled defaultValue="EG-4H7Q-92KD" numeric />
            </div>
          </Specimen>
          <Specimen label="TextArea with count">
            <div className={styles.stack}>
              <TextArea
                label="Tell us what happened"
                hint="What you saw, who was affected (no names), and is it still happening."
                maxLength={600}
                value={story}
                onChange={(event) => setStory(event.target.value)}
              />
              <TextArea label="Near the limit" maxLength={60} defaultValue="This sample text is close to the sixty character limit." />
              <TextArea label="With an error" error="Please describe roles, not names." defaultValue="Sample text" rows={3} />
            </div>
          </Specimen>
          <Specimen label="Select and SearchSelect">
            <div className={styles.stack}>
              <Select label="State" options={states.map((s) => ({ value: s, label: s }))} />
              <Select label="Queue size" error="Choose one." options={[{ value: "0", label: "None" }, { value: "1", label: "Fewer than 50" }]} />
              <SearchSelect
                label="Polling unit or ward"
                hint="Search by name or code. Works without network."
                options={states.map((s, i) => ({ value: s, label: s, detail: `${String(i + 1).padStart(2, "0")}-${(i * 7) % 30}` }))}
                value={place}
                onChange={setPlace}
                placeholder="Type a name or code"
              />
              <SearchSelect label="Disabled" options={[]} value={null} onChange={() => {}} disabled />
            </div>
          </Specimen>
        </div>
      </Section>

      <Section id="when" title="WhenPicker">
        <div className={styles.grid}>
          <Specimen label="Interactive">
            <WhenPicker name="when" value={when} onChange={setWhen} />
          </Specimen>
          <Specimen label="Earlier today, missing time (after Continue)">
            <WhenPicker name="when-err" value={{ mode: "today" }} onChange={() => {}} showErrors />
          </Specimen>
          <Specimen label="Another day, more than 7 days ago">
            <WhenPicker name="when-old" value={{ mode: "day", date: "2026-11-01", time: "09:30" }} onChange={() => {}} />
          </Specimen>
        </div>
      </Section>

      <Section id="progress" title="Stepper and StatusBadge">
        <div className={styles.grid}>
          <Specimen label="Stepper">
            <Stepper current={1} total={7} />
            <Stepper current={3} total={7} />
            <Stepper current={7} total={7} />
          </Specimen>
          <Specimen label="StatusBadge: every report state" wide>
            <div className={styles.row}>
              {allStatuses.map((status) => (
                <StatusBadge key={status} status={status} />
              ))}
              <StatusBadge status="question" size="lg" />
            </div>
          </Specimen>
        </div>
      </Section>

      <Section id="receipt" title="ReceiptCard">
        <div className={styles.grid}>
          <Specimen label="After server confirmation">
            <ReceiptCard
              code="EG-4H7Q-92KD"
              receivedAt={fixedNow}
              next={[
                "A reviewer will look at it.",
                "If they have a question, it appears under My reports.",
                "Check the status any time with this code.",
              ]}
            />
          </Specimen>
        </div>
      </Section>

      <Section id="lists" title="ReportRow and EmptyState">
        <div className={styles.grid}>
          <Specimen label="My reports">
            <ReportList label="My reports">
              <ReportRow href="#lists" category="queues" categoryLabel={categoryNames.queues} place="Ward 3, Unit 014" observedAt={fixedNow} reference="EG-4H7Q-92KD" status="question" note="A reviewer asked you a question." />
              <ReportRow href="#lists" category="equipment" categoryLabel={categoryNames.equipment} place="Ward 3" observedAt={fixedNow - 3_600_000} reference="EG-8M2C-17TR" status="in-review" />
              <ReportRow href="#lists" category="materials" categoryLabel={categoryNames.materials} place="Ward 3, Unit 009" observedAt={fixedNow - 7_200_000} status="on-phone" />
              <ReportRow href="#lists" category="good-practice" categoryLabel={categoryNames["good-practice"]} place="Ward 3, Unit 002" observedAt={fixedNow - 9_000_000} reference="EG-6W3N-80QE" status="closed" />
            </ReportList>
          </Specimen>
          <Specimen label="Empty">
            <EmptyState title="No reports yet." action={<Button variant="secondary">Report something</Button>}>
              <p>Reports you send from this phone appear here.</p>
            </EmptyState>
          </Specimen>
        </div>
      </Section>

      <Section id="feedback" title="Banner and Sheet">
        <div className={styles.grid}>
          <Specimen label="Banners" wide>
            <div className={styles.stack}>
              <Banner tone="attn" title="A reviewer asked you a question" action={<Button variant="secondary">Answer</Button>}>
                <p>Report EG-4H7Q-92KD. Your answer goes only to the reviewer.</p>
              </Banner>
              <Banner tone="danger" critical title="Intake is paused by your organisation">
                <p>Your reports stay on this phone and send when intake resumes.</p>
              </Banner>
              <Banner tone="wait" title="2 reports are waiting to send" />
              <Banner tone="info" title="New guidance for closing time" />
              {bannerOpen ? (
                <Banner tone="ok" title="Settings saved" onDismiss={() => setBannerOpen(false)} />
              ) : (
                <Button variant="quiet" onClick={() => setBannerOpen(true)}>
                  Show the dismissible banner again
                </Button>
              )}
            </div>
          </Specimen>
          <Specimen label="Sheet (bottom sheet on phone, dialog from 600 px)">
            <Button variant="secondary" onClick={() => setSheetOpen(true)} data-testid="open-sheet">
              Open sheet
            </Button>
            <Sheet
              open={sheetOpen}
              onClose={() => setSheetOpen(false)}
              title="Discard this draft?"
              description={<p>Everything you entered for this report will be removed from this phone.</p>}
              footer={
                <>
                  <Button variant="danger" block onClick={() => setSheetOpen(false)}>
                    Discard draft
                  </Button>
                  <Button variant="secondary" block onClick={() => setSheetOpen(false)}>
                    Keep editing
                  </Button>
                </>
              }
            />
          </Specimen>
        </div>
      </Section>

      <Section id="uploads" title="UploadItem">
        <UploadList label="Attachments">
          <UploadItem kind="photo" name="Photo 1" sizeBytes={1_840_000} state="waiting" estimateSeconds={95} onRemove={() => {}} />
          <UploadItem kind="video" name="Video, 42 seconds" sizeBytes={9_400_000} state="uploading" progress={0.4} estimateSeconds={380} />
          <UploadItem kind="voice" name="Voice note, 1 minute" sizeBytes={480_000} state="saved" />
          <UploadItem kind="photo" name="Photo 2" sizeBytes={1_200_000} state="failed" onRetry={() => {}} onRemove={() => {}} />
          <UploadItem kind="file" name="sheet-scan.jpg" sizeBytes={2_100_000} state="missing" onChooseAgain={() => {}} onRemove={() => {}} />
        </UploadList>
      </Section>

      <Section id="language" title="LanguageSwitcher">
        <div className={styles.grid}>
          <Specimen label="List (first open)">
            <LanguageSwitcher />
          </Specimen>
          <Specimen label="Compact (menu, settings)">
            <LanguageSwitcher variant="compact" />
          </Specimen>
        </div>
      </Section>

      <Section id="shell" title="AppShell (observer and citizen)">
        <div className={styles.frames}>
          <div className={styles.frame}>
            <AppShell preview theme={theme} title="New report" onMenu={() => {}} offline={false} actions={<Button block>Continue</Button>}>
              <Stepper current={2} total={7} />
              <YesNo legend="Is anyone in danger right now?" headingLevel={2} name="shell-danger" value={null} onChange={() => {}} />
            </AppShell>
          </div>
          <div className={styles.frame}>
            <AppShell
              preview
              theme={theme}
              title="My reports"
              hideBack
              onMenu={() => {}}
              offline
              queuedCount={2}
              banner={<Banner tone="attn" title="A reviewer asked you a question" />}
              actions={<Button block>Report something</Button>}
            >
              <ReportList label="My reports">
                <ReportRow href="#shell" category="intimidation" categoryLabel={categoryNames.intimidation} place="Ward 3" observedAt={fixedNow} status="on-phone" />
                <ReportRow href="#shell" category="access" categoryLabel={categoryNames.access} place="Ward 3, Unit 014" observedAt={fixedNow - 600_000} reference="EG-2P9V-55AL" status="received" />
              </ReportList>
            </AppShell>
          </div>
        </div>
      </Section>

      <Section id="staff" title="StaffShell, DataTable, SuggestionCard, MetricTile, Timeline">
        <div className={`${styles.frame} ${styles.staffFrame}`}>
          <StaffShell
            preview
            theme={theme}
            title="Queue"
            headerEnd={<ThemeSwitcher />}
            nav={[
              { href: "#staff", label: "Queue", icon: Icons.InboxIcon, current: true, count: 4 },
              { href: "#staff", label: "Operations", icon: Icons.ListIcon },
              { href: "#staff", label: "Discussions", icon: Icons.DiscussionIcon },
              { href: "#staff", label: "Settings", icon: Icons.SlidersIcon },
            ]}
            focus="list"
            list={
              <DataTable
                caption="Open reports"
                columns={[
                  { key: "ref", header: "Reference", rowHeader: true, render: (r) => <span className="eg-tnum">{r.ref}</span> },
                  { key: "urgency", header: "Urgency", sortable: true, sortValue: (r) => r.rank },
                  { key: "area", header: "Area", sortable: true },
                  { key: "reports", header: "Linked", sortable: true, numeric: true },
                ]}
                rows={queueRows}
                rowKey={(r) => r.ref}
                selectedKey={selectedCase}
                onRowActivate={(r) => setSelectedCase(r.ref)}
                initialSort={{ key: "urgency", direction: "ascending" }}
              />
            }
            detail={
              <div className={styles.stack}>
                <div className={styles.metrics}>
                  <MetricTile label="Urgent" value={12} period="Since 07:00 WAT" />
                  <MetricTile label="Open questions" value={3} period="Public view" threshold={5} />
                  <MetricTile label="Received" value={1284} period="Today" />
                </div>
                <SuggestionCard
                  field="Category"
                  value="Intimidation or violence"
                  confidence="high"
                  reasons={["Danger reported", "Seen firsthand", "Two similar reports in Ward 3 within 40 minutes"]}
                  state={suggestion}
                  correctedValue="Queues or crowding"
                  onAccept={() => setSuggestion("accepted")}
                  onCorrect={() => setSuggestion("corrected")}
                />
                <SuggestionCard field="Urgency" value="Normal" confidence="low" reasons={["No danger reported"]} />
                <Timeline
                  label="History"
                  chain="intact"
                  events={[
                    { id: "1", actor: "OBS-7K2P", at: fixedNow - 5_400_000, change: "Report received" },
                    { id: "2", actor: "System", at: fixedNow - 5_300_000, change: "Category suggested", detail: "Intimidation or violence, high confidence" },
                    { id: "3", actor: "Reviewer R-12", at: fixedNow - 1_200_000, change: "Review started" },
                  ]}
                />
                <Timeline
                  label="History with a broken chain"
                  chain="broken"
                  events={[{ id: "4", actor: "System", at: fixedNow, change: "Entry 3 does not match its hash", broken: true }]}
                />
                <DataTable caption="Empty table" columns={[{ key: "a", header: "Reference" }]} rows={[]} rowKey={() => ""} />
              </div>
            }
          />
        </div>
      </Section>
    </div>
    </ToastProvider>
  );
}
