# Homepage NAS → Vercel preflight — 2026-10-09

## Scope and result

Read-only verification before replacing the NAS Homepage and its public routes.
Homepage Vercel is publicly reachable, but the old NAS Homepage is coupled to
the Caddy proxy and Tailscale Funnel that also carry Viewer. FnNAS has a direct
Tailscale-IP path from the NAS, but it has not been tested from a second tailnet
device. Viewer UI, metadata/events, and playback `206` could not be verified
because Caddy's Basic Auth gate returned `401` without an authenticated session.

**BLOCKED: no service, route, tunnel, Homepage link, timer, or data was changed
or removed.** This follows the requirement to preserve components until the
replacement paths have been verified. No recordings, archive, Home-AI data,
maintenance, or retention jobs were accessed or changed.

## Check time and repositories

- NAS checks: **2026-10-09 14:53 +07:00** and the minutes immediately before
  report creation.
- Homepage repo: `hunghvt-cyber/Homepage-nas`, base `main` at
  `7acaff69c36ba1af570e1d90f7b14572fa95098d`.
- Report branch: `nas-homepage-migration-preflight-20261009`.
- NAS runtime configuration is not tracked in this repo; no NAS config files
  were edited.
- The Home-AI repo and Tapo repo were inspected only for status and were left
  unchanged, including their pre-existing local changes.

## Homepage Vercel and shortcut content

- `https://homepage-nas.vercel.app/` returned HTTP `200` with title
  `Homepage AIO`; the page is publicly reachable without Vercel login.
- A GET of the deployed page confirmed Home-AI links to
  `https://home-ai-two-topaz.vercel.app`; Viewer/FnNAS links are not active.
- Current `content/site.json` already keeps Home-AI as a shortcut to
  `https://home-ai-two-topaz.vercel.app`.
- Viewer and FnNAS URLs are blank in `content/site.json`. No shortcut was
  changed because the Viewer route is not yet verified from an authenticated
  tailnet client.
- The page's public `status.json` is only a sample: `updated_at` and
  maintenance/retention `measured_at` are `null`; `cam1`, `cam2`, `nas`,
  maintenance, and retention all have `state: "unknown"`.
- The deployed `https://homepage-nas.vercel.app/status.json` also returned HTTP
  `200` with schema `1` and those all-unknown/null values.
- `public/status.js` fetches the configured status URL (currently same-origin
  `/status.json`) and refreshes the page data every 5 minutes. It is not wired
  to a live NAS source. The Vercel site therefore must not be described as
  connected to live NAS status.

## Current NAS route/dependency map

| Component | Observed configuration and dependency | Decision |
| --- | --- | --- |
| NAS Homepage | Container `homepage`, Homepage image, healthy; host port `3000` is published on all interfaces. Compose project `homepage`, config is `/data/compose/4/docker-compose.yml` (NAS copy: `/vol1/Docker/Portainer/compose/4/docker-compose.yml`); it mounts `/vol1/Docker/Homepage` as `/app/config`. Local `http://127.0.0.1:3000/` returned `200`. | Keep until the shared Caddy/Funnel route can be safely changed. |
| Caddy / HomepageAuth | Container `homepage-auth`, Caddy image, host networking; active JSON config is mounted read-only from `/vol1/Docker/HomepageAuth/config/caddy.json`. `/vol1/Docker/Caddy/Caddyfile` is not the active container config. Current routes: `/viewer/*` → `127.0.0.1:8080`; `/nas` and `/nas/*` → `127.0.0.1:3010`; fallback `/` → `127.0.0.1:3000`. Basic Auth wraps these routes. | Keep. It is shared by Viewer, monitor, and Homepage. Do not replace it with the stale standalone Caddyfile. |
| Tailscale Serve/Funnel | Live Serve status maps `fnos-f922x.tail507a31.ts.net:443` `/` → `http://127.0.0.1:3001` (Caddy). Funnel status reports Funnel **on** for that same HTTPS route; `AllowFunnel` is true. Anonymous request to the public hostname root returned `401`. | Keep Funnel and Serve mapping until Viewer is validated. The current route is public through Funnel, not private-only. |
| Viewer | Candidate shortcut: `https://fnos-f922x.tail507a31.ts.net/viewer/`. Caddy rewrites `/viewer/*` to the Viewer at `127.0.0.1:8080`. Anonymous requests to UI, metadata API, and events API all returned `401` at Caddy Basic Auth. A Range request to a non-recording probe path also returned `401`; no valid recording was requested. | BLOCKED. No authenticated UI/API test and no valid MP4 Range `206` test. Keep the shared proxy and Funnel. |
| FnNAS monitor | Caddy `/nas` route leads to the monitor web service at `127.0.0.1:3010`; it is not the fnOS management UI. | Keep with Caddy. |
| FnOS management / cloudflared | `cloudflared-fnnas` is a running Quick Tunnel container, project `fnnas-tunnel`, using `--url http://127.0.0.1:5666`. Its active URL `https://museum-cgi-disable-roommates.trycloudflare.com/` matches the old Homepage `Management` link; it returned `200` and title `飞牛 fnOS`. The NAS listener also exposes HTTP `5666` and HTTPS `5667` on all interfaces. | This tunnel serves FnOS management, not just Homepage. Do not remove until the tailnet client link is accepted. |

