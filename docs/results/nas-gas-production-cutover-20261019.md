# NAS GAS production cutover — 2026-10-19

This release supersedes the earlier HOLD decision in the recovery review.
The user explicitly authorized increasing timeout and switching only NAS reporting
to GAS, retaining quota-limited Blob as historical data reserve. Blob is not an
operational rollback or automatic fallback.

## Released

- PR #23 merged, application merge commit ec60cba9f23f2477fe5185d1ed1809807b761fa0.
- Production deployment dpl_4NhR454k4SDWyBs5eL82c8hjhXwy: READY.
- Project homepage-nas, team team_gCsQcRiaCja0GafKj8JZLINI.
- Production domain https://homepage-nas.vercel.app/
- Browser timeout 15 seconds; upstream API deadline remains 12 seconds.
- Production NAS_REPORT_GAS_URL selects the existing public Google /exec endpoint.
- Production NAS_REPORT_STATUS_URL=/api/nas-report.
- No writer key copied to Vercel. No NAS unit/timer/state or GAS v12 source changed.

The source content/site.json retains the old Blob URL as historical/default
configuration; the effective production build environment overrides it to the API.
Do not remove that override and describe it as restoring fresh reporting.

## Validation

Before merge, exact revised code passed 11/11 Node backend/API/freshness checks,
including a six-second response that would exceed the previous five-second
deadline. Syntax checks passed. Vercel Preview build READY; root, guide index,
config and assets readable. Backup configuration still had empty API selector.

At approximately 01:02 UTC after production deployment:
- Unauthenticated curl of /config.js returned /api/nas-report.
- Unauthenticated curl of /api/nas-report/ returned HTTP 200 JSON,
  X-Report-Recovery=current, X-Vercel-Cache=HIT, Age=11.
- Snapshot updated_at=2026-10-19T00:57:23Z.
- GAS received_at=2026-10-19T00:57:40.376Z; recovered_previous=false.
- Browser on production rendered both cameras Hoạt động,
  NAS free 254.3 GiB, root used 74.0%, volume used 45.4%,
  and separate Đo lúc 07:57:23 / Nhận lúc 07:57:40 (Vietnam).
- Runtime error query for /api/nas-report since 01:01:50Z returned no errors
  at the time queried. This was a short immediate window, not long-term monitoring.
- Production backup-config.js retained the Blob base and empty
  BACKUP_REPORTS_API_URL. Both backup cards still showed unavailable reports;
  no backup feed was migrated by this release.

## Preservation and remaining work

Blob objects/store/token were neither deleted nor repurposed.
Notes remains on the separate Koofr app; expense, Gemini, QR guide content,
authentication/rate limits, collector/camera workloads and backup engines were
not changed by this cutover. Prepared backup code is inert without configuration;
companion backup PRs were not merged or activated. No GAS dispatcher was deployed.

On read failure the UI clears current healthy labels; stale/recovered data keeps
its real timestamps. Recovery is by fixing GAS/reader code or verified
current/previous data, preserving generation/sequence/policy state, not switching
the live feed back to quota-limited Blob.

Natural state-change observation, actual physical outage, explicit browser
clock-skew/previous scenarios, timed cache expiry and long-term quota/performance
remain follow-up work as previously disclosed and accepted for after cutover.
This report does not claim those checks passed.
