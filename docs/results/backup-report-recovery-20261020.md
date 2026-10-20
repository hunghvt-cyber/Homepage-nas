# Backup report recovery — 20 October 2026

## Verified production state (04:02 UTC / 11:02 Vietnam)

Both report feeds still return HTTP 503 NO_REPORT. NAS feed returns HTTP 200:
measurement 2026-10-20T03:48:35Z; received 03:48:51.441Z; recovery=false.
GAS execution history confirms version 13 handles both actual backup POSTs.
This is not the earlier version-12 missing-handler issue.

## Real backup evidence

- Drive run 39337249732, source 83a6e375ee10f57a668eae5dedb9cf1458c5029c:
  Run Bisync and Final Status successful, initial rclone exit 0. Publication failed.
- Photos daily 39343563085, source 8dc448f845e64cd7d82a6ded7199fa3d9360bbfb:
  daily health SUCCESS, 8 discovered/attempted/uploaded, 0 errors.
  Publication failed.
- Both jobs used REPORT_BACKEND=gas-drive. Existing continue-on-error made
  the overall workflow green despite publisher exit 1.

## Changes tested and merged through PRs

- my-backup-gdrive-koofr PR #4, merge 433418f06016c34430cd97f26a7eed2eafa122cf.
- google-photos-koofr PR #3, merge fb28444b0d78c5c68f0102c92f63da9bbb48f17d.
- Default selector gas-drive, publication failure surfaced, manual signed ACK
  probe isolated from backup. Existing explicit legacy Blob code is retained,
  but no Blob publication was run or selected.
- Publisher synthetic regressions: 8/8 per repository. Tests do not prove backup.
- No engine/filter/schedule/cache/profile/media changes; no backup reruns.

## Confirmed blocker

Transport-only Drive probe run 39367381382, job 118447193351;
Photos probe run 39367404249, job 118447266130.
Both returned BACKUP_REPORT_PUBLISH_FAILED: AUTH_DENIED.
The configured keys pass the publisher 64-lowercase-hex format validation,
but GAS rejects their HMAC signatures. Both real publishing attempts reached
version 13 GAS. Do not disable signature checks or reset source state.

Owner must securely copy existing BACKUP_GDRIVE_KEY and BACKUP_GPHOTOS_KEY
from the reporting project's Script Properties into the corresponding
repository secret REPORT_GAS_KEY. Never post keys to chat or source control.
This is a credential-entry handoff, not a request to change media backup.
Do not rotate NAS_REPORT_KEY or reset any HEAD/sequence.

## Remaining verification

After owner corrects keys: rerun only report probes; require signed ACK.
Then republish a verifiable real terminal summary without rerunning backup,
preserving its original run identity and measurement/finish time.
Require Drive hash readback, API report identity and UI agreement for both
sources before declaring recovery. No Homepage redeployment was performed.

## Update 20 October 2026, 04:21 UTC / 11:21 Vietnam

Owner updated both GitHub report secrets. Transport-only probe attempt 2:
- Photos 39367404249, job 118451838351: signed_ack=true.
- Drive 39367381382, job 118451835253: INVALID_REPORT_KEY before network.
  Drive secret no longer passes the strict 64 lowercase hex format; do not
  strip or transform unknown credential input silently. Owner correction pending.

Photos recovery PR #4 merged as 9160edcb9daa35a0eabb034b0fe4308d7bab4078.
10/10 publisher/recovery tests passed. Workflow 39369026211, job 118452435686
downloaded original artifact 12229614763 from scheduled daily 39343563085.
Expected/downloaded ZIP SHA-256:
f0c42ac9a87442f07d140e9258344150676bdc1716e8c54bd890d08aa281f5ed.
Recovery validates original run and successful engine/health/artifact steps,
preserves original run_number=19/run_attempt=1, metrics and finish timestamp.
Publisher signed ACK: published=true, source=gphotos, run_id=39343563085,
run_attempt=1, replay=false. No backup execution or media access.

Production Photos API HTTP 200 with original finished_at
2026-10-19T23:49:58.980068+00:00 and new receipt 2026-10-20T04:20:24.668Z;
8 discovered/attempted/uploaded, 0 skipped/errors, recovery=false.
Vercel adapter validated the committed Drive record payload hash/schema.
Browser Homepage confirms Backup thành công, 8 uploaded, 0 errors,
06:49:58 20/10/2026, linking original run 39343563085.
Drive UI still explicitly says no workflow report.

NAS UI continues receiving measurements (11:18:59 / receipt 11:19:15 Vietnam).
Homepage remains original production deployment; no Vercel/GAS redeploy needed.
Remaining blocker is Drive secret format; full two-source recovery is incomplete.

## Completion 20 October 2026, 04:30 UTC / 11:30 Vietnam

Owner corrected Drive key again. Probe 39367381382 attempt 3, job 118453479292,
verifies signed_ack=true. Both source keys now authenticate correctly.

Drive report-only recovery:
- PR #5 merge 84a04b744cee8f5d8b8b5587b2fe7a56eb33aebf;
  PR #6 diagnostics merge aa9a2d72cfadf43455c32bb2b5811cb22b8122c0;
  PR #7 signed-log redirect fix merge 84597575fc1521d77303953d6fb7df54b785d830.
- Recovery runs 39369559386 and 39369716348 failed before publication.
  Diagnostics identified HTTP 401 downloading job logs: urllib forwarded the
  GitHub Authorization header to signed storage. Fix removes bearer on redirect
  and requires HTTPS; regression verifies this behavior.
- Publisher/recovery tests 11/11 passed. Synthetic tests only validate code.
- Successful real recovery run 39369850114, job 118455029142, source 84597575.
  It read original artifact 12227092831, digest
  33a0073344d70881ea65e7b38bfb5b7d5b1e7d74d9b6c3c6c5a76d0e28a5798b.
  Downloaded digest matches. It independently checked original run metadata,
  successful terminal steps and actual timestamped initial rclone exit 0.
- Signed publication ACK: published=true, gdrive, run_id=39337249732,
  run_attempt=1, replay=true (idempotent retry after commit).
- Production Drive API HTTP 200: original run_number=82/run_attempt=1,
  success, finished_at=2026-10-19T22:53:41Z (original Final Status completion),
  received_at=2026-10-20T04:29:44.597Z, recovered_previous=false.
- Original artifact contains 28 ignored files and a dangling-shortcut warning.
  Transfer amount/speed and new-ignore count lack parseable evidence and stay
  null; do not fabricate zero or run extra scans.

Both backup production APIs now return 200 and reference original real runs.
Photos remains original run 39343563085, 8 uploads, 0 errors; NAS HTTP 200.
No backup engines, media, rclone state/cache, filters, schedules, Photos profile,
GAS properties/code/permissions or NAS services were changed.

Latest observed Homepage production is READY deployment
dpl_AjNTLnFnqyEiohnLsByHkAxjowQX, commit
6d856b42571db755a3baaf002d6d3ec50c8a72cb (independent Gemini PR #25).
This report recovery did not require a Homepage or GAS runtime deployment.
Future scheduled backup publication uses existing corrected keys and GAS
default; the next scheduled execution has not yet occurred during this audit.
