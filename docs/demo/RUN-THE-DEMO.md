# Run the ElectraGuard demonstration

This guide starts the whole demonstration on one Windows laptop and tells you how to sign in as each person, how to start over, and what to check before you present. Everything on screen is synthetic: Kano places from the reference list, invented reports, no real people. It is a prototype and is not approved for live elections.

> **In plain words:** you need a database, the backend, the website and the demonstration data. Four small scripts do each of these. Sign-in passwords are made for you the first time and saved in a private file outside the project folder. They are never stored in the project.

## What you need installed once

- PostgreSQL 16 or newer, running on this laptop. You need an empty database called `eg_demo` and a database user `eg` that owns it. A technical person can make these in one minute:
  `createdb -U postgres eg_demo`, and `CREATE ROLE eg LOGIN PASSWORD '...'` with `ALTER DATABASE eg_demo OWNER TO eg`.
- Python 3.12 or newer with the project packages installed (`backend\.venv` or any Python that has `backend\requirements.txt` installed).
- Node.js 22 or newer, with `npm install` already run in the `frontend` folder.

If your database is not on port 5432, or its password is not `local-demo-only`, set `$env:POSTGRES_PORT` and `$env:POSTGRES_PASSWORD` in each window before step 1, or edit `scripts\demo\env.ps1`.

## Start the demonstration (first time)

Open three PowerShell windows in the project folder.

**Window 1: backend.**

```powershell
.\scripts\demo\start-backend.ps1
```

It prepares the database tables and then serves the backend at `http://127.0.0.1:8182`. Leave it open.

**Window 2: build the demonstration data.** Run this once, after the backend has started its tables (about 4 minutes the first time, because every code and password is protected with slow hashing):

```powershell
.\scripts\demo\seed.ps1
```

When it ends it prints a table of sign-ins. It also saves them to `demo-signins.json`, in the folder that holds the project folder (not inside it). Open that file when you need a password or PIN again.

**Window 3: website.**

```powershell
.\scripts\demo\start-frontend.ps1
```

The first run builds the site and can take several minutes. It then serves `http://localhost:3382`. Always open the demo as **`http://localhost:3382`** (not 127.0.0.1) so the observer app works offline.

Open `http://localhost:3382`. The home page should show **38 reviewed reports** for Kano.

## What the seed builds

A polling day in Kano, anchored to the moment you ran the seed:

- About 69 reports from observers and citizens across three Kano local government areas and nine wards. Categories and urgency are mixed. 38 are reviewed and closed, 10 are in review, 13 are new, 3 wait for the reporter's answer to a reviewer question, plus result sheets and checklists. One result sheet does not add up on purpose.
- A published public snapshot, so the home page and `/results` show reviewed totals with numbers under 5 hidden.
- Four check-ins with observer answers: one that raises a cluster warning for "materials arrived" in the first local government area, and one safety notice waiting for a second coordinator.
- Eight rumour claims: three with approved answers (English, Pidgin and Hausa), one draft waiting for a second coordinator, three new and one dismissed.
- Reviewer suggestions (category and urgency) with reasons, photos on a few reports, and a chained audit record.

The reports are dated just before the moment you ran the seed. If you seed days before the demo, run **Reset** below on the morning of the demo so times look current.

## Sign in as each person

| Person | Where | Sign-in |
|---|---|---|
| Reviewer (Amina, Chidi) | `/s/sign-in` | email `reviewer.amina@demo.electraguard.test` or `reviewer.chidi@...`, password from `demo-signins.json`, then the six-digit code |
| Coordinator (Ngozi, Ibrahim) | `/s/sign-in` | `coordinator.ngozi@...` and `coordinator.ibrahim@...`. Two coordinators are needed to approve a safety notice or a rumour answer. |
| Moderator (Zainab) | `/s/sign-in` | `moderator.zainab@...` |
| Organisation administrator (Tunde) | `/s/sign-in` | `admin.tunde@...` (observer codes, staff, settings) |
| Observer | `/o/start`, then **Sign in** | a code such as `OBS-...` and the PIN, both in `demo-signins.json`. Ten cards are ready. Two cards (11 and 12) are for the first sign-in: use the setup PIN, then choose a six-number PIN. |
| Citizen | `/` | no sign-in |

All staff emails end in `@demo.electraguard.test`.

**The six-digit code.** Staff sign-in needs a two-step code. On a demonstration database you do not need a phone: run

```powershell
.\scripts\demo\totp.ps1 coordinator.ngozi@demo.electraguard.test
```

and type the code it prints. A code works once. If you sign in again within 30 seconds the script waits for the next code by itself.

**Good people to use:** Amina has the showcase case (a late-materials report with a name and phone number in the text, a photo, and a suggestion to accept or correct). Observer 04 has a reviewer question waiting in **Messages**. Ngozi can approve the safety notice that Ibrahim wrote. Ibrahim can approve the rumour answer that Ngozi drafted for the "ballot papers" claim.

## Reset

Use this to wipe the database and build a fresh polling day (the same people, new passwords, current times):

```powershell
.\scripts\demo\reset.ps1
```

It asks you to type `YES`. It only touches the database named in `env.ps1` (`eg_demo`). You do not need to restart the backend. Sign out and sign in again in any browser that was open.

To only add anything missing without erasing, run `.\scripts\demo\seed.ps1` again. It never duplicates people, check-ins, rumours or the snapshot, and it leaves existing reports alone.

## Pre-demo checklist

1. Backend window shows requests and no errors; `http://127.0.0.1:8182/health/ready` says ready.
2. Home page at `http://localhost:3382` shows reviewed totals (no "could not be loaded").
3. `/results` shows totals, "fewer than 5" labels and the line "Reviewed observations only. Not official results. Independent of INEC."
4. `/check`: type "Voting has been moved to Saturday in Kano". You get an approved answer marked as checked by reviewers.
5. `/phone`: the banner says it is a simulator and shows the test-number label. Dial `*347*88#` and send one SMS.
6. Observer sign-in works with a card and PIN on a phone-width window; **Messages** shows the reviewer question.
7. Sign in once as Amina, Ngozi and Ibrahim to confirm the six-digit codes work, then sign out.
8. Staff **Review queue** is not empty; **Operations** shows reports by LGA and a cluster warning; **Publish** shows the published snapshot.
9. Browser: normal motion settings (not "reduce motion"), zoom 100%, notifications off, a phone-size window ready for observer scenes.
10. Network: you can switch the network off and on in the browser tools for the offline step.
11. Keep `demo-signins.json` closed on screen. Never show it in a recording.

## If something goes wrong

- **Home says it could not be loaded:** the backend is not running or its address is wrong. Restart window 1; the site expects `http://127.0.0.1:8182`.
- **"Too many tries":** wait 15 minutes or run **Reset**.
- **Six-digit code rejected:** wait for the next 30-second window and run `totp.ps1` again. The laptop clock must be right.
- **Observer says the code is wrong:** codes are in `demo-signins.json`; type them exactly, `OBS-` and six characters.
- **The site shows old pages after you changed settings:** stop window 3 and start it again.
