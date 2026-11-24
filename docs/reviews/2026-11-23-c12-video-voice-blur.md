# C12 review: video, voice notes, face blur and transcripts

Branch `claude/fervent-knuth-s7h3i1`, on top of `production-readiness`. Backend only; no `frontend/` paths changed.

## What changed

**Uploads (MED-01 to MED-03).** `kind` now accepts `video` and `audio` with the contract limits:

| Kind | Declared types | Max size | Max length |
|---|---|---|---|
| video | `video/mp4` (H.264, AAC), `video/webm` (VP8/VP9, Opus/Vorbis) | 25 MiB | 60 s |
| audio | `audio/webm`, `audio/ogg` (Opus), `audio/mp4` (AAC), `audio/mpeg` (MP3) | 4 MiB | 120 s |

`duration_ms` is required for both kinds. `blur_faces` is rejected for audio. On completion the server checks the SHA-256 by streaming, then identifies the file by its contents with ffprobe. A file that is not its declared container and codec returns `415`, and an undecodable file returns `422 media_unreadable`. Either way the session is cancelled. The verified upload is kept privately and the item is created with `status: "processing"`, as the contract describes.

**Worker (`python manage.py run_media`, compose service `media-worker`).**
- Video is re-encoded to H.264/AAC MP4, at most 1280 x 720 and 30 fps, with a JPEG poster frame.
- Voice notes are re-encoded to mono Ogg/Opus at 32 kbps.
- All metadata, chapters and encoder tags are dropped. The verified original is then deleted.
- Items are claimed with a row lock and processed with no lock held. The output is committed only if the item still exists and the claim is still current.
- Removal or withdrawal during processing leaves no files behind.
- A failure is retried up to three times and then marked `failed`, and the original is deleted. A file that turns out to be unreadable fails at once.

**Face blur (A12).**
- Detection uses the YuNet detector, bundled in `backend/reports/media_av/models/` (MIT licence, 227 KiB). It runs on a 640 x 640 letterboxed canvas with a recall-leaning threshold of 0.5.
- Each face box is enlarged to cover hair and chin, then pixelated and smoothed.
- In video, faces from the last three frames stay blurred, so one missed frame does not expose a face.
- Photos now get real blur too. The previous `face_blur` was a stub.

**Who sees what.** Reviewers see faces blurred. Unblurred access follows MED-04 (see review item 4 below).

