# Homepage Automation — public OAuth information

Three static public pages, separate from Homepage Notes production:

- `/`: application description, Google permissions, status and links.
- `/privacy/`: actual/planned data practices, storage, retention and revocation.
- `/terms/`: personal-use experimental scope and operating limits.

Source in `site/` is deployed as files only to Vercel project **homepage-automation-info** (`prj_KV0bSpnREDAtS1GUKA1ceU1zawvE`), team `team_gCsQcRiaCja0GafKj8JZLINI`. It has no Git connection, env vars, API, database, secrets, authentication forms or JavaScript. No source files/settings of the existing homepage-nas or Home-AI Vercel project are changed. Public access is configured only on this new information project.

## Deployment

Deploy only the five files under `site/` using authenticated Vercel tooling and this dedicated project ID; do not deploy the repository root. Use the deployment metadata to confirm the generated stable alias; never infer success from an intended hostname. After READY, fetch all three routes without authentication, verify 200/text HTML, headings and privacy/terms links, then give URLs to the user. Keep the latest deployment mapped to the source commit in metadata.

These are public informational pages, not a Notes rollout, data migration, or OAuth consent grant. They do not collect Google credentials.

## OAuth Branding

Copy the observed live homepage/privacy/terms URLs into the corresponding Branding fields. An authorized domain may also be required. For a Vercel subdomain, check which domain Google accepts in its own UI; do not claim ownership of `vercel.app` or `google.com`. If Google asks to verify the specific app subdomain in Search Console, use URL-prefix ownership verification and add only the verification value supplied by the owner to this static project. Never fabricate a verification tag or assert that merely creating pages guarantees publishing or verification.

App support/contact email remains in Google OAuth configuration. These pages intentionally do not publish the user's email/address; contact is through the support email displayed on the OAuth consent screen. Changes to privacy wording must match the source implementation, including the distinction between prototype and deployed production.

## Current diagnostic context

The user's OAuth app remains External/Testing; Audience says Branding configuration is required while Verification Center says verification is not required because it is Testing. The user confirmed the three App domain URL fields are empty. Google Branding documentation describes homepage/privacy/terms for external production; adding real public pages is the next concrete setup step, not proof that the blank URLs were the only blocker.

Official reference: https://support.google.com/cloud/answer/15549049
