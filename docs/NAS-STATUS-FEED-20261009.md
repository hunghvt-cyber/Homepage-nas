# Homepage AIO status feed

Implemented a Python publisher that reads the existing 15-second FnNAS monitoring cache and the last maintenance summary. It does not start another NAS scan or include collector payloads in the upload. The allowlisted schema contains only `schema`, source `updated_at`, camera/NAS states, and maintenance/retention states with their own measurement time.

## Publishing

- Vercel's official Python Blob SDK (`vercel==0.11.6`) writes the fixed public pathname `nas-status.json`, with overwrite enabled, no random suffix, JSON content type, and a 300-second cache lifetime.
- The publisher reads its token at runtime from `~/.config/homepage-nas/blob-token`; no credential is stored in this repository.
- A nonblocking file lock prevents overlapping runs. The SDK call has a 25-second deadline and the systemd unit a 35-second limit. Upload errors exit nonzero without touching the monitoring collector.
- Runtime snapshot output is under `~/.local/state/homepage-status/` and is not tracked by Git.

## Evidence and freshness

- NAS state is derived from collector root and volume filesystem measurements. The overall cache timestamp is preserved as `updated_at`.
- Camera state uses existing per-camera cache evidence: recent `last_video_at`, `status=recording`, `recorder_active`, and `sample_growth`. A running container alone is insufficient. If the camera cache or recording evidence is missing or stale, its state is `unknown`.
- Maintenance reads only `LAST_UPDATE` and `STATUS` from its summary. It preserves that result and its measurement time regardless of age; the summary's `RETENTION=DRY_RUN` is never used as a verified retention result.
- Verified retention reads its independent latest result, validates date, timezone-aware start/finish times, overall status and job statuses, then verifies each referenced result's SHA-256 and `mode=APPLY` under the configured evidence root. A dry run or incomplete/inconsistent result becomes `unknown`; valid results use `finished` as `measured_at`.
- The page marks camera/NAS telemetry stale when snapshot `updated_at` is older than 15 minutes. That stale marker does not replace the historical maintenance/retention result; their latest state and measurement time remain visible.
- The payload is limited to the allowlisted fields and does not expose IPs, recording paths, events, secrets, or administrator details.

## Verification

- Two successful uploads used the same returned Blob URL. Listing the dedicated store found exactly one object, `nas-status.json`.
- The public URL returned HTTP 200 and `application/json`. A request carrying the Homepage origin received `Access-Control-Allow-Origin: *`.
- Homepage `status_url` points at that returned URL. UI source preserves the existing camera/NAS five-minute refresh, loads maintenance/retention on page open, and marks only telemetry stale from the snapshot timestamp.
- QR assets and Home-AI shortcut markup were not changed by the status feed implementation.
- Snapshot fixtures cover previous-day and current-day result timestamps, verified retention dry-run, old telemetry snapshots, fresh recording evidence, and missing sources.

## Schedule

The user-level `homepage-status-publish.timer` runs one minute after boot and then every five minutes. It is separate from the collector and maintenance timers. It does not push GitHub or trigger a deployment on each run.
