# Homepage NAS — AI tiếp quản

Repository: hunghvt-cyber/Homepage-nas. Current operating snapshot: 2026-10-21 (QR update; dated reports retain their measurement dates).

Read [docs/OPERATIONS.md](docs/OPERATIONS.md) and
[docs/data-sources.json](docs/data-sources.json) before changing a backend,
deployment, data source, authentication or reporting workflow. Re-check current
configuration and production evidence; dated reports are not live status.

- Keep plain HTML/CSS/JavaScript; Python builds static pages into dist. Source content is in content/, images in public/images/. Build with python3 scripts/build.py; QR requires requirements.txt and a confirmed HTTPS PORTAL_BASE_URL.
- Homepage production is Vercel project homepage-nas / main. Never deploy into home-ai, hunghvt-notes or a lab project.
- NAS and backup aggregate reads currently use GAS/Drive via Vercel API adapters. Defaults and production use /api/nas-report and /api/backup-report; no Blob fallback. Verify generated config.js and backup-config.js.
- NAS timer checks every five minutes; GAS publishing uses event changes plus a 30-minute heartbeat. Preserve freshness timestamps, pending mutation identity, generation and sequence. Do not add collectors, timers or fabricate measurements.
- Supabase is the Homepage login attempt counter in the isolated homepage_login schema of CongchungVND. Password verification/encrypted sessions stay on Vercel. Do not modify exam tables, users or policies. Never bypass the limiter or silently fall back between counter stores.
- Legacy Homepage Notes APIs are retired (410). /notes/ opens the independent Koofr Notes project. Its source is hunghvt-cyber/Hunghvt-notes on release/minimal-notes, not its nearly empty main. Do not restore legacy Notes writers, import caches as authoritative data or assume deleted Blob Notes can be rolled back.
- Guide overrides/history are active in the isolated Koofr guide adapter after the owner approved all six static originals on 2026-10-21 and import/readback/save/reopen passed. KOOFR_GUIDES_READY=true. Old Blob overrides/history were not recovered; owner accepted Git originals for initialization. Preserve old Blob objects/credentials; do not rerun initialization or overwrite the live namespace. See docs/QR-KOOFR-20261019.md and docs/QR-KOOFR-COMPLETE-20261021.md. Public QR reading stays independent of login; unavailable Koofr returns explicitly labelled static originals and fails closed for writes. Preserve revisions, shared-password checks and printed slugs.
- Expense/Gemini bridge, reporting GAS and active Telegram webhook GAS are separate deployments. Active bot is @PoormanTest0219_bot using doPost; do not bootstrap the legacy polling bot.
- Home-AI is a shortcut to an independent application, not a Homepage database/API dependency.
- No credentials, private keys, share tokens, raw events, recording paths or private data in repo/public output. Document secret names and storage locations only.
- Preserve local changes. No reset/clean/force-push/history rewrite. Inspect the exact diff and run checks appropriate to the change; build, JS syntax and local links for runtime source edits.
- Do not change NAS services, cameras, recordings, retention, tunnels, Google triggers or backup/sync engines as part of Homepage source/documentation work.
- Report deployment and verification limits truthfully. A selected report backend, READY deployment or successful report publish does not prove the underlying backup succeeded.



