# Homepage access — 26 October 2026

Homepage owns the unlock, lock and change-password forms at `/#portal-account`.
Expenses, Gemini (including its iframe) and guide editing share the existing
HttpOnly encrypted cookie. Subpages link to Homepage rather than asking again.
Notes remains an independent application; its password/cookie are unchanged.
Lock signs this browser out. Password change revokes every previous Homepage
session version; other open tabs refresh on a broadcast or when focused.

The initial password remains PORTAL_PASSWORD until the first web change. The
new salted scrypt verifier and random session version are stored server-side as
`portal-auth.json` in the existing private KOOFR_GUIDES_NAMESPACE, signed with
SESSION_PASSWORD. No plaintext password is stored, returned, or logged. Missing
file (HTTP 404) means initial env password; errors or invalid files fail closed.
Do not delete/restore this file casually: deleting it reverts to the env password,
and restoring an older record can restore its password/session version. Back it
up privately with the guide namespace. Rotation of SESSION_PASSWORD requires an
explicit recovery plan because it signs this record as well as sealing cookies.
Changing PORTAL_PASSWORD alone no longer rotates an existing stored password.

Writes require same origin, authenticated version, current password, confirmation
and the existing Supabase attempt limiter (including password-change attempts).
The DAV collection lock serializes guide saves and password changes. A readback
confirms the signed verifier before success, even after lost PUT acknowledgement.
Logout and public auth GET do not consume login attempts. No new Vercel function,
Supabase schema/RPC or external credential is added. Each authenticated API request
reads the current version from Koofr; no stale verifier cache is used.

Validation: 99 Node tests passed, including store corruption/outage, wrong current
password, old cookie revocation, lost write ACK, encrypted login/logout, origin and
limiter checks, plus centralized account UI. Static build passed. No production
password was changed for testing; actual first change is performed by the owner
through the form. Production authenticated Koofr read/write remains to be checked
by the owner on first use; deployment/public UI checks do not prove that write.
