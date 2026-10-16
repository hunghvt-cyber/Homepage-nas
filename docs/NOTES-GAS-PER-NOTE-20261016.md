# Per-note GAS/Drive experiment — 16/10/2026

## Scope and rationale

Isolated synthetic experiment following external architecture feedback. No production
API/UI, Blob data, NAS services, report publisher, backup workflow, expenses or Gemini
changes. Existing snapshot HEAD/revision119/100 Notes remain untouched. New HEADs:
NOTES_SHARD_HEAD and NOTES_SHARD_RESTORE_HEAD, in the existing private test folder.
Routine OAuth, scopes and pinned project/deployment remain the same.

Drive Properties limits are 9KB per value and 500KB per store. Therefore a monolithic
Properties object holding 500 heads/index/24h receipts is not assumed safe. A per-note
HEAD without a transaction protocol for folder/ACL/index would weaken consistency.
We choose immutable per-note bodies plus a **single immutable manifest**, with the
existing ScriptLock and a small single-property commit pointer. This deliberately
adds one manifest create/readback; it may be slower at small sizes. It tests whether
reduced body/history transfer pays for that cost. It is not an implementation of
independent per-note locks/HEADs or an eventually-consistent rebuildable index.

## Commit and failure semantics

- Manifest contains revision, note refs/hash/revision/size/tombstone, previews, shares
  and bounded24h receipt metadata. Bodies include full history/checklist.
- Single-note operations hydrate only the target body. Other Core records use preview
  placeholders, never committed over unchanged body refs. Full-text search, bulk
  folder operation and export hydrate all records; these remain scalability risks.
- Core expected revision, capability verification before replay, folder whole-store
  revision and revoke-folder-first conditions are retained unchanged.
- Write changed bodies as immutable files, readback/hash each; write manifest and
  verify; compare prior HEAD; publish/readback new HEAD. Prepublication failure leaves
  only orphans. Postpublication ambiguity is resolved by same request identity.
- A global lock serializes all requests. Different-note stale client revisions can
  both commit, but physical parallelism is not achieved. BUSY retries are explicit.
- Save receipt results reference their committed immutable body revision, not latest
  body. Other mutation results remain in manifest. No 20-receipt truncation; existing
 24h/2000 receipt window retained. Routing/profiling flags excluded from logical
  mutation fingerprint so recovered requests can replay in recovery namespace.
- 500 records, 3MB individual serialized file, 20MB sum body+manifest bounds. Receipts
  referencing older bodies add disk retention beyond current state. No GC/deletion.
- Owner-only portable export includes hydrated receipts, hashes no credentials. Restore
  validates records/index/ACL/receipt structure, writes to empty recovery namespace;
  identical restore retries compare input hash. Never restores over primary/legacy.
  Export is bounded by wire size and may require many sequential reads. Large-store
  paginated export/restore and scheduled off-account backup are NOT implemented.
- Sharded health validates only manifest and explicitly returns readVerified=false;
  full export/get verifies bodies. Preview list alone is not whole-store integrity.
- PerNote.js is concatenated into Server for the pinned three-file Google deployment;
  local VM loads same source separately. No added runtime OAuth scopes.

## Verification plan and decision criteria

Simulation: 100/500 Notes, target-only persistence, stale same-note vs different-note
updates, committed replay after later revisions, revoked workspace replay, history,
delete, folder atomicity, fail create/manifest/beforeHEAD/afterHEAD, corruption and
portable restore. VM execution time is not a Google benchmark.

Live workflow opt-in marker [per-note-trial]. Refuse a previously initialized shard
namespace; never automatically rerun mutations. Original store checked before/after.
Functional suite and small full-store restore occur BEFORE fill to100, so an early
latency failure does not erase their evidence. Seed batches<=5, diagnostic180s single
attempt (not responsiveness evidence). Primary benchmark20 samples each ping/list/
get/save at100 uses existing12s/twoattempt budget; failed primary remains failed even
when diagnostic with same request succeeds. Timing fields include serverTotal,
lockWait and manifest/body read/write; adapter records POST/redirect/body durations.

Do not run500 live automatically. First assess100 timing/errors. Original Notes
responsiveness target save p95<=3s is not relaxed to8s to declare success. No loss,
double commit or ACL regression permitted. This run is from Actions, not Vercel or
Vietnam iPad; no production readiness claim based on it. Vercel preview/idle/soak
measurements require a subsequent bounded experiment if this architecture merits it.

## Blob usage and official references

Read-only Vercel project discovery succeeded for homepage-nas. Billing charges API
for its owning team returned404 costs_not_found; this is NOT zero usage and provides
no store-specific monthly operation count. Notes private-store health/usage remains
unverified. Do not infer migration necessity from public-store failures.

Checked official documentation on16/10/2026:
- https://developers.google.com/apps-script/guides/services/quotas
- https://developers.google.com/apps-script/reference/lock/lock-service
- https://developers.google.com/workspace/drive/api/guides/limits
- https://vercel.com/docs/vercel-blob/usage-and-pricing

Drive API quota documentation now distinguishes projects under a new model from
May1 2026; do not assume12000 requests/min universally. Quota is not latency proof.
Direct Drive writes without experimentally established conditional-write semantics
are not introduced. Direct shared reads bypassing live ACL are not introduced.

## Results

Pending actual workflow evidence. Simulation and live findings will be recorded
separately; no claim that per-note is faster before measurement.

### First live attempt: harness/readiness failure, no shard mutation

Commit1db6d0b, run38886692298:47 simulated tests passed. Source management
readback verified version10/hash3ea307cefe90cce737e6597090b4ccc3da21a982395b535701d8226c3470d4d0;
independent operations passed. Trial's first legacy health returned BUSY while
operations was running; it stopped BEFORE shardInit. Final health returned old
buildv4 despite management version10. This confirms readiness was not established,
not a measured per-note storage failure. No runtime propagation cause inferred.
Evidence: results/google-per-note-attempt1-20261016.json, artifact12039484374.

Correction: trial waits for operational-probe completion, then requires two signed
health responses with expected runtime build before shardInit. Diagnostic readiness
failures remain in evidence; they are not benchmark successes. Retrying this attempt
is safe because artifact proves no initialization or Note mutation was attempted.

### Second live attempt and bounded continuation

Commit4ee7b18/run38887066554: signed runtime readinessv5 succeeded twice. Two
synthetic Notes created (10.46s and7.28s observed). Same-note race: one commit,
one409 after BUSY retry; committed writer lost two responses, then same request
replayed with core2ms/no shardCommit. Different-note race: A confirmed, B received
BUSY then UPSTREAM_HTTP after32.76s; workload stopped, without assuming B failed
or was lost. Original snapshot still119/100. No100-Note latency samples yet.
Raw evidence: results/google-per-note-attempt2-20261016.json, artifact12040016577.

Continuation is separately gated [per-note-resume]: read-only export MUST find
exactly2 records, revision4or5, no shares, exact expected synthetic titles before
new work. Inspect retained state/receipts to reconcile ambiguous B; never reset,
blind-rerun initialization or replay with guessed identity. Then new conditional
race tests run from observed current revisions. Every new mutation request is
checkpointed before sending (capability secret omitted; only synthetic content).
Diagnostic retries of503 or UPSTREAM_HTTP retain individual failures in output and
reuse request IDs. Primary benchmark budget is unchanged. Readiness now expectsv6.

Security follow-up: recovery namespace is owner-only even when a restored old
backup contains a formerly valid share token. Shared actors cannot select it as
an alternate route. Test includes a revoked capability in portable restore.