Tailscale documents Serve as tailnet-only and Funnel as public. A given HTTPS
port cannot serve both modes at once; the most recent Serve/Funnel configuration
for the port determines its exposure. The current 443 mapping must be validated
from a tailnet client before switching it from Funnel to Serve. References:
[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve),
[Funnel CLI](https://tailscale.com/docs/reference/tailscale-cli/funnel).

The Tailscale node name reported by its local daemon is
`fnos-f922x.tail507a31.ts.net`. With the hostname directed to the NAS's own
Tailscale address for the check, `http://fnos-f922x.tail507a31.ts.net:5666/`
returned `200` and title `飞牛 fnOS`. This is a NAS-side check, not a second
phone/client test; the listener is also bound to all interfaces. Direct HTTPS
on port `5667` failed normal certificate validation. The Homepage's current
FnNAS link is still the Quick Tunnel URL, and the proposed tailnet link is not
yet in `content/site.json`.

## Status/cache and schedules

- `fnnas-monitor-collect.timer` is active and configured with
  `OnUnitActiveSec=15s`; `fnnas-monitor-web.service` is active. The collector is
  `/opt/fnnas-monitor/collector.py`. It was not run manually or modified.
- The old NAS Homepage polls its same-origin `/nas/api/tapo?source=...` route
  every 5 minutes. Caddy's Basic Auth protects that route. This is not an
  unauthenticated, CORS-enabled public snapshot source for Vercel.
- No Homepage/cloudflared updater was found in the active systemd timer list or
  the checked cron files. The 15-second monitor collector is separate from the
  five-minute browser refresh.
- `tapo-daily-maintenance.timer` and `tapo-verified-retention.timer` remain
  active; both Tapo Event Logger containers remain running. None was invoked,
  restarted, or changed.
- **Status feed BLOCKED:** no stable, read-only HTTPS source with the required
  CORS policy is configured for Vercel. Do not use the Basic-Auth monitor API,
  publish collector internals, or open a new tunnel just for status. Keep the
  site at `unknown` until an approved source exists. A future snapshot may
  consume the existing collector/cache every five minutes and preserve the
  collector's actual measurement times; it must not rescan the NAS or fabricate
  timestamps.

## Verification limits and change decision

Verified:

- Public Homepage Vercel deployment returns `200` and the expected title.
- The active Caddy and Tailscale mappings are identified; the public Funnel
  target is the same Caddy instance that handles Viewer and `/nas`.
- The current Quick Tunnel's configured origin is port `5666`, and its active
  public URL serves fnOS. The NAS-side Tailscale-IP HTTP probe also serves fnOS.
- Existing collector and maintenance/retention schedule names and states were
  inspected without running them.
- Repo verification: `python3 scripts/build.py` was attempted and stopped because
  the local `qrcode` module is missing; no dependency was installed. Node.js is
  unavailable, so the repository's JavaScript syntax check could not run.
  `git diff --cached --check` passed. Credential-pattern scan found no token,
  API key, private key, or authentication hash.

Not verified:

- Viewer page render after authentication, authenticated metadata/events,
  playback response `206`, or access from either family phone.
- FnNAS navigation from a second authorized Tailscale device, tailnet ACL access,
  or a browser-usable trusted HTTPS link on port `5667`.
- A live, sanitized NAS status snapshot delivered to the Vercel page with CORS.
- Public route removal and post-change service checks; no public route was
  removed.

Because the current Caddy/Funnel route also serves Viewer and the old Homepage,
and the Viewer acceptance checks are blocked, the following remain in place:
`homepage`, `homepage-auth`/Caddy, Tailscale Funnel/Serve on 443, and
`cloudflared-fnnas`. No NAS rollback copy was needed because no NAS config or
service was changed. No credentials, passwords, tokens, private keys, Caddy
auth hashes, LAN/Tailscale IP addresses, recording paths, event details, or
service logs were copied into this report. Loopback proxy targets are shown to
explain the route map.

## Rollback plan for a later approved cutover

Before any later teardown, save the active Caddy JSON and the two Compose
definitions to a private local directory with restrictive permissions; do not
put them in this public repo. Preserve the existing Tailscale 443 mapping and
the FnNAS route details. Then, only after authenticated Viewer and second-device
FnNAS checks pass:

1. Switch Homepage shortcut to the verified private Viewer/FnNAS URLs and verify
   the public Vercel page.
2. Turn Funnel off for 443 while retaining the Tailscale Serve proxy to Caddy;
   confirm Viewer still works through tailnet from a phone.
3. Remove only Caddy's fallback route to port `3000`, then stop/remove only the
   `homepage` container. Keep Caddy, Viewer and `/nas` routes.
4. Remove the Quick Tunnel only after the FnNAS shortcut works from a phone over
   Tailscale. Its `trycloudflare.com` address is ephemeral; recreating its
   Quick Tunnel may assign a different URL, which would need an explicit
   rollback link update.
5. Recheck Vercel, Viewer UI/API/Range `206`, FnNAS, recorder/Event Logger,
   collector and unchanged maintenance/retention timers.

If rollback is needed, restore the saved Caddy configuration and Compose
definitions locally, restart only the affected Homepage/Caddy/tunnel components,
and restore the prior link. Do not use `docker prune`, broad directory cleanup,
or alter maintenance, retention, recorder, Event Logger, Home-AI, recordings, or
archive data.
