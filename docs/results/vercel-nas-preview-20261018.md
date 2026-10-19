# Vercel NAS GAS preview qualification — 2026-10-18

## Exact scope

Project homepage-nas (prj_3CCmGVbfaymDVoO66d6MPU1CQ1nw), team
team_gCsQcRiaCja0GafKj8JZLINI. Draft PR #23 remains unmerged.
Tested source cf7ad443154a799f9462417e15278923a36c6fad.
Deployment dpl_2hQj5r6Au6kabCezVAxaWiyhUES1 is READY, target null (Preview):
https://homepage-ihwtp23f7-hunghvt.vercel.app/

Both Config variables have target=[preview] and gitBranch exactly
feat/gas-reports-after-notes-retirement-20261018:
- NAS_REPORT_GAS_URL: the existing public Google /exec URL from NAS-GAS-HANDOFF.
- NAS_REPORT_STATUS_URL: /api/nas-report (required at build time for the UI).

No writer key is required or retrieved. No production environment variable was
changed, no deployment promoted, no GAS deployment changed, no NAS service touched.
A first redeploy used API target staging (Vercel's legacy preview target); the final
tested deployment omits target and is confirmed target=null. It is not production.

## Real read and browser observations

At 08:47 UTC, the API returned HTTP 200 JSON:
- updated_at=2026-10-18T08:24:29Z
- _report.received_at=2026-10-18T08:24:46.053Z
- _report.recovered_previous=false
- X-Report-Recovery=current, X-Content-Type-Options=nosniff

The authenticated Vercel fetch observed MISS, then HIT with Age=33 seconds on the
same deployment/path and unchanged payload/ETag. Browser Cache-Control was public;
the adapter source sets s-maxage=60, stale-while-revalidate=240, which Vercel consumes.
This proves cache reuse; it is not a timed expiry/revalidation or latency benchmark.

Browser UI showed both cameras Hoạt động, volume free 250.3 GiB, root 74.2%,
volume 46.2%, RAM 2.1 GiB and swap 0.9 / 1.8 GiB. It showed separate Vietnamese
timestamps Đo lúc 15:24:29 and Nhận lúc 15:24:46 on 18/10/2026.
Maintenance/retention retained their own result timestamps.

The initial preview UI still read the old source until NAS_REPORT_STATUS_URL was
set and a new build created. Merely adding NAS_REPORT_GAS_URL does not switch UI.

Preview deployment protection remains enabled. Direct unauthenticated terminal
request received a Vercel SSO redirect; API verification used the authorized Vercel
connector and the browser rendered the UI. Do not describe this as a fully
anonymous externally accessible Preview API. The Google /exec read itself was
anonymous and independently repeated.

Production /config.js was independently read at 08:47 UTC and still selects
https://5amgghtpn0okgki0.public.blob.vercel-storage.com/nas-status.json.

## Regression validation

Read exact files from tested Git commit into a separate scratch verification tree.
No application source was changed.
- Node NAS backend/API and jsdom UI freshness: 10/10 passed.
- Python publisher policy/transport: 11/11 passed.
- Node syntax: public/status.js and api/nas-report.js passed.
- Freshness tests cover usable 30-minute heartbeat, old source measurement,
  publisher silence >45 minutes, and network-error clearing of health labels.
These fault/clock/restart cases are simulations, not a real NAS outage test.
An initial incomplete local tree failed due to absent Server.gs/jsdom; after
restoring the exact source and installing jsdom 26.1.0 the complete run passed.

## Rollback and remaining gates

Preview rollback: remove only these two branch-specific overrides and rebuild the
same branch; build falls back to existing content/site.json source. Existing older
deployments retain their original configuration. No production rollback was
executed or needed. NAS rollback location remains in NAS-GAS-HANDOFF; do not reset
generation, sequence or policy state.

Before production cutover, the NAS operator still must qualify real publisher-only
network/ack/restart recovery, without stopping whole-NAS networking, camera,
collector or backup workloads. Keep sequence/policy pending state and exact retry
mutation across restart; return sanitized state/ack timestamps only. Do not invent
a real camera warning to satisfy a state-transition gate. Real warning transition
and real network recovery are still unverified.

Backup sources remain unqualified/unconfigured; Actions billing remains separate.
QR guide overrides/history and login limits still depend on private Blob. This
preview test does not qualify backup migration, QR migration or login enforcement.
