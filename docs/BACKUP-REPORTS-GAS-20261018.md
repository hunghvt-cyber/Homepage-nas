# Backup aggregate reports on existing GAS/Drive

> **Cập nhật 19/10/2026 — đọc [OPERATIONS.md](OPERATIONS.md) trước.** Kế hoạch/lịch sử rollout. Source workflow đã có trên main; Homepage production đã chọn GAS adapter. Hai endpoint hiện trả 503 NO_REPORT: chưa xác nhận một lần publish báo cáo thật của từng nguồn. Không coi các gate lịch sử bên dưới là trạng thái deployment hiện tại.

## Nội dung lưu trữ lịch sử

Status: source and local simulations prepared. Not deployed on Google, no real
backup run published to GAS, and Homepage source has not changed.

## Sources and boundaries

The same reporting project can host gdrive and gphotos aggregate feeds. Each
source has its own HMAC key, Drive folder, HEAD and bounded metadata log. Both
share the existing ScriptLock/account quotas; this does not isolate account-wide
quota exhaustion. NAS's key/HEAD/schema remain separate. Expense/Gemini are untouched.
No media transfer, rclone configuration, NAS collector or backup engine is moved.

Only the gdrive bisync workflow and gphotos daily workflow may publish. Backfill
and reconcile are deliberately not hooked up. The client and server validate an
exact aggregate schema, warning allowlist and fixed repository/run URL. Raw logs,
filenames, provider credentials and arbitrary metrics are rejected.

Order is (workflow run_number, run_attempt), not an assumption about monotonic
run IDs. The run ID must remain the same within a run number. Old runs and old
attempts are rejected. Identical content replay returns the existing commit;
different terminal content at the same order is a conflict. Do not reset HEAD to
accept a late report. Workflow recreation/reset requires an explicit reseed plan.

Writes use immutable Drive files, hash readback, a single HEAD commit, ambiguous
commit reconciliation and current/previous recovery. Retention failures cannot
undo an acknowledged commit; orphan files after failures before HEAD can require
later maintenance. No permanent deletion of backup media is performed.

## Google files (future deployment)

- Core.gs: reporting/nas-schema.cjs (existing mapping)
- Server.gs: reporting/apps-script/Server.gs
- BackupSchema.gs: reporting/backup-schema.cjs
- Backup.gs: reporting/apps-script/Backup.gs
- Existing Drive-only manifest; no new OAuth scope is needed by this code.

Run initializeBackupReports once as owner after code review. It creates only the
missing BACKUP_GDRIVE_KEY/FOLDER and BACKUP_GPHOTOS_KEY/FOLDER properties and does
not reset HEAD. Never print/copy these keys into chat. The two separate repository
secrets REPORT_GAS_KEY must receive their matching key through the provider's
secure secret configuration UI. REPORT_GAS_URL is the existing /exec URL.

## Backup workflow activation

Both proposed workflow changes default REPORT_BACKEND to blob. Setting repository
variable REPORT_BACKEND=gas-drive opts into the stdlib publisher; the GAS branch
does not install/import the Vercel Blob SDK. Keep existing secrets for rollback.
REPORT_GAS_URL is a repository variable; REPORT_GAS_KEY is a secret. Existing
continue-on-error and backup outcome conditions are preserved. A reporting failure
does not turn a failed backup into a successful one or alter the engine result.

The canonical publisher is reporting/publish_backup_report.py, copied unchanged
to scripts/publish_gas_report.py in both repositories. It obtains run identity from
GitHub, signs an exact request and verifies signed ack/hash/identity. Retries are
bounded to three with the same mutation ID and content. A timeout after commit
does not require another commit. An authenticated old/conflicting run is not retried.

Private Actions billing currently prevents backup jobs from starting. Moving the
report feed does not resolve runner billing or prove a real backup completed.
Do not fabricate a current report while the runner remains unavailable.

## Homepage activation and rollback

Configure BACKUP_REPORT_GAS_URL server-side. The adapter exposes only
GET /api/backup-report?source=gdrive or gphotos, checks hash/schema/received time
and follows only the fixed Google ContentService redirect host. It never returns
Drive IDs, keys, generation, raw logs or signed envelopes.

After real end-to-end qualification, set build variable
BACKUP_REPORTS_API_URL=/api/backup-report to select the adapter. Without this flag,
the current Blob feed remains selected. The UI does not silently fall back to old
Blob data on an API failure. Recovery responses retain their original timestamps.

Rollback the report transport by restoring REPORT_BACKEND=blob and the previous
Homepage build flag. This can still fail if the public Blob store remains blocked;
it is a configuration rollback, not a promise of an operational legacy store.

Required gates: synthetic end-to-end tests on isolated Google state; source-key
isolation; late/duplicate/rerun tests; one actual terminal report per source;
anonymous Vercel read and UI checks. Local VM tests are simulations, not a Google,
Vercel or backup-throughput benchmark. Do not deploy a replacement Server.gs alone
without the matching Backup files or reset the NAS publisher's state.

## Review evidence

- Homepage candidate: PR #23 (this branch); focused Node simulations 8/8,
  publisher Python checks 7/7, plus existing NAS regression checks 7/7.
- Drive/Koofr workflow: https://github.com/hunghvt-cyber/my-backup-gdrive-koofr/pull/2
  commit 0eba7fcca5a2ae2d296809c92bac59087247321d.
- Photos/Koofr workflow: https://github.com/hunghvt-cyber/google-photos-koofr/pull/1
  commit 3b84ca9ad026236134d1f5b239e19d45aeaa109d.
- Both backup workflow changes remain opt-in and unmerged. Their publishers each
  passed 7 local Python checks. No real workflow run or Google benchmark is claimed.
