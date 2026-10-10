# Notes takeover and private expense statistics

Notes now saves only when the user presses Save. Removed the two-second autosave, periodic revision polling, and Refresh list button. Unsaved changes remain in the editor, including edits made while a save is in flight; those require another explicit Save. Leaving with unsaved changes still warns. Each Save uses `/api/notes-save`; the server always uses an unconditional Blob overwrite regardless of any client takeover flag or stale revision. `/api/notes` retains compatible save behavior for older pages; bounded history retains the previously observed server content. The Notes script URL is versioned to avoid reusing the previous autosave bundle. Older already-open pages can also save through the compatible `/api/notes` path; reload loads the new dedicated save endpoint.

Homepage now has six shortcut tiles, including `/chi-tieu/`. The separate expense page uses the existing Notes/QR shared-password session. It shows monthly totals, income, difference, daily expense bars, category bars, and a payer filter. Data is requested only on unlock, month selection, or Refresh. No NAS work or changes.

## Connecting real data (pending)

Bot repo adds `HomepageStats.gs` and a narrow `homepage_stats` POST branch in `FamilyRouter.gs`. This reads the configured family group's Google Sheet only; ignores DELETED rows and excludes descriptions, Telegram messages, and transaction identifiers. Month boundaries use Asia/Ho_Chi_Minh. Requests carry an HMAC SHA-256 signature and a timestamp valid within 60 seconds. No unauthenticated statistics endpoint.

1. Generate a random secret of at least 32 characters outside chat. Set it in Apps Script Script Properties as `HOMEPAGE_STATS_SECRET`.
2. Set the identical value in Homepage Vercel production as `EXPENSES_API_SECRET`. Set `EXPENSES_API_URL` to the bot's deployed Apps Script `/exec` URL. Never put these values in source, chat, or logs.
3. Deploy the reviewed bot source to its existing Apps Script deployment without running setup/bootstrap or changing polling triggers. The existing manual workflow is frozen/commented for a migration; inspect current operational status before invoking it.
4. Redeploy Homepage after changing production environment settings. Verify a locked request returns 401 and an unlocked month matches Botchitieu/Sheets, including deleted transactions and Vietnam month boundaries.

Until configuration/deployment is complete the page says “Chưa kết nối dữ liệu Botchitieu”; it does not display sample figures or a false zero.

## Validation

Local JS tests cover private access, signed expense requests, stripping non-chart fields, Notes unconditional manual writes from stale clients, and preservation of the latest observed server version in history. Two transport tests run the real installed Blob SDK with Undici MockAgent, verify private overwrite headers without If-Match/If-None-Match, and confirm a mocked Blob 412 is reported as a storage failure instead of blaming another device. Build and internal links checked. Unchanged image binaries were inaccessible to the text-only GitHub fetch connector; local build used untracked presence fixtures only. Original image objects remain untouched in GitHub. Live browser/Blob verification is recorded below; separate-device and GAS end-to-end checks remain unverified.


## Persistent conflict investigation, 10:55 Vietnam time

Runtime logs and scoped deployment inspection were rejected with Vercel 403; no live root cause is confirmed. The save path no longer chooses conditional persistence based on a browser flag. The dedicated writer `overwriteNote` has no etag input and sends only unconditional overwrite options. Responses include `X-Notes-Writer: manual-v3`; an unexpected Blob precondition rejection becomes 503 with `NOTE_STORE_REJECTED`. No note content, paths, tokens, passwords, or cookies are logged. List refresh after a successful save can no longer turn a confirmed save into a displayed save failure. Client script URLs derive from the SHA-256 of the current Notes script.

## Live recheck and diagnostics

At 11:13 Vietnam time, scoped Vercel deployment inspection and recent runtime logs worked. Production `homepage-nas.vercel.app` served commit `a8156c6` and its current Notes script. The preceding 20-minute logs showed a URL parsing deprecation warning, without a save failure trace.

Using secure browser authentication, created one separate diagnostic note at 11:19, then saved it four times across two browser tabs. Both tabs saved successfully after the other tab had changed the server version; reloading read the final text and three previous history entries. This verifies real private Blob persistence and stale editors in two tabs sharing a session. Existing personal notes were not edited. The user's reported device error was not reproduced, so its cause remains unknown.

The follow-up adds `manual-v4` headers, a per-request `N4-xxxxxxxx` reference, and metadata-only save/failure logs: writer, reference, operation, stage and HTTP status. Logs exclude titles, text, note identifiers, paths, revisions, cookies, passwords, tokens and raw errors. Failed saves retain the draft and display the reference for correlation with Vercel logs. Notes HTML and the account script use no-store; versioned scripts load the current client after reopening the page. Save behavior remains unconditional and manual, with no autosave or periodic requests.
