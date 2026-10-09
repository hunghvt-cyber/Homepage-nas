# Viewer direct Tailscale IP shortcut — 2026-10-09

## Update

Changed the Homepage Viewer shortcut to `http://100.94.158.94:8080/`. FnNAS
remains `http://100.94.158.94:5666/`, and Home-AI remains
`https://home-ai-two-topaz.vercel.app`. No domain, guide slug, QR path, or status
feed source changed. The public status snapshot remains `unknown` with null
measurement timestamps.

## Verification

The user confirmed the Viewer UI opens from a phone with Tailscale enabled at
the direct IP URL. Runtime checks confirmed metadata and events APIs return
HTTP 200 over that IP and a playback byte-range request returns HTTP 206.
Playback from the phone over this new IP URL has not been confirmed yet; the
HTTP 206 check was made from the NAS runtime.

The Viewer service is configured to bind only the NAS Tailscale IPv4 address
and loopback. Loopback remains for the Caddy proxy. Caddy still routes `/nas`
to the monitor service on loopback port 3010, so Serve 8443 and Caddy remain in
place for that monitor path. Funnel remains off. The collector is retained; no
NAS services or schedules were changed by this repository update.

## Rollback

Revert this commit to restore the previous Viewer shortcut. This does not
change FnNAS, Home-AI, QR paths, or any NAS service configuration.
