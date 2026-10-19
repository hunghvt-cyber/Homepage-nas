# Blob dependencies after legacy Notes retirement

Updated 2026-10-18 under the user's latest authorization.

| Component | Current state | GAS/Drive action |
| --- | --- | --- |
| Legacy Notes/checklists/folder metadata | Production APIs retired (410); 25 note objects deleted | No migration required |
| Legacy share permissions | 1 share object deleted; old share/workspace pages retired | No migration required |
| Legacy Notes list index | 1 index deleted | No migration required |
| Koofr Notes | Independent live application | Preserve Koofr backend |
| Camera/NAS health/maintenance/retention aggregate | Public Blob source still configured on Homepage | Event + 30-minute heartbeat code prepared; Google/NAS live qualification pending |
| Google Drive backup report | Public Blob source; private workflow blocked by Actions billing | Move only the small aggregate report to GAS/Drive; publisher/adapter work pending |
| Google Photos daily backup report | Public Blob source; private workflow blocked by Actions billing | Move only the daily aggregate report to GAS/Drive; publisher/adapter work pending |
| QR guide overrides and history | Private Blob, preserved | Suitable for GAS/Drive with per-guide revision checks, owner authentication and verified migration; implementation/cutover pending |
| Homepage login rate limits | Private Blob, preserved | Keep current atomic limiter as requested |
| Expense and Gemini | Existing separate GAS integrations plus shared Homepage session | Preserve existing projects and integration |
| Static guides, images and printed QR URLs | GitHub/Vercel build | Keep as static content |
| Photos/Drive backup media and sync engines | Koofr plus existing backup runners | GAS reporting does not replace the backup engine or fix blocked private runners |

## Live deletion evidence

Inventory in the existing Homepage production build environment found 25 Notes,
1 share and 1 Notes index. Cleanup deployment `dpl_Ey844A3Z5XhF2f5DNkT73u7JyyWK`
(source `eb88cfeb8a32462fa0de6cd700fc38c0f1b1c483`) logged
`{"event":"retired-notes-cleanup","deleted":27,"remaining":0}`.
The script's exact allowlist excludes `guides/` and `login-attempts/`.
This is not a deletion of the private store. Its successful inventory proves
private Blob access worked during this run; public report store failures do not
establish that the private store is blocked.

Main retirement commit: `b1f643428e06237b44d9d38544a15d3be55f7992`, PR #22.
Browser readback confirmed the legacy API's NOTES_RETIRED response and `/notes/`
navigation to Koofr. Old editor assets were removed. Historical backend factories
remain in source for regression tests; their deployed defaults terminate at 410.

## Remaining rollout gates

1. Authenticate Google and deploy the dedicated reporting project; do not change
   expense/Gemini. Existing OAuth secrets cannot be read back from GitHub and
   private Actions runners are unavailable due to billing.
2. Connect the NAS publisher once. Do not modify NAS collectors, services or
   tunnels through source changes; the local NAS operator must apply the reviewed
   publisher configuration under the existing timer.
3. Qualify two real heartbeat cycles, outage recovery and source freshness before
   choosing the GAS feed in Homepage configuration.
4. Implement and qualify the two backup aggregate publishers and QR migration.
   Do not claim either complete merely because the NAS prototype is ready.

The remaining private Blob token/package must stay: QR and the login limiter still
use them. No quota/latency savings are claimed before real GAS rollout.
