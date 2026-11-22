# O-10 Add photos, video or voice? (step 6 of 7, optional)

**Status:** READY for review · Route: `/o/new/evidence` · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Let the reporter add evidence safely: location removed on the phone, faces blurred if they choose, size and send time shown honestly. Skipping is always fine.

## Entry and exit
- **Entry:** O-09 Continue; O-11 Change on Photos, video, voice.
- **Exit:** Continue (or `o10.skip` when nothing is added) → O-11.
- **Back:** → O-09; items kept. If a capture is in progress, Back first stops and discards that one capture (R3: close the open thing first).

## Layout
**Phone 360 px** (`AppShell`, `Stepper` 6 of 7):
1. Title `o10.title`; hint `o10.hint`.
2. `MediaCapture` actions as a 2×2 grid of large buttons (pictogram + label, 96 px): `o10.photo`, `o10.video` (sub-label `o10.videoLimit`), `o10.voice` (sub-label `o10.voiceLimit`), `o10.file`.
3. List of added items (`UploadItem` in draft mode), each row: thumbnail or waveform icon, type, `o10.size` (or `o10.sizeOffline`), tag `o10.locationRemoved` (ok icon), for photo/video a switch `o10.blur` with hint `o10.blurHint`, actions `o10.retake` (photo/video/voice) and `o10.remove`.
4. Count line `o10.count`.
5. Pinned: primary `common.continue` when ≥ 1 item; otherwise the same position shows primary `o10.skip`.

**Tablet 768 px:** actions in one row of four; item list below in 2 columns.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | no items | 4 actions; count "Nothing added"; pinned `o10.skip` |
| Capturing photo | Take photo | native camera via `<input type="file" accept="image/*" capture="environment">` (most reliable on low-end Android) |
| Recording video | Record video | `<input accept="video/*" capture>`; if the result is longer than 60 s it is trimmed to the first 60 s on the phone and the row says so (see open question Q5) |
| Recording voice | Record voice | in-app recorder (MediaRecorder): `o10.recording` with elapsed time, big `o10.stopRecording`; auto-stops at 2:00 |
| Processing | after capture | row shows `o10.processing` while EXIF/metadata is stripped, photo resized to ≤ 2 MiB, video compressed to 720p where the phone can (otherwise sent as is under the size limit) |
| Filled | items added | rows as above |
| Camera denied | permission error | `o10.cameraDenied` inline above the grid; Choose file stays available |
| Mic denied | permission error | `o10.micDenied` |
| Too many | more than 5 items | `o10.limitItems` with `max`=5; add buttons disabled |
| Too big | file > 100 MB after processing | `o10.tooBig` with `max`; item not added |
| Wrong type | not image/video/audio | `o10.wrongType` |
| Storage full | outbox media would exceed 150 MB, or `navigator.storage.estimate()` shows < 50 MB free | `common.error.storageFull`; `o10.spaceLow` as a softer warning under 200 MB free |
| Offline | no network | everything works; sizes show `o10.sizeOffline` |
| Sending / server / success / empty | n/a on this step | uploads happen after REP-01 on O-12 |

## Message keys
`ui.stepOf`, `o10.*` (all), `common.continue`, `common.error.storageFull`, `ui.back`.

## API
None on this step. Each item is stored in the draft as a processed blob with `clientAttachmentId` (UUID), type, size, duration, `blurFaces` flag. Uploads use MED-01..04 after REP-01 (see O-12).

## Logic notes
- **Location removal happens before the item is stored** in the draft, so an unprocessed file never sits in IndexedDB.
- **Blur faces:** on the phone, faces are detected with the `FaceDetector` API where available; where not, the blur is applied on the server before any reviewer sees the file and the row shows the same switch (the promise is "before anyone sees it"; see open question Q4 for wording if the owner wants the phone-only promise).
- **Estimated send time** uses `navigator.connection.downlink` when available, else the measured speed of the last upload, else a 2G assumption of 50 kbit/s; shown as "about 3 minutes".
- "Retake" replaces the item in place, keeping its position.
- Removing an item asks once in a small `Sheet` (`o10.removeConfirm`, `o10.remove`, `ui.cancel`).

## Accessibility
- Each item row is a group labelled by type and position ("Photo 1 of 3"); the blur switch is a native checkbox with role switch.
- Recording time is not announced every second; start and stop are announced.

## Acceptance checks (Redmi)
1. Take a photo: the row shows "Location removed" and a size under 2 MB. Download the uploaded file later from the reviewer side: it has no GPS EXIF.
2. Deny the camera: the message shows and Choose file still works.
3. Record a voice note: it stops by itself at 2:00.
4. Add 5 items: the add buttons disable with the limit message.
5. In airplane mode the size line says it will send when you have network.
6. With nothing added, the pinned button reads "Continue without" and goes to Check and send.
