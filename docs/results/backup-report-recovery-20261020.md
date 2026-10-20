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
