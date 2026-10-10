# Notes takeover and private expense statistics

Notes: an explicit Save takes over even when another device saved a newer revision. Automatic saves still use conditional revisions. A displaced page stops autosaving after a conflict or a 15-second revision check, retains its local draft, and can explicitly Save to take over again. This disconnects editing for that note, not the shared-password session. Previous server content is retained in the existing bounded history. Automatic saves keep conditional Blob writes. Explicit Save intentionally performs an unconditional overwrite, so a Blob ETag precondition cannot block the requested takeover. Simultaneous explicit saves use last completed write wins; history preserves the server version observed before that save.

Homepage now has six shortcut tiles, including `/chi-tieu/`. The separate expense page uses the existing Notes/QR shared-password session. It shows monthly totals, income, difference, daily expense bars, category bars, and a payer filter. Data is requested only on unlock, month selection, or Refresh. No NAS work or changes.

## Connecting real data (pending)

Bot repo adds `HomepageStats.gs` and a narrow `homepage_stats` POST branch in `FamilyRouter.gs`. This reads the configured family group's Google Sheet only; ignores DELETED rows and excludes descriptions, Telegram messages, and transaction identifiers. Month boundaries use Asia/Ho_Chi_Minh. Requests carry an HMAC SHA-256 signature and a timestamp valid within 60 seconds. No unauthenticated statistics endpoint.

1. Generate a random secret of at least 32 characters outside chat. Set it in Apps Script Script Properties as `HOMEPAGE_STATS_SECRET`.
2. Set the identical value in Homepage Vercel production as `EXPENSES_API_SECRET`. Set `EXPENSES_API_URL` to the bot's deployed Apps Script `/exec` URL. Never put these values in source, chat, or logs.
3. Deploy the reviewed bot source to its existing Apps Script deployment without running setup/bootstrap or changing polling triggers. The existing manual workflow is frozen/commented for a migration; inspect current operational status before invoking it.
4. Redeploy Homepage after changing production environment settings. Verify a locked request returns 401 and an unlocked month matches Botchitieu/Sheets, including deleted transactions and Vietnam month boundaries.

Until configuration/deployment is complete the page says “Chưa kết nối dữ liệu Botchitieu”; it does not display sample figures or a false zero.

## Validation

Local JS tests cover private access, signed expense requests, stripping non-chart fields, Notes stale autosave rejection, and explicit takeover with preservation of the latest server version in history. Build and internal links checked. Unchanged image binaries were inaccessible to the text-only GitHub fetch connector; local build used untracked presence fixtures only. Original image objects remain untouched in GitHub. No browser or real multi-device/Blob/GAS end-to-end verification has been claimed.
