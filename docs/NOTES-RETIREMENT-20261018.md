# Retire Homepage Blob Notes

User authorized deleting legacy Notes on 2026-10-18 after moving to the independent Koofr application.

- `/notes/` opens `https://hunghvt-notes.vercel.app/`; old query strings and fragments are discarded.
- The five legacy API defaults return 410 before session or storage access. Named legacy factories are retained for historical backend regression tests only.
- Old editor assets and generated editor markup are removed. Old share/workspace pages terminate locally.
- `guides/` and `login-attempts/` remain untouched. Expense and Gemini integrations retain their existing login behavior.
- Do not roll back to an old Notes writer after deleting its data. New Koofr data is outside this repository and cleanup scope.

## One-time cleanup

First deploy and verify the retired handlers on the canonical production hostname. Then run `node scripts/retire-notes-blob.mjs` inside the existing Homepage production environment. The default is an inventory only. A deliberate `NOTES_BLOB_CLEANUP=DELETE_RETIRED_NOTES_20261018` enables deletion.

The script verifies the exact Vercel project and production environment, completes a paginated inventory, and validates every path before deleting any object. Only UUID Notes, 32-hex shares and the exact `indexes/notes-list-v2.json` index are allowed. Unknown paths abort the run. Counts are logged without bodies, object URLs or credentials. The script verifies the remaining target count is zero. Never delete the entire private store.

Source and local tests do not prove that live Blob cleanup succeeded. Record deployment ID and live deleted/remaining counts separately. A blocked private store or missing build credential must leave this step incomplete.
