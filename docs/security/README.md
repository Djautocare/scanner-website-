# Browser and account security update

Prepared 24 October 2026. The private backend update is delivered separately; it must not be committed to this frontend repository.

The frontend now blocks executable inline scripts and inline event attributes with CSP. Legacy page scripts have been moved to ordinary same-origin files under `js/pages`; legacy actions are compiled callbacks in `js/security-events.js`, with dynamic values passed as HTML-escaped JSON data. There is no runtime eval or Function constructor. Script-assigned event properties still replace an older action, preserving the original behavior and avoiding duplicate submissions. Known barcode, PDF and QZ libraries remain allowed at their existing pinned script URLs. Cloudflare's analytics beacon and reporting endpoint remain allowed. Styles still allow inline declarations because existing themes and layout code use them.

The account session client negotiates support with the backend. With the security backend installed, successful sign-in uses a host-only HttpOnly/Secure/SameSite=Strict cookie, with an opaque server-revocable session. The readable storage value is a public compatibility marker, not a credential. A prior JWT is removed only after the browser confirms that its replacement cookie works. The previous backend remains usable until the private update is installed. Legacy bearer sessions retain their original expiry during the transition; enabling MFA revokes that account's old sessions. Till device/PIN credentials remain separate, scoped credentials needed by the till workflow. This update does not claim to remove every kind of device credential from browser storage.

The private update adds administrator authenticator enrollment under Settings > Security. It requires the current password, confirmation of a valid six-digit authenticator code, and provides one-use recovery codes. MFA is not silently enabled. It is enforced at subsequent sign-ins once enrollment is confirmed. Authenticator secrets are encrypted; recovery codes are hashed. Challenge expiry, replay prevention, persistent account lockouts, session revocation and Origin checks are tested. The MFA encryption key is generated on the backend PC and must be kept with protected configuration backups.

## Verification

- `node --test tests/*.test.cjs tests/*.test.mjs`: 20 static/security/contrast/catalogue checks pass.
- Local Chromium fixtures enforce the real CSP and verify login/register/password controls, Remove quantities/removal, Move selection and quantity changes (including quote-containing location names), and blocking injected inline scripts/event handlers/unapproved remote scripts.
- A real browser cookie fixture verifies HttpOnly/Secure-cookie retention, migration confirmation, marker removal from Authorization headers, direct API cookie use, revocation/logout and old-backend compatibility.
- Settings mobile checks cover dropdowns, theme/password controls, admin visibility, keyboard access and Help navigation.
- Private backend tests cover RFC 6238 TOTP behavior, cookies, replay/expiry/recovery codes, lockouts, admin authorization/CSRF, spreadsheet import/export and synthetic PDF rasterization.
- Existing backend fixture suites check cross-account/store restrictions, roles, till/PIN scope, offline tamper checks, deletion/export isolation, billing idempotency and receipt-email scope. Only synthetic data and mocked payments/email services are used.

The supplied backend lockfile's production audit fell from 14 findings (1 critical, 10 high, 3 moderate) to zero known findings. This is a dependency-database result, not proof of absence of unknown vulnerabilities. Keep audits current. A targeted ExcelJS UUID override is covered by a spreadsheet read/write check.

The separate PC toolkit can check local firewall/listening ports and unauthenticated routes, and can create a database/upload backup, restore the database into its own newly generated test database and compare snapshot table row counts. Running that restore check on the actual backend PC is still required. No claim is made that production backups, router forwarding, Cloudflare account rules or a complete live penetration test have been verified by these local fixtures.

## Maintaining the pages

Use external scripts and `addEventListener` for new controls. Do not reintroduce `onclick="…"`, executable inline `<script>` blocks, eval or user-derived JavaScript. Existing compiled legacy actions are compatibility code; new features should use direct event listeners and data attributes. Keep CSP changes below Cloudflare Pages' line limits. Test both browser policy enforcement and controls affected by the change. Retain the explicit offline app-shell dependencies; do not cache authenticated API responses.

## Cloudflare JavaScript Detection compatibility

Cloudflare's automatic bot-check script is injected after the static app is served.
`functions/_middleware.js` supplies a fresh 128-bit CSP nonce on each HTML response;
Cloudflare reads that response header and applies the nonce to its injected scripts.
The middleware does not add nonce attributes to arbitrary app HTML or user content.
Inline event handlers and scripts without the matching nonce remain blocked.

Nonce-bearing HTML uses `private, no-store` and has no validators, preventing shared
HTTP caches from mixing an old body with a new nonce. Explicit Retail PWA shell
caches retain their matching body and CSP. The API and offline sales queues are
unchanged. `_headers` remains the strict static fallback. `_routes.json` excludes
scripts, styles, images, fonts, manifests and installers from Functions invocations;
HTML page requests use the existing Cloudflare Pages Functions allowance.

Validation: `node --test tests/cloudflare-csp.test.cjs` and
`node tests/cloudflare-csp.browser.cjs` (Playwright runtime and a Chromium executable
via `RETAIL_CHROMIUM_EXECUTABLE`). The browser test uses a local simulation of
Cloudflare's nonce-bearing hidden-frame bootstrap and makes no real bot-check,
account, email, payment or stock requests.

Reference: https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/#if-you-have-a-content-security-policy-csp