| Observer asked for blur | Stored file | Reviewer's default view | Unblurred for reviewer |
|---|---|---|---|
| Yes | Blurred; no unblurred copy kept | Blurred file | Never (`404`) |
| No | Unblurred (observer's own view) | Separate blurred copy (`review_copy`) | Only the verified original while processing, with `X-Media-Access-Reason`, logged as `download_original`. Never after processing (`404`). |

While an item is processing, only the assigned reviewer can open the verified original, with a reason and a log entry. This is the contract's urgent-case rule. It is refused when the observer asked for blur. Audio needs no blur, so reviewers play it directly.

**Transcripts (A11).**
- A local faster-whisper model transcribes each voice note after re-encoding.
- `en` uses English. `pcm` uses the English model and is labelled `en`. `ha` and `yo` use their own codes. Igbo is not supported by Whisper, so it is reported as `unsupported_language` rather than guessed.
- Transcripts appear only in the reviewer's case detail, marked `machine_generated`. A missing model or a crash never blocks the voice note.

**Downloads (MED-04).** Files are streamed from disk in 256 KiB blocks, with single byte ranges (`206`, `416`). Video now has a `poster` variant. Processing items return `409 invalid_transition`, and failed items return `409` with "This file could not be prepared."

**Elsewhere.**
- The reviewer queue's `media_counts` now counts video and audio, and urgency reasons include `video` and `audio`. Urgency levels are unchanged.
- A case closed while a recording is still processing records the verified upload hash and `status: "processing"` in the closure snapshot.
- The Docker image installs ffmpeg and bakes in `Systran/faster-whisper-small`, pinned to revision `536b066`, MIT licence. Build with `--build-arg WHISPER_MODEL=` to leave it out.
- The image sets `ORT_DISABLE_TELEMETRY=1`. onnxruntime 1.32, used by Whisper's speech detection, otherwise starts Microsoft usage telemetry to `mobile.events.data.microsoft.com`. Verified: the telemetry module starts without the variable and stays off with it.
- CI installs ffmpeg before the backend tests.

## Verification

- `python backend/manage.py test accounts reports config` on PostgreSQL 16: 97 tests pass, run both one at a time and in parallel. That includes 11 new tests in `reports/test_media_av.py`, which use real ffmpeg output and the real detector:
  - metadata removal (a GPS location tag and a camera comment)
  - the reviewer's poster has no detectable face while the observer's still does
  - range requests
  - processing, original and blur rules
  - type and length checks
  - withdrawal and removal during processing
  - retry and failure
  - closure while processing
  - the photo review copy
- `WhisperTranscriptionTests` runs real Whisper on an espeak-ng English sentence when `TRANSCRIPTION_MODEL` is set. It passed here. CI skips it because CI has no model.
- `migrate`, `migrate --check`, `makemigrations --check --dry-run`, `check --deploy` (only the two existing HSTS warnings) and `git diff --check` all pass.
- The production image built from `deploy/backend.Dockerfile` (2.67 GB). Inside it, the C12 and C4 media tests passed. The baked-in model transcribed "The ballot box was taken away from the polling unit before counting started." word for word.
- Timing on 4 CPU cores, for a 60-second 1280 x 720, 30 fps video with a face in every frame: 68 s with blur requested, and 88 s when the separate reviewer copy is also written. Faces were found in 1,800 of 1,800 frames.

## Not done, or not yet measured

- **Faces missed per 100 (A12) is not measured.** The only face test image is one public-domain NASA portrait. Small, side-on, low-light and partly covered faces can be missed. A labelled public-licence face set is needed for the evaluation report.
- **Word error rate per language (A11) is not measured.** It has only been checked on synthetic English speech. Hausa and Yoruba with the small model are likely weak. Igbo is unsupported. Clips recorded by the team are needed.
- Photo `image/webp` (listed in the contract) is still not accepted, as in C4.
- Citizen media uploads with `X-Receipt-Secret` are not included: MED is observer-only, as in C4.
- Message attachments (`purpose: "message"`) depend on MSG-02, which is C9.
- Storage is the local private volume. Azure Blob and 60-second storage links are C14.
- Transcripts are not covered by the reviewer redaction tool. They are deleted with the item on withdrawal.
- The `unusual_download_volume` alert is still not implemented (existing gap).
- Front-end players, the poster, the "processing" state and the transcript panel need wiring by the front-end owners.

## Contract open question 3

"Face blur replaces the original?" As implemented: when the observer asks for blur, yes, and no unblurred copy exists. When they do not, the unblurred file is kept for the observer and for reason-logged reviewer access, and reviewers see a blurred copy by default.

## Changes after review (24 Nov)

Review on #18 from the other team (changes requested):

- **Length and size are enforced while decoding, not taken from the container.**
  - The decoder stops at the limit plus 2 s.
  - Each frame is counted, and the item fails as `media_too_long` once the count passes (limit + 1 s) x fps.
  - Outputs are capped at 60 MiB (video) and 4 MiB (voice note) and fail as `media_too_large`.
  - The stored duration is clamped to the limit. Voice-note length comes from our own cleaned output.
  - These failures are final and are not retried.
- **Every ffmpeg and ffprobe process runs under `prlimit`:**
  - memory: 3 GiB for encoding, 1 GiB for probing
  - CPU time: 30 minutes for encoding, 10 s for probing
  - output file size: a backstop above the caps
  - A killed process is always waited on, so no zombie processes remain.
- **ffprobe during upload completion:**
  - 10 s timeout, and bounded probe size.
  - Only the needed fields are requested, and the output is capped.
  - Files with more than 4 streams are rejected.
- **Per-stream metadata is stripped explicitly** (`-map_metadata:s:v -1`, `-map_metadata:s:a -1`). Tests now plant stream-level title, language, handler and Opus artist tags and assert none survive.
- **The unprocessed original is always sent as an attachment**, never inline, and its access is logged.
- **Audit events:** at most one per reviewer, item and action every 10 minutes. For reason-logged access, a new reason is always logged. Video range requests no longer write one event each.
- **New tests:**
  - HLS and concat playlists with `http:` and `file:` references, declared as MP4, WebM and Ogg. A local listener confirms no connection is made.
  - Truncated, empty and many-stream files.
  - A container that is shorter than its content; a too-long voice note; the output size cap.
  - A timeout that kills ffmpeg and leaves no temporary files or processes.
  - `404` for another observer, an unassigned reviewer and both roles in another organisation, on video and audio, for display, poster and original, during processing and when ready.
  - Audit throttling.
- **Verified:** 106 backend tests pass. A 60 s 1280 x 720 video still processes within the limits: 1,800 frames, 72 s on 4 cores, with the reviewer copy.

**Review item 4, decided by the supervisor on 24 Nov: follow MED-04.**
- `variant=original` is served only while an item is processing, only to the assigned reviewer, with a logged reason. It is refused when the observer asked for blur.
- Once processing finishes, reviewers get the blurred copy only. This ends the reason-logged unblurred access that C6 introduced for ready photos.
- Pre-v1 photos have no stored blurred copy, so reviewers now get one blurred on the fly.
- If an investigation needs the unblurred file, that is a separate audited request approved by a supervisor, outside this slice.
