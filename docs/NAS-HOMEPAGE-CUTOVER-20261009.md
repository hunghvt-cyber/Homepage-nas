# Homepage Vercel and Tailscale cutover — 2026-10-09

## Result

Runtime verification was performed on 2026-10-09 in Asia/Ho_Chi_Minh. The
post-cutover phone check for the new private Viewer URL remains pending.

- Viewer: `https://fnos-f922x.tail507a31.ts.net:8443/viewer/`
- FnNAS: `http://100.94.158.94:5666/`

The independent Homepage at `https://homepage-nas.vercel.app/` is the shortcut
portal. Its Home-AI shortcut and QR domain/path were left unchanged. Viewer and
FnNAS shortcuts now point to verified Tailscale-only routes. The public status
file remains the existing sample: camera, NAS, maintenance, and retention states
are `unknown`; it is not connected to a live feed.

## Runtime changes

- Tailscale Funnel was disabled. Tailscale Serve is tailnet-only on HTTPS port
  `8443`, proxying to the existing Caddy listener at `127.0.0.1:3001`.
- The host already uses port `443` for fnOS, which redirects requests to `5667`.
  The previous Serve mapping on `443` therefore reached fnOS instead of Caddy.
  Viewer uses `https://fnos-f922x.tail507a31.ts.net:8443/viewer/` to avoid that
  listener conflict. The Viewer remains behind the existing Caddy Basic Auth.
- The Caddy `127.0.0.1:3000` fallback was removed. The `/viewer/*` and `/nas/*`
  routes, their authentication, and the Caddy container remain.
- The old `homepage` container and `cloudflared-fnnas` container were stopped
  and removed. Their Compose definitions were removed. The direct fnOS route
  was verified separately: `http://100.94.158.94:5666/` returns the fnOS UI.
- Active root-level Homepage configuration files were removed after confirming
  that only the old Homepage container mounted that directory. Historical
  backup and audit folders were retained. No Docker prune was run.
- A private local rollback copy of the prior Caddy JSON, Homepage files, Compose
  definitions, and Tailscale state was saved with directory mode `0700`; it is
  outside this repository.

The FnNAS tunnel updater scripts under `/opt/scripts/cloudflare/` remain because
this session's OS account cannot delete their root-owned files (`sudo` requires a
password). No active systemd timer, cron entry, or other reference to those
scripts was found. The updater is inert without its runner/schedule and the
removed tunnel. The unrelated Cloudflare scripts/logs were left untouched.

## Verification

- Tailscale Serve reports `tailnet only` on `8443`; Funnel is not enabled.
- A request through the tailnet address reaches Caddy and returns `401` before
  authentication, confirming the Basic Auth gate remains. TLS verification on
  `8443` succeeds.
- Viewer upstream UI returned `200`; a local MP4 byte-range request returned
  `206`. The user had already confirmed Viewer video playback on phone before
  cutover.
- Caddy's unauthenticated Viewer API request returns `401`, as expected. A
  direct upstream metadata request before cutover timed out after 20 seconds;
  authenticated metadata/events API behavior was not independently verified.
  The metadata request may have refreshed derived metadata, but did not touch
  recordings or archive data.
- The fnOS HTTP listener at `5666` returned `200` with the fnOS page, and the
  user confirmed the direct link from a phone before cutover.
- `homepage-auth`/Caddy, the FnNAS monitor collector, both Event Logger
  containers, both recorder services, and the maintenance/retention timers were
  checked and remain active. No recorder, Event Logger, collector, maintenance,
  or retention job was run or modified.

## Rollback

The prior Caddy, Homepage, Compose, and Tailscale state is in the private local
rollback copy outside Git. Restore Caddy first, then recreate only the Homepage
and tunnel services from their saved Compose definitions if rollback is needed.
Do not restore Funnel unless public exposure is explicitly requested. The old
Homepage active config files were also included in the private copy.
