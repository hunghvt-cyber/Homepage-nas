# Homepage NAS

Repository: hunghvt-cyber/Homepage-nas. Independent static Homepage and QR instructions; Home-AI is only a shortcut.

- Keep plain HTML/CSS/JavaScript. Python generates static pages; qrcode is build-only.
- Text in content/, compressed images in public/images/. Do not add Firestore, Auth or Home-AI API dependencies.
- Build: python3 scripts/build.py; QR build needs requirements.txt and a confirmed PORTAL_BASE_URL HTTPS origin.
- Never change guide slugs after QR printing. Never derive printed QR URLs from preview deployment URLs.
- Root Vercel project uses main and dist output. Never deploy this repo into the existing Home-AI project.
- NAS status is public, minimal and read-only. Preserve camera/NAS five-minute refresh and maintenance on page load only. Show data freshness; never fabricate current measurements.
- No credentials, private keys, events, recording paths or private data in source/public output.
- Preserve others' changes, no force-push or history rewrite. Inspect diff and run build, JS syntax and internal-link checks before push.
- Report deployment and browser verification limits truthfully. Do not change NAS services or tunnels as part of source edits.
