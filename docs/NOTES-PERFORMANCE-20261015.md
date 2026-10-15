# Notes performance and concurrent editing — 15 October 2026

## Stage 1

PR #14 was reviewed and corrected before merge. Commit `97e39d4` accidentally contained literal escaped newlines inside a comment, disabling the intended post-build metadata recheck. Checklist preview separators also used a literal backslash-n. Both were corrected in `4ada23e`; conditional index publication replaced unconditional publication. GitHub Actions run 25 passed. Production merge `2c7b31d` reached READY; an authenticated browser loaded three existing cards and opened a Note without editing it.

## Stage 2

- Private disposable index `indexes/notes-list-v2.json`. No migration or deletion of source Notes; v1 may remain unused.
- Read the index and authoritative object metadata concurrently. ETags are included so same-size and same-timestamp edits invalidate the index.
- Reuse unchanged index rows; only changed/new objects require content reads. Deleted objects/tombstones remove cards. Recheck metadata and body ETags before publishing; retry once, then return a retryable 503 rather than publish an inconsistent list. Publish using the previously read index ETag, or create-only if none was read.
- Authenticated GET accepts a bounded `known` list of Note IDs/revisions. Delta responses contain changed summaries and removed IDs. Large client manifests fall back to a full response. Old clients retain the original full-list response.
- Full content cache is tab memory only, at most five entries and approximately 6 MB of serialized UTF-16 text. Entries above 3 MB are skipped. LocalStorage still holds only titles and 180-character previews.
- Prefetch at most two recent/pinned Notes sequentially. Cached opens display immediately and revalidate with Blob `If-None-Match`; a 304 avoids retransmitting the content. Typing during revalidation preserves the draft and its original revision.
- Focus/visibility resumes synchronize after a ten-second minimum gap; no interval polling or autosave was added.
- Owner saves now require the current revision and use atomic Blob `ifMatch`. A 409 retains the local draft; `takeover` does not bypass protection. Folder changes and soft-deletes use CAS against the latest read version. Shared Note/workspace handlers already use conditional writes and continue reading authoritative content.
- Requests started before a save, new editor, or lock cannot overwrite the resulting editor state. Lock clears the full-content cache and invalidates pending requests.

## Validation and limits

Automated checks cover real SDK conditional headers and 304 handling, simultaneous writers, same-time/same-size changes, incremental reads/deltas, deletion, failed index writes, corrupt index fallback, unstable metadata, checklist/history, sharing/revocation, stale UI responses, cache clearing and retained drafts. Python status tests, static generation, JavaScript syntax and internal links are also checked.

The local checkout was assembled through the GitHub connector because direct git authentication was unavailable. Binary guide assets cannot be downloaded through that connector; local build/UI tests used path-only placeholders for those unchanged images. GitHub Actions and Vercel use the complete real repository for full builds. No placeholders are included in commits.

No NAS service, configuration, tunnel or storage was changed. No private Note content or credentials are committed. Live browser smoke checks are read-only on existing Notes; automated tests provide save/conflict coverage with isolated fake data. Deployment/CI results are reported in the delivery message. No valid before/after end-user timing percentage has been established; do not infer one from unit-test duration. Blob metadata listing and network latency remain on the request path, so Google Keep-equivalent latency is not guaranteed.

### Production ETag follow-up

The first v2 deployment returned a retryable list error in live smoke verification because raw equality between management-list ETags and HTTP response ETags rejected differing representations. The follow-up normalizes HTTP quoting for content comparisons (conditional writes use the canonical management token, as corrected below). If representations still cannot be matched while the metadata listing is stable, it serves freshly read source summaries without publishing a cache. This preserves availability without trusting an unverified index. Aggregate cache mode, source-read count and server duration are logged without IDs, paths, ETags or Note content. Two additional regression tests cover quoted and incompatible representations.


### Save incident N4-905fcf86

The request passed owner revision validation but Blob rejected the conditional write (`stage=persist`, 409). A separate synthetic Note could be created and edited, but reopening a long Note and updating it reproduced the same rejection. The HTTP read path and Blob management write path can represent one content ETag differently, including HTTP quoting/weak prefixes after compression.

The storage adapter now canonicalizes the token for management `ifMatch`, and owner/shared/workspace revision comparisons use that same content identity. HTTP conditional reads keep their HTTP representation. Real changes still fail revision checks or atomic Blob preconditions. No unconditional overwrite or automatic replacement of a draft is introduced. Existing editor pages can retry Save without reloading after the server fix.

A regression test uses the real SDK with isolated HTTP mocks: reopen with `W/"token"`, save with the canonical management token, save again using the management response revision, then reject a truly stale client. The live smoke flow uses only a disposable synthetic Note; existing user Notes are not edited.
