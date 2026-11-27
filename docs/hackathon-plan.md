# ElectraGuard AI: full build plan

**Hackathon:** #AI4Elections (Rise Networks), Track 5: Election Observation and Citizen Accountability, with Tracks 1–4 built into it
**Team:** Kara (team lead, owns `karakaraye/Electraguard-Ai`) and the owner, the two co-owners of Cairn
**Ownership:** ElectraGuard AI is a Cairn product. Company registration is on hold; the owner and Kara will handle it together.
**Branding:** ElectraGuard has its own mark (the E+G monogram) and is credited as "ElectraGuard AI, by Cairn". Cairn products never use the Cairn logo.
**Version:** 2, 22 November 2026. Replaces version 1. Built on the owner's decisions of 22 November.
**Key dates:** forked repo and running notebook by 24 Nov (Bootcamp 1) · one-page sprint plan by 27 Nov (Bootcamp 6) · feature freeze 11 Dec · **submission 13 Dec** · Demo Day 15–16 Dec

---

## 0. The decisions this plan follows

| Decision | Owner's answer | What it means in the build |
|---|---|---|
| Scope | **A complete, fully working system. Nothing skipped, no slides, no mock-ups.** | Every feature in this plan is built end to end, tested and running on Azure. No fake screens, no hard-coded results. |
| Observer sign-in | **Observer codes, not email** | Observers use a code + PIN. No name, email or phone in the observation system. |
| AI-assistance disclosure | Do it, sensibly | One factual line in the README acknowledgements and the per-part note that the template asks for (section 13.3) |
| Hosting | **Microsoft Azure**, through the organisers' partnership; login details come through the hackathon Slack, which has not been shared yet | Azure work waits for the Slack and the login. Until then everything is built and tested on the existing Docker stack. Section 9 stays the target design. |
| Company | **Cairn**, co-owned by the owner and Kara; registration on hold (22 Nov) | Footer and README credit: "ElectraGuard AI, by Cairn". No Cairn logo on the product. |
| Product mark | **E+G monogram** (direction B, `design/brand`) | Used in the app bar, icons and favicon; Cairn stones and the tally mark are rejected |
| Build order | **Front end designed first, properly, then the logic behind it**; both designed together so every screen has a real API behind it and every API has a screen | Section 11.2 changed: a design phase with screen-by-screen API contracts comes before feature logic |
| Coordination | One shared plan | This plan, the reviews in `docs/reviews/` and the pull request history |
| Languages | Owner translates and approves | All text is drafted in English, Pidgin, Hausa, Yorùbá and Igbo. The owner corrects and signs off each language. |
| Template fork | Use the official repo | Section 1.2 explains it and gives the exact steps |

**One thing "fully functional" cannot mean:** real election records. The rules forbid real personal data and any contact with live electoral systems. The system is fully working and ships empty; we run it with the official synthetic data. A real observation group could start using it with their own accounts after the approvals in the Safety document.

---

## 1. What we are missing, and what to do (from the official GitHub repo)

I read every file in `Rise-Networks-AI-Labs/-AI4Elections-Hackathon`, including the 21 November updates. Tracks 1 and 2 were renamed:
- Track 1 is now "AI and Trustworthy Electoral Information".
- Track 2 is now "Electoral Data Analysis, Operational Insight and Decision Support". Our coordinator tools fit that new wording directly.

### 1.1 Checklist

