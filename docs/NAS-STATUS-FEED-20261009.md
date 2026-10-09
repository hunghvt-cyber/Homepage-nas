# Homepage AIO status feed

Implemented a Python publisher that reads the existing 15-second FnNAS monitoring cache and the last maintenance summary. It does not start another NAS scan or include collector payloads in the upload. The allowlisted schema contains only `schema`, source `updated_at`, camera/NAS states, and maintenance/retention states with their own measurement time.

## Publishing

- Vercel's official Python Blob SDK (`vercel==0.11.6`) writes the fixed public pathname `nas-status.json`, with overwrite enabled, no random suffix, JSON content type, and a 300-second cache lifetime.
- The publisher reads its token at runtime from `~/.config/homepage-nas/blob-token`; no credential is stored in this repository.
- A nonblocking file lock prevents overlapping runs. The SDK call has a 25-second deadline and the systemd unit a 35-second limit. Upload errors exit nonzero without touching the monitoring collector.
- Runtime snapshot output is under `~/.local/state/homepage-status/` and is not tracked by Git.

## Evidence and freshness

- NAS state is derived from the fresh collector's root and volume filesystem measurements. Camera containers being present/running is not proof of camera operation, so both camera states stay `unknown`.
- Maintenance and retention are `unknown` when their recorded result is older than 15 minutes. The page independently flags old measurement times and shows those times; it does not present an old result as current PASS.
- At implementation time, the monitoring cache was fresh. The maintenance result was from the prior day, and retention was only a dry run, so both are published as `unknown` with their source measurement time.
- The payload is limited to the allowlisted fields and does not expose IPs, recording paths, events, secrets, or administrator details.

## Verification

- Two successful uploads used the same returned Blob URL. Listing the dedicated store found exactly one object, `nas-status.json`.
- The public URL returned HTTP 200 and `application/json`. A request carrying the Homepage origin received `Access-Control-Allow-Origin: *`.
- Homepage `status_url` points at that returned URL. UI source preserves the existing camera/NAS five-minute refresh, loads maintenance/retention on page open, and labels measurements older than 15 minutes as old.
- QR assets and Home-AI shortcut markup were not changed by the status feed implementation.

## Schedule

The user-level `homepage-status-publish.timer` runs one minute after boot and then every five minutes. It is separate from the collector and maintenance timers. It does not push GitHub or trigger a deployment on each run.
