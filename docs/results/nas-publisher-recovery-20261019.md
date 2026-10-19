# NAS publisher recovery evidence and cutover review — recorded 2026-10-19

## Attribution and scope

The operator supplied the Codex NAS recovery report in this conversation.
The assistant did not access NAS, inspect raw logs or independently verify the
signed acknowledgements. Times below are copied as UTC time-of-day from that
report; its table did not explicitly include calendar dates. The recording date
of this document must not be interpreted as the date of those test invocations.

Baseline reported by Codex NAS: clean checkout 2be7d18; admin user manager;
working directory /home/admin; standard output
/home/admin/.local/state/homepage-status/nas-status.json and .lock;
config owned by admin, regular file mode 0600, parser validation passed.
Timer active every five minutes. Sequence=5, pending=false, failures=0,
last_ack=09:25:28.969Z; GAS feed readable.

## Live endpoint fault injection (operator-reported)

| Test UTC | PID | Sequence | Durable pending / baseline | Result |
| --- | --- | --- | --- | --- |
| Pre-request fault 09:55:34.154–09:55:34.282 | 1458867 | 5 → 6 | Mutation tag 071b3862b7ec and payload hash retained; baseline/last_ack unchanged; failures 0 → 1 | No network request; no ack |
| New-process retry 09:56:44.447–09:56:49.639 | 1459009 | 6 | Same tag, sequence and payload hash; pending cleared; failures=0; last_ack=09:56:44.482Z | Verified signed ack, replay=false; GAS received_at=09:56:47.746Z |
| Drop ack after commit 10:27:02.208–10:27:07.824 | 1462434 | 6 → 7 | Mutation tag 61c6f2b89d8b and payload hash retained; baseline/last_ack unchanged; failures 0 → 1 | Transport verified signed ack replay=false, then wrapper withheld it from policy; GAS received_at=10:27:06.021Z |
| New-process replay 10:28:22.578–10:28:25.198 | 1462599 | 7 | Same tag, sequence and payload hash; pending cleared; failures=0; last_ack=10:28:22.624Z | Verified signed ack, replay=true; same hash and received_at=10:27:06.021Z, supporting no second commit |
| Normal timer tick 10:31:17Z | Not retained by systemd | 7 | pending=false, failures=0, last_ack unchanged | Service successful; timer active |

These are controlled transport/ack faults against the real GAS endpoint plus
recovery in a new Python process, under the standard lock/state. They are not a
whole-NAS outage, natural network-loss test or forced systemd process-kill test.
The pre-request fault deliberately made no network call. A normal timer tick
during backoff preserved pending and sequence 6. No warning data was fabricated.

Codex NAS reported 11/11 policy/transport simulations separately. Temporary
wrappers were removed, no test publisher remained, lock was free, timer active,
drop-in and rollback unchanged; tree still clean at 2be7d18. No generation,
sequence, baseline or last_ack was reset. Raw mutation IDs, secrets and signed
envelopes are intentionally absent. Short tags are sanitized operator references.

## Independent follow-up read on 2026-10-19

At approximately 00:50 UTC, an authorized Vercel connector read of the previously
qualified Preview API returned HTTP 200 with:
- updated_at=2026-10-19T00:26:59Z
- _report.received_at=2026-10-19T00:27:15.614Z
- _report.recovered_previous=false; X-Report-Recovery=current
- cam1/cam2/nas=ok, maintenance/retention=pass

The feed had advanced since the earlier Preview qualification. Receipt age was
about 23 minutes; source measurement preceded receipt by about 17 seconds.
This supports continuing successful publication/readability; it does not
independently prove the reported fault sequence or all intervening timer ticks.
Preview protection remains enabled; this is not anonymous Preview access.
No browser UI rerun was performed in this documentation review.

Production /config.js read in this session still selects the existing public
Blob nas-status.json URL. No production configuration or deployment was changed.

## Cutover gates

| Gate | Evidence | Status / next action |
| --- | --- | --- |
| Signed publish, heartbeat and stable skip | Prior two heartbeat intervals; Codex NAS sequence/state evidence | Passed for observed periods; not a long-term quota benchmark |
| Durable retry/restart and lost-ack idempotency | New-process faults above, real GAS ack and replay | Passed within controlled fault scope, operator-reported |
| Natural state change and recovery | Not observed; no fake warning sent | Open under agreed gate; observe a legitimate change without interrupting cameras |
| Physical network outage | Not performed | Unverified; controlled transport faults do not prove outage behavior; do not disconnect NAS to close this gap |
| UI freshness and recovery variants | Prior 10/10 Node regression includes freshness/error cases; normal real Preview UI passed | Partial: fallback-previous and future/skew browser variants need explicit evidence before claiming full coverage |
| Cold/cache-miss read and browser deadline | Reader timeout 12 s; browser status fetch timeout 5 s | Open risk: qualify slow/cold upstream against the browser deadline; current success does not prove all cold reads fit |
| Cache reuse / expiry | Prior MISS → HIT; independent current read 200 | Reuse passed; timed expiry/revalidation not explicitly qualified |
| Rollback | Saved NAS config and documented reader rollback | Partial: old Blob may not provide fresh reports; verify an operational rollback/fail-closed plan without resetting state |
| Production release | Main/production unchanged | Not authorized by this task; PR remains draft; final release must validate anonymous API/UI after cutover |

The broad field networkRestartRecoveryVerified in gas-live remains false because
natural network loss was not tested. The new scoped evidence records that
new-process recovery and post-commit replay did pass. Do not interpret that older
boolean as negating the controlled live test.

## Separate workstreams

Backup GAS backend/keys/terminal reports remain unqualified; private Actions
billing is independent. NAS-only cutover must leave backup report defaults and
Google v12 intact; do not replace Server.gs with the branch backup dispatcher.
QR private overrides/history and login limits retain Blob. Their migration or
rate-limit changes are outside this review; Notes stays in the separate Koofr app.

## Decision

HOLD: do not merge PR #23 or switch production in this task. Close or explicitly
resolve the open scope/acceptance gates above with the operator. In particular,
do not manufacture camera failure or claim a true outage from injected faults.
No new runtime tests were required for these documentation-only edits; earlier
test results are attributed to their original runs, not rerun results today.