| # | Missing item | Why it matters | Who | By |
|---|---|---|---|---|
| 1 | **Our repo is not a fork of the official repo** | Bootcamp 1 expects "Team repo forked"; the rules say "Public repo forked from the hackathon template" | Kara (it is Kara's account) with engineering | 24 Nov |
| 2 | **No `LICENSE` file** | Required; the template says MIT/Apache for code, CC BY 4.0 for docs/data | Engineering | 24 Nov |
| 3 | **No starter notebook running in our repo** | Bootcamp success measure: "running notebook and repo" | Engineering | 24 Nov |
| 4 | **One-page sprint plan** | Bootcamp 6 output, due 27 Nov | Drafted from this plan, owner sends | 27 Nov |
| 5 | **README does not follow the official template** (track, team, problem ID, does/does NOT, demo, results table, languages, team, licence, AI note) | Judges compare against the template | Design | 12 Dec |
| 6 | **Model/System Card** | Mandatory | Design | 12 Dec |
| 7 | **Safety and Limitations** (risk register + signed statement) | Mandatory; "honest limits score better" | Design, signed by Kara | 12 Dec |
| 8 | **Datasheet** for every dataset we create (translations, paraphrases, generated result sheets, voice and video test clips) | Mandatory | Design | 12 Dec |
| 9 | **Evaluation report** (official template: test data, baselines, per-slice results, human-in-the-loop impact, robustness, usability, failures, reproducibility) | Mandatory evidence | Design + engineering | 12 Dec |
| 10 | **Architecture doc** (official template incl. STRIDE table and decisions log) | Expected | Design | 12 Dec |
| 11 | **API reference** (official template) | Expected | Engineering | 12 Dec |
| 12 | **Problem statement, 1 page** | Mandatory | Design | 30 Nov |
| 13 | **Methodology** | Mandatory | Design | 12 Dec |
| 14 | **Demo video, max 3 minutes** | Mandatory | Owner + design | 12 Dec |
| 15 | **Hosted demo link** (Azure) | "demo link or reproducible setup" | Engineering once Azure access arrives | 9 Dec |
| 16 | **Usability test with real users, with consent** | Track 3 and 5 success criteria; Bootcamp 5 | Owner runs, design scripts | 10 Dec |
| 17 | **Per-language evaluation table** | Bootcamp 3 output; Track 1/3 criteria | Engineering runs, design plans | 9 Dec |
| 18 | **Threat model** | Bootcamp 4 output; M6 task | Design | 5 Dec |
| 19 | **Harm/benefit table** | M1 task; goes into Safety doc | Design | 30 Nov |
| 20 | **Electoral process map** (where humans and INEC decide) | M0 task; strengthens "electoral relevance" | Design | 30 Nov |
| 21 | **Accessibility audit** (axe/Lighthouse + TalkBack) | M7 task; WCAG 2.2 AA | Engineering runs, owner checks on Redmi | 10 Dec |
| 22 | **Mentor clinics booked** (legal/data protection, accessibility, electoral) | Clinics end 30 Nov | Owner/Kara | 24 Nov |
| 23 | **Azure login details** from the organisers | Needed for hosting | Owner/Kara | ASAP |
| 24 | **Team contact and prize recipient nominated, agreed in writing** | Onboarding checklist | Kara | 24 Nov |
| 25 | **AI-assistance note** | Code of Conduct + template | Design | 12 Dec |

### 1.2 The "template fork", in plain words

The organisers' GitHub project is the **template**. A **fork** is GitHub's linked copy of someone else's project under your own account. The judges can then see your project grew from theirs. Ours was created separately, so it is not linked.

Steps. Kara must do 1–3 because the repo is on Kara's account:
1. On GitHub, rename `karakaraye/Electraguard-Ai` to `Electraguard-Ai-archive` (Settings → Repository name). Nothing is lost.
2. Open `github.com/Rise-Networks-AI-Labs/-AI4Elections-Hackathon` and click **Fork**, under `karakaraye`.
3. Rename the fork to `Electraguard-Ai`.
4. Engineering then pushes all our branches into the fork and merges our code with the template files (`git merge --allow-unrelated-histories`).
   - Our README stays the main one; the template README moves to `docs/hackathon/README.md`.
   - The official `data/`, `notebooks/` and `docs/05_templates/` stay where they are. We use them directly.
5. Push the GitHub Actions workflows again, and check that the CI runs pass on the fork.

The full history of our work is kept, and the repo becomes a proper fork.

---

## 2. The product

### 2.1 One sentence

**ElectraGuard AI helps election observers and citizens report what they see quickly, safely and in their own language, even without network. It helps reviewers handle every report with AI support and human decisions, and it shows the public verified, privacy-safe results of observation.**

The loop it closes (this is Track 5):

```
SEE → RECORD (offline, any language, no identity) → RECEIPT → REVIEW (AI ranks and checks, a person decides)
    → ANSWER the reporter → PUBLISH safe, verified totals → PREVENT (warnings, rumour response)
```

### 2.2 How each track lives inside Track 5

| Track | Official problem IDs we cover | What it becomes inside ElectraGuard |
|---|---|---|
| **5** Observation and accountability | 5A, 5B, 5C, 5D, 5E: all of them | The whole product: checklist, incident reports, triage, evidence hygiene, public information, feedback loop |
| **1** Trustworthy electoral information | 1A, 1B, 1D | **Rumour desk:** coordinators rank incoming viral messages by likely harm (1A); match each against verified observations and past responses (1B); guided image checks without a fake/real verdict (1D). Observers can report "misinformation seen here". |
| **2** Data analysis, operational insight, decision support | 2A, 2B, 2C, 2D | **Result-sheet check:** the observer enters or photographs the publicly posted sheet; OCR reads it (2B); arithmetic checks (2A) with a plain explanation and benign causes (2D). **Operations room:** cluster warnings, observer coverage gaps, late-materials risk from logistics data (2C). |
| **3** Inclusive and multilingual | 3A, 3B, 3C, 3E | 5 languages everywhere for observers and the public; voice input; picture categories; offline app; **SMS/USSD channel** (3B); screen-reader-first (3C); accessibility-barrier reporting (3E); **"Ask ElectraGuard"** answers only from approved, cited documents (3A + 5D) |
| **4** Cybersecurity and resilience | 4A, 4B, 4D, 4E | No identity by default; privacy thresholds on public data (4B); hash-chained audit and evidence (4D); **security monitor** that watches our own logs for abuse (4A); STRIDE/LINDDUN threat model with working controls (4E); encrypted backups and restore (exists) |

### 2.3 People who use it

| Role | Who | Device | Signs in with |
|---|---|---|---|
| **Observer** | Accredited volunteer of an observation organisation | Low-end Android, often 2G or none | Observer code + PIN |
| **Citizen** | Any voter | Any phone, including basic phones via SMS/USSD | Nothing; gets a receipt code |
| **Reviewer** | Trained staff | Laptop/tablet | Named email + password + authenticator app |
| **Moderator** | Staff who oversee discussions | Laptop/phone | Named email + 2FA |
| **Coordinator** | Situation-room lead | Laptop | Named email + 2FA |
| **Organisation admin** | Runs accounts for one organisation | Laptop | Named email + 2FA |
| **Public** | Anyone | Browser, SMS | Nothing |

The current "Administrator" role is split into **Coordinator** (operations) and **Organisation admin** (accounts). This separates who sees cases from who manages people.

### 2.4 Identity and privacy model

- **Observer codes:** the organisation admin creates codes in batches (e.g. `OBS-7K2P`), prints them on a card with a one-time setup PIN, and hands them out at training. On first sign-in the observer sets their own 6-digit PIN. The system stores only the code and a hashed PIN. If the organisation must know who holds a code, it keeps that list **outside** ElectraGuard.
- **Lost phone or code:** the admin revokes the code (all sessions end at once) and issues a new one. The observer's earlier reports stay with the old code.
- **Citizens:** no account. The phone creates a random secret; the citizen sees a short receipt code (`EG-4H7Q-92KD`) and can check status with it on the web or by SMS. Citizen reports show "Citizen, not accredited" to reviewers.
- **Staff:** named accounts with 2FA (authenticator app). Decisions need accountable people.
- **Shared phones:** by default no copy of a received report stays on the phone; "Sign out and clear this phone" is one tap.
- **Multiple organisations:** each organisation's data is separated by an organisation ID enforced on every query and covered by tests (section 7.2). Organisations never see each other's reports. The public page can show combined totals.

---

## 3. Report lifecycle (one model for the whole system)

```
                ┌──────────── withdraw (content deleted, stub kept) ────────────┐
                │                                                               │
On this phone ──send──▶ Received ──start──▶ In review ──close──▶ Closed (outcome)
 (not sent)                │                    │   ▲
                           │                    ▼   │ reply
                           │            Question for you
                           └─ withdraw allowed until review starts
```

| State | Where it exists | What the observer sees |
|---|---|---|
| On this phone | Device only | "Saved on this phone. It will send when you have network." Never shown as sent. |
| Received | Server confirmed | Receipt code, time received, "A reviewer will look at it." |
| In review | Server | "Being reviewed" |
| Question for you | Server | The reviewer's question with a reply box, at the top of the report |
| Closed | Server | Outcome in plain language: *Confirmed by evidence* · *Not enough evidence* · *Outside what we observe* |
| Withdrawn | Server stub | "You withdrew this report." Text, photos, video and voice are deleted. |

Times: every report keeps the **observed time** (what the observer entered) and the **received time** (server). Both show to reviewers. The dashboard uses observed time in West Africa Time (as now).

---

## 4. Observer and citizen app: every screen and its logic

**Built new from scratch** as its own app section (`/o/…` for observers, `/r/…` for citizens), with its own components and styles. The old observer pages are deleted once the new ones pass all tests. The backend rules that already work (idempotent receipts, private evidence, assignment, clarification, closure snapshot) are kept and extended.

### 4.1 First open

1. **Language:** five large buttons, each in its own language: English · Naijá · Hausa · Yorùbá · Igbo. Changeable any time from the menu; drafts are kept.
2. **What this app keeps:** three lines with an audio play button. "We don't ask your name. Photo locations are removed. You can withdraw a report."
3. **I'm an accredited observer** (code + PIN) or **Report as a citizen** (no account).
4. **Install:** "Add to home screen so it works without network." Shown once.

### 4.2 Home

- **Report something** (primary).
- **Polling-day checklist** (observers).
- **My reports**, each with its state badge.
- **Messages**: a count of reports with a question or new message.
- **Discussions** (observers who joined one).
- **Ask ElectraGuard** (help and rules from approved documents).
- Network bar: "Offline. Reports will send when you have network."

### 4.3 Incident report: steps in this order

Each step is one screen. A labelled **Back** keeps every value. The primary button stays above the keyboard.

| # | Screen | Logic and rules |
|---|---|---|
| 1 | **What happened?** Picture tiles: Late or missing materials · Equipment failure · Queues or crowding · Intimidation or violence · Access barrier · People lack information · Misinformation seen here · Vote buying or inducement · Good practice · **Not sure** | Matches the official dataset categories plus two observation-standard ones. "Not sure" is fine; the AI suggests one later. |
| 2 | **Is anyone in danger right now?** Yes / No | Yes: an emergency guidance screen at once ("Move to a safe place. Call 112."), then continue. Sets urgency to the top. The app does not dispatch anyone and says so. |
| 3 | **Where?** Search a polling-unit code, or choose State → LGA → Ward → Unit (the list is stored on the phone). "I don't know the unit" → ward only. | **Never GPS.** Works offline. |
| 4 | **When?** *Just now* (default) · *Earlier today* → time · *Another day* → date. "West Africa Time" always shown. | No future times. Earlier than 7 days asks for confirmation. |
| 5 | **Tell us what happened.** Text box with three hints: what you saw, who was affected (no names), is it still happening. **🎤 Speak** button for dictation into the same box. "I saw this myself / Someone told me". | Dictation fills editable text; the observer decides what stays. A name check warns if text seems to name a person: "Please describe roles, not names." |
| 6 | **Add evidence (optional).** Take photo · Record video (max 60 s) · Record voice note (max 2 min) · Choose file. Preview, retake, remove. **Blur faces** toggle for photos and video. | Location data is removed **on the phone** before upload and again on the server. Photos are resized to 2 MiB; video is compressed to 720p. Each item shows its size and the expected upload time on the current network. |
| 7 | **Check and send.** Summary with Edit links for every part. **Send report** | Offline → "Saved on this phone". Online → sends the text first, then each attachment separately. |
| 8 | **Receipt.** Shown only after server confirmation: the receipt code, time, "What happens next". Then each attachment: *Waiting for network · Uploading 40% · Saved · Try again*. | A failed attachment never hides the receipt. Retries reuse keys, so there are no duplicates. Large files upload in resumable chunks: a dropped connection continues where it stopped. |

### 4.4 Polling-day checklist (5A)

A structured, timestamped form per stage. Any "No" offers **Report this as an incident**, with category, place and time prefilled.

| Stage | Questions |
|---|---|
| Arrival | Polling unit (picker) · arrival time |
| Opening | Opened on time? · All materials present? (list) · Officials present? · Party agents present? |
| Accreditation | Device working? · Queue size (none / <50 / 50–200 / >200) · Priority for elderly, disabled, pregnant? |
| Voting | Secrecy kept? · Assistance available? · Any disruption? · Any inducement seen? |
| Closing and counting | Closed on time? · Counting in public view? · Agents signed? |
| Results posted | Sheet posted publicly? → **Result-sheet check** (4.5) |

Each stage submits as its own report of type "checklist", with the same offline queue, receipt and review.

### 4.5 Result-sheet check (Track 2, with hard safeguards)

1. Take a photo of the **publicly posted** result sheet. OCR reads the numbers on the server (or on the phone when offline, later confirmed online).
2. The observer **confirms each number** against the sheet: registered, accredited, votes per party label, rejected. Typing manually is always available.
3. The server checks **this one sheet only**: accredited exceeds registered · votes + rejected ≠ accredited · suspicious round numbers · identical to another unit's sheet · likely digit swap.
4. A reviewer sees the flags with a plain explanation and **benign explanations** ("could be a copying error on the sheet").

**Safeguards, on screen and in the Safety doc:**
- We never add votes across units and never display party totals or a winner.
- Party labels in all test data are synthetic A–E.
- The screen reads: "Consistency check for review. This is not a result."
- Result-sheet data never appears on the public page.

### 4.6 Offline and sync

- Installable web app. The app files, the polling-unit list, language files and help documents are cached.
- Queued reports and attachments are stored on the device with their keys. They send automatically when the network returns: text first, then attachments, oldest first.
- Limits: 20 queued reports, 150 MB of media. A clear message when full, with options.
- The phone never shows "Received" without the server's confirmation.
- A session that expires while offline keeps the queue; the observer re-enters the PIN on the next send.

### 4.7 Messages on a report

- Each report has **one private conversation** between the observer and the assigned reviewer.
- **Formal question** (reviewer): changes the status to *Question for you*; the observer's reply returns it to *In review*.
- **Ordinary message** (either side): does not change status. It is shown differently from a formal question.
- Messages can carry a photo or voice note, under the same rules as evidence.
- On reassignment the new reviewer sees the full history; the old reviewer loses access at once.
- Messages are queued offline like reports.

### 4.8 Discussions (shared issues, moderated)

- **Purpose:** observers in the same area can coordinate on a shared issue (e.g. "materials late across Ward 3") without exposing reports.
- A moderator creates a discussion for an area and topic and invites observers. Joining is **opt-in**.
- Members appear as their observer code only. Posts are text only, with no attachments and no locations finer than the ward.
- Joining gives access to that discussion only, never to anyone's reports.
- A detail enters a case **only** when an observer deliberately shares it into their own report.
- Moderators can hide posts and remove members; every moderation action is audited.
- Discussions close automatically 48 hours after election day and are deleted on the retention schedule.

### 4.9 Citizen reports

- The same flow as 4.3, minus the checklist and discussions.
- A receipt code is shown on screen (and can be saved as an image).
- Status check at `/status` or by SMS: send the receipt code to the short code.
- Citizens can answer a reviewer's question by opening `/status` with their code.

### 4.10 SMS and USSD channel (3B)

- **USSD menu** (`*XXX#`): language → category (numbered list) → state → LGA → short description → confirm → receipt code by SMS.
- **SMS:** "REPORT <category number> <polling unit code> <description>" → reply with a receipt code. "STATUS <code>" → the current status.
- Built on a telecom gateway's API (Africa's Talking, using its sandbox for the hackathon), with an **in-app phone simulator** so judges can try it live. Any real short code later needs a commercial agreement, documented as a condition.
- SMS reports enter the same queue, labelled "SMS".

