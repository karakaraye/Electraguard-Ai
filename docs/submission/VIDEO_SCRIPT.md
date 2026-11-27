# 3-Minute Demonstration Video Script: ElectraGuard AI

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Target duration:** 3 minutes (180 seconds)  
**Look of the product:** "Ink and Paper": black ink on warm paper, one sun-yellow accent, hand-drawn illustrations, light mode only. Record the real running app with the synthetic sample data.

> **In plain words:** A timed 180-second walkthrough in six scenes: a citizen reports and checks a rumour, an observer reports with and without network, a reviewer works a case, a coordinator watches operations and approves a safety notice with a second coordinator, the result-sheet check and public results, and a closing statement on privacy and limits. Every number shown on screen must come from the screen being recorded or from `docs/eval/`; do not add figures that are not in the repository.

---

## Timing

| Scene | Time | Seconds | Focus and routes |
|---|---|---|---|
| 1 | 0:00 – 0:25 | 25 | Citizen: `/`, `/o/new/what?as=citizen`, `/status`, `/check`, `/phone` |
| 2 | 0:25 – 0:55 | 30 | Observer: `/o/start`, `/o/new/...`, outbox, `/o/messages` |
| 3 | 0:55 – 1:25 | 30 | Reviewer: `/s/queue`, `/s/cases/<reference>` |
| 4 | 1:25 – 1:55 | 30 | Coordinator: `/s/ops` (overview and check-ins), safety notice approval |
| 5 | 1:55 – 2:30 | 35 | Result-sheet check (`/o/checklist/results/sheet`) and public `/results` |
| 6 | 2:30 – 3:00 | 30 | Privacy, languages, limits |

---

## Scenes

### Scene 1: Citizen (0:00 – 0:25)
* **Visual:** The public home page at phone width, then desktop.
* **Action:**
  1. Switch the language from English to Hausa with the header language control.
  2. Tap **Report what you saw**, choose a category tile (for example "Late or missing materials"), answer "Is anyone in danger right now?", choose a place, write two sentences, add no name or phone number, and send.
  3. Show the receipt code, which looks like `EG-4H7Q-92KD`.
  4. Open `/status`, enter the code, and show the status.
  5. Open `/check`, paste a claim and show an approved answer ("Checked by ElectraGuard reviewers. Not an INEC statement.").
  6. Show the SMS and USSD simulator at `/phone`, with the banner that says it is simulated.
* **On-screen text:** "No account. No name. Five languages." and "SMS 20384 and USSD *347*88# are test values on a simulator."
* **Voiceover:** "Voters see what happens at polling units, but their reports often vanish into chat groups. With ElectraGuard a citizen can report without an account or a name, get a receipt code, follow the report, and check a rumour against answers that reviewers have approved. The phone channels you see here run on a simulator in this prototype."

### Scene 2: Observer (0:25 – 0:55)
* **Visual:** Phone width, 390 px.
* **Action:**
  1. Sign in at `/o/start` with an observer code (`OBS-` plus six characters) and PIN. Say that the card carries a setup PIN and the observer then chooses a 6-number PIN.
  2. Start **Report something** and move through the seven steps: what happened, danger, where, when, what you saw, photos or voice, check and send.
  3. Turn the network off in the browser tools. Tap **Save and send when online**; show the "Saved on this phone" message and the outbox.
  4. Turn the network on. Show the report sending and the receipt code.
  5. Open **Messages** and answer a reviewer's question.
* **On-screen text:** "Works offline. Sends itself when the network returns."
* **Voiceover:** "Accredited observers sign in with a code and a PIN. A report is seven short steps. If the network drops, the report waits on the phone and sends itself when the network is back. If a reviewer has a question, the observer answers it in the app."

### Scene 3: Reviewer (0:55 – 1:25)
* **Visual:** Desktop, staff console.
* **Action:**
  1. Show the queue ordered by urgency, with the reasons each case ranks where it does.
  2. Open a case. Show the redacted text and the **Hide names** tool.
  3. Show the AI suggestion card labelled "Suggested, not decided", with its reasons and confidence, and press **Accept** on the category and **Correct** on the urgency.
  4. Show the evidence panel (SHA-256 verified, location removed, faces blurred) and the audit trail line "Record chain intact".
  5. Send a formal question to the reporter.
* **On-screen text:** "AI suggests. A person decides."
* **Voiceover:** "Reviewers see the report with phone numbers and names already replaced by tokens. The system suggests a category and an urgency and says why, but only the reviewer decides. Every action goes into a chained record."

### Scene 4: Coordinator (1:25 – 1:55)
* **Visual:** Operations page.
* **Action:**
  1. Show the Overview tab: day totals, cluster warnings and reports by LGA.
  2. Open the Check-ins tab and write a check-in of type "safety". Show that it is pending approval.
  3. Sign in as a second coordinator and approve it.
* **On-screen text:** "A safety notice needs a second coordinator."
* **Voiceover:** "Coordinators watch for unusual surges and ask observers short questions by ward. A safety notice is only sent after a different coordinator approves it. In our test, the surge detector raised far fewer false alarms than a fixed threshold, but caught fewer of the planted surges."

### Scene 5: Result sheet and public results (1:55 – 2:30)
* **Visual:** Phone on the left, desktop on the right.
* **Action:**
  1. The observer photographs the posted result sheet and types the numbers. Enter a sheet where votes plus rejected ballots do not equal accredited voters.
  2. On the reviewer's case screen show the flag "Party votes plus rejected votes differs from accredited count" and the words "Consistency check for review. This is not a result."
  3. Open `/results`: totals by state, type and hour, the "fewer than 5" labels, the line "Reviewed observations only. Not official results. Independent of INEC.", and the audit-record fingerprint.
* **On-screen text:** "Not official results." and "Fewer than 5 is hidden."
* **Voiceover:** "Observers type what the result sheet shows and the system flags numbers that do not add up. It never adds up votes or names a winner. The public sees only reviewed totals, published at least an hour later, with small numbers hidden."

### Scene 6: Privacy and limits (2:30 – 3:00)
* **Visual:** Phone screens in English, Pidgin, Hausa, Yoruba and Igbo, then the privacy notice.
* **On-screen text:**
  - "No names collected."
  - "Five languages."
  - "AI never decides alone."
  - "Synthetic data only."
  - "Prototype. Not approved for live elections."
* **Voiceover:** "ElectraGuard does not ask for names, hides personal details it finds, and keeps people in charge of every decision. It was built and tested on synthetic data only, and it is a prototype: it has not been deployed, the phone channels are simulated, and it is not approved for live elections."
* **Closing card:** ElectraGuard AI, Election Observation and Citizen Accountability, Team Cairn, #AI4Elections Track 5. "Prototype: not approved for operational electoral deployment." `github.com/karakaraye/Electraguard-Ai`
