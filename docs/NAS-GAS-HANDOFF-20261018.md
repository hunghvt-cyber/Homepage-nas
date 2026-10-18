# NAS publisher handoff

GAS version 12 has been deployed using the retired standalone Notes prototype
project. Expense/Gemini projects are unchanged. The schema lives in Core.gs in
this existing project; the repository's canonical source is nas-schema.cjs.
The execution log confirms successful initialization and 17 real Drive checks
using a disposable property namespace/folder. This is not an end-to-end benchmark.
The deployed feed still returns NO_REPORT; Homepage production still uses its
previous source.

## Task for Codex with an existing NAS connection

Use `hunghvt-cyber/Homepage-nas`, branch
`feat/gas-reports-after-notes-retirement-20261018`. Read AGENTS.md and the NAS
reporting architecture/event policy documents first. Inspect the actual existing
publisher path, service user, five-minute timer, collector output and lock/state
locations read-only. Do not change cameras, collectors, retention jobs, tunnels,
expense/Gemini or backup engines.

Prepare the reviewed publisher and its two Python dependencies using the same
service user/timer. Run the local policy/transport tests first. Confirm RAM/swap
thresholds from existing NAS policy; do not invent health thresholds. Preserve
the original publisher configuration for rollback. Do not start another collector.

The configuration helper creates an owner-only 0600 file with `url`, `key` and
`generation`; do not hardcode credentials, print them or ask for them in chat.
The reporting key has been generated in the dedicated GAS property
NAS_REPORT_KEY. It has not been read or exported by the assistant. Stop at the
secure transfer/configuration step if no approved secret input channel is
available; identify exactly what operator action is required.

GAS endpoint (not a secret):
`https://script.google.com/macros/s/AKfycbwnIO4-cED9dRdNH0ik4FR9os_9kM4XDXqaNdn0iorb5JoiNRIg8dgp0fWEJYurLWAwPA/exec`

After secure configuration, verify an actual signed publish/ack and an anonymous
Vercel read before selecting the new Homepage source. Then observe at least two
30-minute heartbeat cycles, a state transition, lost network/ack and restart.
Report source measured_at separately from GAS received_at, real latency/failures,
skip/send counts and logs. Do not label local simulations or the in-process Drive
test as a network benchmark. No Homepage cutover until this evidence passes.

## After the operator has configured the key

Update this branch without discarding local changes. As the verified admin service
user, validate the config with load_config and print only success/failure, never
its contents. Resolve the actual absolute config path in the service environment.
The old drop-in example used systemd %h, which follows the service manager's home
and is not changed by User=admin. The corrected example leaves the runtime Python
default in place; any explicit override must use the verified absolute path.
Reference: https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html#Specifiers

Run one publisher invocation using the service's actual working directory,
environment, output and lock paths, overriding only STATUS_BACKEND=gas-drive and
the verified config path. Require a verified signed ack before touching the unit.
Do not delete/reset generation or sequence/policy state to recover a failed run.

After success, save the prior publisher configuration, apply only the reporting
drop-in and reload the appropriate service manager. Keep the existing five-minute
timer; do not create an additional timer or collector. Verify the effective user
and config path, then check skip behavior, real sends, two heartbeat cycles and
network/restart recovery without changing firewall/tunnels or camera workloads.
Return sanitized ack metadata, timestamps, unit state and timing/count evidence;
do not export config, keys, raw signed envelopes or the entire service environment.

## Automatic updates

The existing GitHub OAuth updater is scoped to the retired Notes prototype and
must not be run unchanged: it would restore old Notes code. Private Actions are
blocked by account billing. A reporting-specific updater and a working execution
channel still need qualification; current browser access does not guarantee
permanent unattended updates. Do not reveal/retrieve GitHub/Vercel stored secrets
to work around this limitation.
