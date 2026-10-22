# Homepage Backfill progress — 22 October 2026

## Scope

Daily Photos and Drive report feeds remain GAS/Drive. Backfill gets a separate,
read-only aggregate card at /api/backfill-progress. Its final JSON snapshot lives
on the dedicated reports/backfill branch of google-photos-koofr, not on main.
No new service/credential, provider media transfer, NAS task or Blob fallback.

The branch contains only the public aggregate JSON. It has no workflow source;
report commits do not trigger backup or Homepage deployments. This deliberate
new report source supplements existing GAS feeds; it does not impersonate Daily
or weaken GAS run-order checks.

## Data and publication

Backfill's existing engine produces its final health artifact. A separate job
reads that exact run's artifact and publishes allowlisted counts. The engine job
retains contents:read; only the publisher job receives contents:write/actions:read.
It receives no Koofr/Google secrets and does not read/write media or the manifest.
GitHub token is scoped to the publication step. GitHub's token cannot scope writes
by branch; code fixes the repository, workflow ref, branch and output pathname.

The report preserves original run identity/source SHA and measurement timestamp.
Monotonic (run_number,run_attempt), stable run identity, identical replay and
contents-SHA writes prevent late reruns from replacing newer aggregates. Unknown
or missing summaries fail publication; they do not fabricate zero counts.

## Reader and display

The Vercel API reads two fixed public GitHub URLs with byte limits and timeouts:
raw final aggregate (8 KiB) and latest Backfill run metadata (64 KiB). It validates
an exact aggregate schema, timestamps and run links. Neither credentials, media
IDs/names, album titles nor raw logs are returned. Cache is 120 seconds with
120-second stale revalidation. Upstream/rate-limit errors make current state
explicitly unknown while a validated historical snapshot can remain visible.

The UI shows current running/queued state separately from the previous final
snapshot. Counts update after a worker finishes, not for each uploaded media.
A snapshot older than 36 hours is labelled old. No whole-library percentage is
computed: inventory and legacy manifest scopes overlap differently. Uploaded
count means manifest-recorded items, not independently proven original files.
Inventory complete means one enumeration pass; it is not backup completion.

## Initial verified snapshot and limits

Seeded from the final WEB_SUMMARY of real completed Backfill 39519576698 on
main 73df68b, measured 2026-10-21T05:12:03.006913Z: uploaded total 1640,
pending_seen 45515, pending_errors 105, inventoried 47247, 49 albums,
25299 memberships, this-run attempted 390/uploaded 362/errors 28,
inventory_complete=false. No backup rerun or synthetic production counts.

On implementation, Backfill 39698534252 is still running older ba89bee source.
It cannot retroactively acquire the new publication step or PR #7 fixes. Do not
start a second worker against its manifest. The next scheduled Backfill on new
main publishes automatically. Future publisher success needs real-run evidence;
initial seed/read verification does not prove that future job executed.

## Verification

Python publisher fault tests cover allowlist, missing data, wrong workflow,
late reruns, idempotent replay and conflicting identity. Node tests cover schema,
bounded reads, provider failure and distinct current/prior UI state. Existing
Homepage suite/build/syntax/internal-resource checks apply before release.
