# Backup GAS backend and reader activation — 2026-10-19

GAS v13 is deployed on the existing /exec URL. Core, Server, BackupSchema and
Backup match main 1fea9e2 sources after trimming trailing whitespace; existing
Qualification.gs was extended with a disposable backup-only qualification helper.
No existing NAS key/HEAD/sequence was reset. Access remains Anyone, execute as
the same owner; no new OAuth scope was added.

## Evidence

- Local NAS + backup + freshness regression: 20/20 Node checks.
- GAS real Drive in-process NAS synthetic checks: 17 passed, cleanup=true.
- GAS real Drive in-process backup-only checks: 52 passed, cleanup=true,
  networkBenchmark=false, publicCachePopulated=false at 01:17:33Z.
- initializeBackupReports at 01:18:04–01:18:06Z configured both real sources;
  no report existed. Keys were generated in Script Properties and never read,
  exported or logged by the assistant.
- Anonymous v13 reads: NAS ok=true, SHA-256 valid, measured 00:57:23Z /
  received 00:57:40.376Z; gdrive and gphotos correctly returned NO_REPORT.
- Runtime Server/Backup/BackupSchema trimmed hashes:
  af76d446f0eec132759cbaa8aaed2730ee579b92d8cbbbb918b99f555f69ab9f,
  d5d36942eaa47b4c1656fe4c5f08182a8b4d51d03d237b4143494845693dae06,
  e9a707bf0713e82bbb7de9ef62f4c48e9f212dd0ce23a832e6a9cc00ec0756ce.

Qualification sends synthetic unknown-status aggregates only to a UUID-prefixed
property namespace and disposable Drive folders, verifies source-key isolation,
replay, conflicts, old run/attempt refusal, private-field rejection, hash readback,
previous-read timestamps and bounded logs. It never populates public read cache.
Folder cleanup is recoverable Drive trash. Test properties were cleaned.

## Activation state and remaining dependency

User authorized moving the remaining report cards off quota-limited Blob.
Production BACKUP_REPORT_GAS_URL and BACKUP_REPORTS_API_URL now select the GAS
adapter on the next build. NO_REPORT maps to no-store HTTP 503 with code NO_REPORT;
UI distinguishes an empty configured feed from other errors and waits for a
workflow result. Backup fetch timeout is 15 seconds. No fabricated current
backup report is seeded. Old Blob is historical reserve, not automatic fallback.

REPORT_GAS_URL was saved in both backup repositories through GitHub settings.
REPORT_GAS_KEY is still missing (confirmed in Drive repo; Photos not yet
configured in this session). Owner must transfer the respective generated
BACKUP_GDRIVE_KEY / BACKUP_GPHOTOS_KEY directly to repository secret REPORT_GAS_KEY
without sending keys in chat. REPORT_BACKEND must be gas-drive only once the
matching secret and reviewed publisher are ready. Companion workflow PRs remain
draft/unmerged at this point; no backup engine or media transfer was executed.

Recent real scheduled runs: Drive bisync 39166849940 (#81) and Photos daily
39172293967 (#18) both failed at startup; inspected Photos job had no steps.
Earlier handoff attributes runner startup failure to billing; this session has
not independently retrieved a fresh billing reason. Migration does not resolve
runner billing and is not evidence that a backup completed.

Full end-to-end publication from each workflow remains blocked by secret setup
and runner availability. Backend/read-path migration is not a completed writer
migration. Continue with secure owner setup; do not retrieve GitHub stored
secrets or make up successful terminal reports.