### 4.11 Ask ElectraGuard (3A + 5D)

- Answers questions such as "What should an observer do if the unit opens late?" or "How do I check my report?" in 5 languages.
- **Answers only from an approved document set** (our observer guide, the app's privacy notice, the official public guidance we are allowed to cite). Each answer shows its source.
- If no approved source answers it: "I don't have an approved answer to that. Contact your coordinator." **The target is zero unsupported answers.**
- It retrieves and quotes approved passages; it never generates new electoral rules or dates.

### 4.12 What goes wrong, and what the app does

| Situation | Behaviour |
|---|---|
| No network on Send | Stays *On this phone*, sends later, and says so |
| Connection drops after Send | *Not confirmed yet*; automatic retry with the same key; never duplicates |
| Attachment fails | The receipt stays; *Try again* on that item; resumes from the last chunk |
| File no longer on the phone | "Choose the file again" |
| Camera/microphone denied | Back to the step with everything kept; offer another way |
| Storage full | Options: send now, remove media |
| Session expired offline | Queue kept; PIN on next send |
| Intake paused by the organisation | Explain; the queue waits; existing reports stay visible |
| Back button | Closes an open sheet first; keeps form values; asks before discarding a draft |
| Code revoked | Signed out everywhere; queued reports wait for the new code holder to clear or send them |

---

## 5. Reviewer, moderator and coordinator: every screen and its logic

### 5.1 Reviewer queue

- Sorted by **urgency**: Urgent / High / Normal / Low. Each row shows the reasons in a few words ("danger reported · intimidation · seen firsthand · video"), category, area, observed and received times, status, and channel (app / citizen / SMS).
- Filters: status, category, area, channel, has evidence. Saved filters; position restored on return.
- Tablet: queue and case side by side; phone: one at a time.

### 5.2 Case page, top to bottom

1. **Original account**, plus a machine translation into English when needed (labelled "Machine translation. Check the original").
2. **Evidence:** photos, video and audio players with "integrity verified" and "location data removed" marks. A voice-note transcript is labelled as machine output. Downloads are logged.
3. **AI suggestions**, each with **Accept / Correct**: category · urgency · possible duplicates (side-by-side view, link or keep separate) · result-sheet flags with explanations · related rumours from the rumour desk.
4. **Conversation:** messages and formal questions.
5. **Actions:** Start review → Ask a formal question / Close with outcome + rationale. Closure lists exactly which saved attachments go into the closure record; pending uploads are named.
6. **Redact:** mark text that names a person; the redacted version is what any later output uses.
7. **History:** the full audit trail, with a hash-chain "intact" check.

Every Accept/Correct is recorded. Corrections feed the evaluation and the next model version.

### 5.3 Moderator

- Create discussions (area, topic, invitees), hide posts, remove members, close discussions.
- See flagged posts (the name check and member reports).
- No access to reports unless also assigned as a reviewer.

### 5.4 Coordinator: operations room

| Panel | What it does | Track |
|---|---|---|
| **Assign** | Suggested reviewer by workload and area; bulk assign; reassign | 5 |
| **Live overview** | Counts by state, LGA and category; urgent count; open questions; a map at LGA level (no unit pins) | 5, 2 |
| **Cluster warnings** | "6 intimidation reports in Kano LGA-2 within 60 minutes" with links and a Reviewed button; thresholds configurable | 2 |
| **Coverage gaps** | Polling units with no checklist yet by mid-morning; units with the most "No" answers | 2 |
| **Late-materials risk** | Before election day: units most likely to receive materials late (model on logistics data), to plan observer placement | 2C |
| **Result-sheet flags** | Sheets with consistency flags awaiting review (counts and links only, never vote totals) | 2A/2D |
| **Rumour desk** | Paste or forward a viral message (text or image). Harm and check-worthiness rank; matched verified observations; matched past claims; guided image checks (metadata, reverse-search prompts) without a verdict. The coordinator drafts the public response, a second person approves it. | 1A/1B/1D |
| **Publish** | Approve what goes to the public page: scheduled hourly or on demand; reviewed reports only | 5E |
| **Security monitor** | Alerts from our own logs: repeated failed PINs, unusual download volumes, sign-ins from new places, intake bursts from one source | 4A |

### 5.5 Organisation admin

- Create observer code batches and print code cards.
- Revoke and reissue codes.
- Create staff accounts with roles; enforce 2FA; offboard.
- Pause or resume intake.
- Set the retention period.
- Export the audit log.

### 5.6 Public pages

- **Transparency page:** totals of **reviewed** reports by state and category, outcome shares, and a timeline.
  - Any cell under **5** shows "fewer than 5".
  - At least 60 minutes' delay; no unit-level data, no free text, no media, no result-sheet data.
  - 5 languages; plain tables with simple bars that load on 2G.
  - Footer: "Reviewed observations only. Not official results. Independent of INEC."
- **Status:** enter a receipt code to see the state and outcome only.
- **Ask ElectraGuard** and the **observer guide** (5 short pages in 5 languages).
- **How it works and what we keep** (privacy notice in plain language).

---

## 6. AI and data intelligence

### 6.1 Where models run

- **Default: our own server on Azure.** Report text and media go only to services inside our Azure environment.
- Where an Azure AI service clearly beats a local model for Nigerian languages (translation, speech), we may use it **inside the same Azure tenant**, after checking its language support, and document it in the Model Card and Safety doc. Each AI feature has a local fallback, so the system still works if a cloud AI service is off.
- No report data goes to any other outside AI provider.

### 6.2 Components and targets

| # | Component | Method | Data | We report |
|---|---|---|---|---|
| A1 | Category triage | Character n-gram TF-IDF + logistic regression, compared with a multilingual embedding model (AfroXLMR family / multilingual-e5); the best on validation wins | 400 official incidents, split by incident; ~200 translated into pcm/ha/yo/ig by the owner | Macro-F1 overall and **per language**, confusion matrix, 95% intervals |
| A2 | Urgency | Rules (danger, category, firsthand, evidence, cluster) + a model on `severity_0_4`; reasons always shown | Same | Recall on severity ≥3, plus false-urgent rate |
| A3 | Abstention | Below the confidence threshold → "Needs a person" | Same | Abstention rate; accuracy when not abstaining |
| A4 | Duplicates | Embedding similarity + same ward + time window | Paraphrase set | Precision/recall (baseline 66.7%/66.7%) |
| A5 | Clusters | Sliding-window counts against an area baseline | Synthetic stream with injected bursts | Bursts found; false alarms per 1,000 reports |
| A6 | Result-sheet checks | Rule engine + explanation templates with benign causes | `results_synthetic` + held-out labels (42 anomalies in 900) | Precision/recall per anomaly type; alerts per 1,000 sheets |
| A7 | Result-sheet OCR | Local OCR (PaddleOCR/Tesseract) on sheet images we generate from the CSV, with handwriting-style fonts and noise | 200 generated images | Field-level accuracy; share needing correction |
| A8 | Rumour ranking and matching | Harm/check-worthiness classifier on the official claims; embedding retrieval over verified reports and claims | 300 official claims (en, pcm) + owner translations | Precision/recall per language; recall@5; calibration |
| A9 | Image check guide | EXIF/metadata reader + reverse-search prompts + error-level hints; no verdict | Harmless labelled samples | Usability, not accuracy (no verdict by design) |
| A10 | Translation for reviewers | Local NLLB-200 distilled (ha, yo, ig), or Azure Translator if better; Pidgin shown as written | Owner spot checks | Owner rating per language; clearly labelled |
| A11 | Voice-note transcription and dictation | Whisper (local) or Azure Speech where it supports the language; the original audio is kept | Short test clips recorded by the team | Word error rate per language, reported honestly, including where it fails |
| A12 | Face blur | Face detection + blur on photos and video frames (server job; photo preview on the phone) | Public-licence test images | Faces missed per 100; the reviewer sees a "blurred" mark |
| A13 | Late-materials risk | Gradient boosting on the logistics data (as in the starter notebook), joined to polling units | 300 deliveries | MAE on transit hours; top-risk list precision |
| A14 | Ask ElectraGuard retrieval | Multilingual retrieval over approved documents; answer = quoted passage + source; abstain below threshold | Question set in 5 languages written by the owner | Answer accuracy, **unsupported answer rate (target 0)**, abstention rate |
| A15 | Security monitor | Rules + an Isolation Forest on our own access logs | Synthetic attack logs we generate locally | Detection rate and false alarms per day |

**Evaluation rules:**
- Held-out sets are never used for tuning.
- Splits are made by incident, so there is no leakage.
- Every result is reported per language.
- Failure examples are shown.
- The data is stated to be synthetic and small.
- Everything is reproducible with one command and fixed seeds.

---

## 7. Security and privacy

### 7.1 Controls

| Control | State |
|---|---|
| Observer codes + PIN; citizen mode; no identity collected by default | NEW |
| Staff 2FA; login and PIN rate limits; lockout with admin unlock | NEW |
| Organisation separation enforced in every query, with tests that try cross-organisation access | NEW |
| Location data stripped on phone and server; face blur option | NEW |
| SHA-256 per file; closure evidence snapshot | EXISTS (extended to video/audio) |
| Hash-chained audit events and a verify command; the chain head published hourly to the public page | NEW |
| Evidence in private Azure Blob Storage, encrypted, downloads only through permission checks, every download logged | NEW (moves from database storage) |
| Upload safety: type sniffing, size limits, re-encoding of images/video/audio (strips hidden content) | NEW |
| Public data: ≥5 threshold, delay, no free text or media | NEW |
| Name check and reviewer redaction | NEW |
| Withdraw, retention purge (reports, media, messages, discussions), backups expire on the same schedule | NEW |
| Session security, CSRF, private cache headers, reassignment access loss | EXISTS |
| Encrypted backups, restore drills, image rollback | EXISTS |
| Security monitor on our own logs | NEW |
| Dependency and secret scanning in CI | NEW |
| Threat model (STRIDE + LINDDUN) with each mitigation linked to code and tests | NEW (doc) |

### 7.2 Tests that prove it

- Another organisation's user, another observer, an unassigned reviewer, a moderator, a former reviewer and a signed-out user each try every report, media, message and discussion URL. All are refused.
- An uploaded photo with GPS EXIF: the stored file has none.
- A public page with a 4-report LGA shows "fewer than 5".
- A deliberately altered audit row breaks the chain check.
- A withdrawn report: text and media are gone from the database and blob storage.

---

## 8. Inclusion

| Item | Detail |
|---|---|
| 5 languages | Observer, citizen, status, public, Ask, guide, SMS/USSD. The team drafts every string in all five; the owner corrects and approves each language. Staff screens are in English first, then the others if time allows. |
| Picture categories | Simple black line icons with short labels |
| Voice | Dictation button, voice notes, audio playback of key screens (pre-recorded by the owner in each language) |
| Low literacy | Reading age 9–11; numbers and pictures over words; one question per screen |
| Offline, 2G and low-end phones | First load under 300 KB, cached afterwards; tested on the Redmi with throttling |
| Basic phones | SMS and USSD |
| Screen reader | TalkBack walkthrough; labels on every control; focus to errors; no traps |
| Large text | Works at 200% (already tested) |
| Accessibility barriers | "Access barrier" category with sub-options (steps/no ramp, distance, no assistance, no large print/braille, no sign language) |
| Fonts | Noto Sans (covers ẹ ọ ṣ ị ụ ṅ ɓ ɗ ƙ); every language string tested for overflow |
| WCAG 2.2 AA | axe + Lighthouse audits and a manual check, recorded in the evaluation report |

---

## 9. Platform and Azure deployment

Exact services will be confirmed once we see what the organisers' Azure access includes.

| Part | Azure service (planned) |
|---|---|
| Web app (Next.js) and API (Django) | Azure Container Apps (or App Service for containers), from our existing Docker images |
| Workers (triage, media processing, OCR, transcription, blur, clusters, security monitor) | Container Apps jobs / a worker container with a queue |
| Database | Azure Database for PostgreSQL – Flexible Server |
| Evidence and media | Azure Blob Storage, private container, encrypted; downloads go through the API (short-lived links after the permission check) |
| Queue | PostgreSQL-backed job table (exists) or Azure Storage Queue |
| Secrets | Azure Key Vault |
| HTTPS and domain | Container Apps ingress with a managed certificate |
| Logs and monitoring | Azure Monitor / Log Analytics (no report content or identifiers in logs) |
| Backups | PostgreSQL automated backups + our encrypted dump and restore drill |
| CI/CD | GitHub Actions → Azure Container Registry → Container Apps |

**Scalability evidence for judges:**
- A load test on Azure (reports per second, upload throughput on a throttled network).
- A cost estimate for one election day per 1,000 observers.
- The scaling limits, stated plainly.

**Fallback:** the whole stack runs on one laptop with `docker compose up` and no internet, for the live demo if venue Wi-Fi fails.

---

## 10. Data model changes

| Change | Detail |
|---|---|
| `Organisation` | New. Every record carries `organisation_id`. |
| `User` | Roles: observer, reviewer, moderator, coordinator, org_admin. Observers have `observer_code` + hashed PIN, with email optional; staff have email + TOTP secret. |
| `ObserverCodeBatch` | Issued codes, setup PINs (hashed), printed status, revoked flag |
| `Report` | `kind` (incident/checklist/result_sheet), `channel` (app/citizen/sms/ussd), `category_observer`, `danger_now`, `firsthand`, `language`, `occurred_at`, `received_at`, polling-unit FK + ward/LGA/state, `receipt_secret_hash`, `withdrawn_at`, `redacted_description`; `observer` nullable for citizens |
| `PollingUnit` | Loaded from the official CSV |
| `ChecklistAnswer` | report, stage, question, answer |
| `ResultSheet` | registered, accredited, votes A–E, rejected, OCR confidence per field, observer-confirmed flags, check results |
| `Evidence` → `MediaItem` | kind (photo/video/audio), blob path, size, duration, sha256, `exif_removed`, `blurred`, transcript, processing status. Upload sessions for chunked resumable upload. |
| `Message` | report, author, kind (formal_question/reply/message), body, attachment, created |
| `Discussion`, `DiscussionMember`, `DiscussionPost`, `ModerationAction` | As in 4.8 |
| `Triage` | category, urgency, reasons, confidence, translation, model versions; human corrections |
| `DuplicateLink`, `Cluster` | Decisions and reviewer actions |
| `Claim` (rumour desk) | text/image, channel, harm score, matches, response draft, approver |
| `PublicSnapshot` | The approved aggregate published at a time, with the audit-chain head |
| `AuditEvent` | `prev_hash`, `hash` on every event (review, assignment, moderation, admin, downloads) |
| `SecurityAlert` | rule, details (no content), status |
| Retention | One purge command for all record types; backup expiry documented |

---

## 11. How the work is organised

### 11.1 Workstreams (run in parallel on separate files)

| WS | Workstream | Main contents |
|---|---|---|
| W1 | Observer and citizen app | Sections 4.1–4.7, 4.9, 4.12: PWA, offline, steps, checklist, receipt, status, messages UI |
| W2 | Identity, organisations, admin | 2.4, 5.5: codes, PINs, TOTP, organisation separation, admin screens |
| W3 | Media pipeline | Photo/video/audio capture, chunked upload, Blob Storage, re-encoding, EXIF strip, blur, transcription jobs, players |
| W4 | Messages and discussions | 4.7, 4.8, 5.3 |
| W5 | AI and evaluation | All of section 6 + the evaluation harness and reports |
| W6 | Reviewer and coordinator | 5.1, 5.2, 5.4: queue, case, operations room, rumour desk, publish, security monitor UI |
| W7 | Public, SMS/USSD, Ask | 4.10, 4.11, 5.6 |
| W8 | Platform and security | Fork migration, Azure, CI, audit chain, retention, scans, load test |
| W9 | Docs and submission | Section 13 |

**Rules for parallel work:**
- One owner per file set; the ownership map lives in `docs/engineering-handoff.md`.
- Every slice lands complete: backend + UI + tests + translations. Nothing is left half-wired.
- Every slice gets a review note before merge.
- The `main` branch always runs.

### 11.2 Schedule

| Dates | Milestone | Content |
|---|---|---|
| **22–24 Nov** | **Set-up** | Fork migration (1.2), LICENSE, notebook running, park uncommitted observer edits on a branch, freeze infrastructure work, book mentors, request Azure access. Design: observer specs and boards. |
| **24–27 Nov** | **Foundations** (during bootcamps) | Data model (section 10) and migrations; organisations + codes + PIN + TOTP; PWA shell + offline queue; Blob Storage media service + chunked upload; i18n framework with all 5 language files; AI evaluation harness and baselines; design boards approved on the Redmi by **26 Nov**. Sprint plan to organisers on **27 Nov**. |
| **28 Nov–3 Dec** | **Sprint 1: core loop** | W1 observer app complete with photo; W2 admin; W3 photo pipeline + EXIF + hashes; W5 A1–A3; W6 urgency queue + case page; W7 status page; W8 Azure staging up (when access arrives). **Gate: the Redmi passes the full observer flow (date → receipt → photo retry → airplane-mode send) before any reviewer/coordinator polish.** |
| **4–7 Dec** | **Sprint 2: full features** | Video + voice notes + blur + transcription; messages; discussions + moderator; checklist; result-sheet check + OCR; duplicates; clusters; rumour desk; public transparency page; audit chain; translations in all views. |
| **7–9 Dec** | **Sprint 3: reach and protection** | SMS/USSD + simulator; Ask ElectraGuard + guide; late-materials risk; coverage gaps; security monitor; retention purge; organisation-separation tests; Azure production deploy; load test. |
| **10 Dec** | **Test day** | Usability test with 5+ consented people (timed); Redmi airplane-mode and 2G runs; TalkBack; axe/Lighthouse; full regression; per-language evaluation run. |
| **11 Dec** | **Feature freeze 23:59** | Fix only. Final review of everything. |
| **12 Dec** | **Package** | All documents, screenshots, video recording and edit, README final, AI-assistance note. |
| **13 Dec** | **Submit before 12:00** | Final check against section 13; tag release `v1.0-submission`. |
| **14 Dec** | **Rehearse** | Live demo twice on Azure and once on the offline laptop |
| **15–16 Dec** | **Demo Day** | |

### 11.3 Who does what

| Person | Owns |
|---|---|
| **Kara (team lead)** | GitHub fork steps, organiser contact, Azure access, team nominations, signs the Safety statement |
| **Owner** | Decisions, translations and sign-off for all 5 languages, Redmi testing at every gate, usability sessions, voice recordings for audio prompts, video voice-over |
| **Product and design** | This plan, specs and boards, all copy in 5 languages (drafts), evaluation design, review of every slice, all submission documents, video script |
| **Engineering** | All code, migrations, tests, Azure deployment, evaluation runs, API reference |

### 11.4 Honest risk on the schedule

Building every feature in 19 working days is a heavy load. It is possible only if:
- the workstreams run truly in parallel from 24 Nov;
- design boards are approved by 26 Nov;
- Azure access arrives by about 1 Dec.

The order above makes sure the system is complete and working at every step: core loop first, then each added feature fully finished. If time runs short, the last items to land (SMS/USSD, the late-materials model, the security monitor) are still built, but with less polish. **No feature is faked.**

---

## 12. Testing and acceptance

| Test | How | Pass mark |
|---|---|---|
| Time to file | 5+ people, scripted synthetic incident, stopwatch from "Report something" to receipt | Median < 2 min; 100% completion |
| Completeness | Required fields correct | ≥ 95% |
| Offline | Redmi airplane mode: 3 reports + photo + video + voice; reconnect | All received once; media attached; no duplicates |
| Weak network | 2G throttle; drop the connection mid-video | The upload resumes; never a false "Received" |
| Screen reader | TalkBack through report, receipt, messages | Every control announced; no traps |
| Languages | The owner reads every screen in each language | Signed off per language |
| Access control | Section 7.2 attacks | All refused |
| Privacy | EXIF, thresholds, withdraw, purge | As in 7.2 |
| SMS/USSD | The simulator and sandbox end to end | Report received; status reply correct |
| Ask | Question set in 5 languages | 0 unsupported answers |
| AI | Section 6 targets | Reported as measured, with failures |
| Load | Azure load test | Number stated with the setup |
| Regression | All backend tests + browser suite at 320/360 px, 200% text | All pass |

---

## 13. Submission package

### 13.1 Files

| Required | File | Owner |
|---|---|---|
| Working prototype | Azure link + README quick start (`docker compose up` + synthetic data loader) | Engineering |
| Forked public repo with licence | Section 1.2 + `LICENSE` | Kara + engineering |
| Problem statement (≤1 page) | `docs/submission/PROBLEM.md` | Design |
| Methodology | `docs/submission/METHODOLOGY.md` | Design |
| Evidence | `docs/submission/EVALUATION.md` (official template) + `docs/submission/screens/` | Design + engineering |
| Model/System Card | `docs/submission/MODEL_CARD.md` | Design |
| Safety and Limitations | `docs/submission/SAFETY_AND_LIMITATIONS.md`, signed | Design, Kara signs |
| Datasheets | `docs/submission/DATASHEET.md` (one section per dataset) | Design |
| Architecture (incl. STRIDE, decisions log) | `docs/submission/ARCHITECTURE.md` | Design |
| Threat model | `docs/submission/THREAT_MODEL.md` | Design |
| API reference | `docs/submission/API_REFERENCE.md` | Engineering |
| Contributing and code style | `CONTRIBUTING.md` (official template) | Engineering |
| Demo video ≤ 3 min | Link in README | Owner + design |

### 13.2 README structure (official template)

Title + one-line value · **Track 5** (with Tracks 1–4 inside) · **Team** · **Status: Prototype** · Problem (IDs 5A–5E, 1A/1B/1D, 2A–2D, 3A/3B/3C/3E, 4A/4B/4D/4E) · What it does / **does NOT do** (declare results, decide eligibility, name individuals, collect identity by default, touch live systems) · Demo · Quick start · Data · How it works · Results table · Safety · Accessibility and languages · Team and contributions · Licence and acknowledgements.

### 13.3 AI-assistance note (required by the Code of Conduct and the template)

Text to place in the README under "Licence and acknowledgements":

> **AI-tool assistance.** The team used AI coding and writing assistants to help draft code, tests and documentation. Every change was reviewed by a team member, covered by automated tests, and checked in the running application before it was merged. The AI features inside ElectraGuard are described separately in the Model Card.

---

## 14. Demo video (3 minutes) and live demo

| Time | Scene | Shows |
|---|---|---|
| 0:00–0:15 | A polling unit with weak network. "Observers see problems. Most are never reported safely, and reporters never hear back." | Problem |
| 0:15–0:50 | Redmi in Hausa, **airplane mode**: Intimidation → not in danger → unit → just now → speaks → short video with faces blurred → "Saved on this phone". Network on → receipt; video uploads. | 5A, offline, languages, 5C |
| 0:50–1:05 | A basic phone sends a USSD report; a receipt arrives by SMS | 3B |
| 1:05–1:25 | Results posted: photo → numbers read → confirmed → "Consistency check for review. This is not a result." | 2A/2B/2D |
| 1:25–1:55 | Reviewer: urgent-first queue with reasons, translation, transcript, duplicate, Accept/Correct, formal question → the observer replies → close | 5B, human in the loop |
| 1:55–2:20 | Coordinator: cluster warning; rumour desk matches a viral message to verified reports; second-person approval | 1A/1B, 2 |
| 2:20–2:40 | Public page with "fewer than 5" cells; citizen checks a code; "Ask ElectraGuard" answers in Yorùbá with its source | 5E, 3A, 4B |
| 2:40–3:00 | "No names. No GPS. AI suggests, people decide." Key metrics on screen. "Synthetic data. Not approved for operational use." | Responsible AI, honesty |

**Live demo:** run on Azure; the offline laptop stack and the recorded video are the backups.

---

## 15. Risks

| Risk | Response |
|---|---|
| Too much for 19 days | Parallel workstreams; core loop first; each feature finished before the next; daily review |
| Azure access late | Build and test on the existing Docker stack; the Azure deployment is scripted and ready; the laptop stack is the fallback |
| Translation load on the owner | The team drafts everything early (by 27 Nov); one language per day of review |
| Speech/translation weak in Hausa, Yorùbá, Igbo | Measure and report honestly; the original text and audio always stay visible; never block a report on AI |
| Video on 2G | Compression, 60 s limit, resumable chunks, upload after the receipt; the photo path is always available |
| Discussions expose observers | Opt-in, codes only, no media or fine location, moderator, auto-close |
| Result-sheet check read as partisan | No totals, synthetic labels, the on-screen statement, the Safety doc |
| Synthetic data makes metrics look too good | Say so plainly; noise, paraphrase and code-switching tests |
| Fork migration breaks CI | Done first (22–24 Nov) and checked before feature work |

---

## 16. Still needed from the team

1. **Kara:** the fork steps in 1.2 (or permission for engineering to do steps 4–5 after Kara's 1–3).
2. **Azure login details** when the organisers send them.
3. **Team names and GitHub handles** for the README (team of 1–4, as registered).
4. **Mentor clinic bookings** before 30 Nov.
5. **A short code / gateway sandbox account** for SMS/USSD (free sandbox; Kara or the owner creates it).
6. **The company name** (Appendix A).

---

## Appendix A: Company name

"Cairn Systems", "Cairn Africa" and "Cairn HQ" are taken on Gmail, and "Cairn Civic" was rejected. Almost every "cairn + word" .com is registered. The names below each have **the same spelling for the name, the Gmail handle and the domain**, and no registration was found for the domains (DNS check, 22 Nov; confirm at a registrar before paying):

| Name | Gmail to try | Domains free | Meaning |
|---|---|---|---|
| **Cairn Assure** | `cairnassure@gmail.com` | cairnassure.com, cairnassure.ng | Assurance: evidence you can rely on. Fits Trace's transaction assurance and ElectraGuard's verified reports. |
| **Cairn Evidence** | `cairnevidence@gmail.com` | cairnevidence.com, cairnevidence.ng | Matches the line "Show the evidence. Let people decide." |
| **Cairn Nigeria** | `cairnnigeria@gmail.com` | cairnnigeria.com, cairnnigeria.ng | Plain and local; narrower if you expand beyond Nigeria |
| **Cairn Axis** | `cairnaxis@gmail.com` | cairnaxis.com | Short and neutral |
| **Cairn Frame** | `cairnframe@gmail.com` | cairnframe.com | Neutral |

Gmail cannot be checked from here. Try them in the order above.
