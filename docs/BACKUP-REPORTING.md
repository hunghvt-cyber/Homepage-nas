# Backup reporting — source of truth for AI handover

## Purpose and ownership
Homepage displays two independent public aggregate reports, never raw logs or secrets:
- `hunghvt-cyber/my-backup-gdrive-koofr`: daily two-way Drive ↔ Koofr.
- `hunghvt-cyber/google-photos-koofr`: daily one-way Photos → Koofr.
Homepage is **read-only**; each backup workflow publishes after completing its existing state/artifact/summary steps. No cross-repository GitHub tokens, polling workflows, Vercel deployments per run, NAS dependency, or direct private GitHub API reads.

## Dedicated Blob store and one-time setup
1. In Vercel Storage create a **separate public Blob store** for aggregate backup reports (not the PRIVATE Notes store; preferably separate from NAS status too).
2. Copy that store's `BLOB_READ_WRITE_TOKEN`. In GitHub Actions repository secrets, set **BLOB_READ_WRITE_TOKEN** in BOTH backup repositories. Never paste it into files, public docs, chat, or Homepage client code.
3. Obtain the store's public base origin from the URL of the first successfully uploaded object, e.g. `https://STOREID.public.blob.vercel-storage.com`. Set `content/site.json` -> `backup_reports_base_url` to that **origin only**, then commit; Homepage's Vercel Git integration redeploys once. The site shows a configuration message until this is set.
4. Run each backup manually or wait for its scheduled run; verify both fixed public URLs and Homepage. The token is scoped to its Blob store, not GitHub repository access.

**Blob paths** (fixed, overwritten, no random suffix, cache max age 60s):
- `gdrive-backup-latest.json`
- `gphotos-backup-latest.json`

The existing NAS status Blob path `nas-status.json` is unchanged and independent.

## Schema v1
```json
{
  "schema_version": 1,
  "source": "gphotos-koofr",
  "status": "success",
  "run_id": 123,
  "run_url": "https://github.com/hunghvt-cyber/google-photos-koofr/actions/runs/123",
  "started_at": null,
  "finished_at": "2026-10-14T00:00:00Z",
  "metrics": {"discovered": 12, "attempted": 12, "uploaded": 12, "skipped": 0, "errors": 0, "boundary_seen": true, "bootstrap_complete": true},
  "warnings": []
}
```
Drive `source` is `gdrive-koofr`; `metrics` keys: `transferred_gib`, `speed_mib_s`, `ignored_count`, `new_ignored_count`. Unknown metrics are JSON null, **never fabricated zero**. Status is one of success/paused/failure/unknown. Times use UTC ISO-8601; started_at may be null. Warnings must be aggregate and not contain filenames, paths, account data or auth information. Public visitors can read these numbers; GitHub private run links only work for authorized users.

## Code map
- Drive repo: `.github/workflows/bisync.yml` → `scripts/backup-summary.py` (local bisync logs) → `scripts/publish_blob_report.py`.
- Photos repo: `.github/workflows/daily.yml` → existing `Daily health report` writes `$RUNNER_TEMP/daily-health.json` → `scripts/backup-summary.py` → `scripts/publish_blob_report.py`.
- Homepage: `content/site.json` (Blob origin) → `scripts/build.py` generates `backup-config.js` → `public/backup-status.js` fetches both URLs. Homepage does not publish.
- Python Blob SDK pinned `vercel==0.11.6`, `BlobClient.put(..., access="public", add_random_suffix=False, overwrite=True, cache_control_max_age=60)`.

## Operational rules
- Preserve the existing backup scheduling, state persistence, safety invariants, and artifacts. Never make a report upload failure mark a successful backup as failed. Do not publish full log files, media IDs, private paths or ignored-file names.
- If the Blob secret is absent, publication skips with a notice. The old snapshot stays visible; timestamps show when it was last updated. No hourly polling.
- Vercel Blob overwrites may take at least 60 seconds to propagate through cache. Reload Homepage after that.
- On failure inspect the backup workflow's `Publish ... to Vercel Blob` step; do not edit backup engine to fix a dashboard issue.
- The Google Photos quarterly reconcile is separate and not represented by the daily backup report.
- For a new backup source, add its own sanitized schema v1 JSON file and frontend card, keeping existing feeds independent.
- Before declaring production ready: verify SDK install, successful upload, correct public URL, CORS fetch, values against actual workflow artifact, mobile UI and a second run overwriting the same pathname.

## Migration
Old `repository_dispatch`, `BACKUP_READ_TOKEN`, `HOMEPAGE_DISPATCH_TOKEN`, Homepage polling workflow and static `public/backup-latest.json` have been removed from source. Previously created GitHub secrets (if any) may be deleted manually in repository settings.
