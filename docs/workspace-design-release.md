# Workspace design release — 2 November 2026

The approved Reseller, Manufacturing and Retail design direction is applied to the existing application, including the isolated guided practice and Settings guide. No preview data/model is included in this release.

- Shared high-contrast surfaces, six existing accent choices, light/dark appearance, readable controls and responsive cards/forms.
- Grouped reseller navigation, stock workflow strips and consistent utility pages. Guide and Help links open the corresponding Settings tab.
- Manufacturing: Materials & packaging → Recipes → Plan materials → Finish & store, plus a live Start here page and existing traceability, equipment and timers.
- Retail: Start here, grouped Products/Ordering/Customers/Reports/Admin, Stores & billing, and the correct one-use till pairing instructions.
- Guided practice retains its original spotlight controls, step model, account-scoped progress and disposable example data. It shares the new screen palette and appearance control.
- Retail and Till workers cache the released presentation files and module versions. Queued offline sales, device pairing and staff sessions are retained. The Till offline navigation fallback explicitly uses its HTML entry.
- An existing Sales Tracker link on Refunds now points to the actual sales page.

The UI continues to use the existing authenticated, inventory/store-scoped APIs. Stock mutation, production completion, billing, role enforcement, till authentication, waste/refund processing, email sending, printing/signing and offline reconciliation remain with their existing modules. There is no database migration or backend installation for this release. Preview-only features are not substituted for live services.

## Validation

Run `node --test tests/workspace-design.test.cjs tests/onboarding.test.mjs tests/cloudflare-csp.test.cjs tests/browser-security.test.cjs tests/theme-contrast.test.cjs`.

The focused checks cover navigation destinations, all Manufacturing screens with empty inventory, viewer/off-mode restrictions, Retail setup, inactive-subscription navigation, restricted management links, Till offline HTML fallback, precache versions, tutorial isolation/enrolment, CSP and appearance preferences. Existing HTML IDs and compiled event attributes were compared with the previous main commit. Core stock, security, billing, till transaction, receipt and offline modules were compared byte-for-byte.

Managed browser automation was unavailable in this session. These are code and Node fixture checks, not a real-device or authenticated end-to-end guarantee. Scanner hardware, QZ/mobile printing and visual layout still need device checks. No real sale, stock removal, payment or email was generated to test this UI release.

## Deployment and rollback

The repository's existing Cloudflare Pages integration deploys the update to the application domain. Keep a current till session open until its transaction is finished; update/reopen the PWA when convenient. Do not clear site storage to refresh the design, as it can contain unsynced sales.

The previous main commit is `218b939165c85bd26975961c1003288836f099bb`. A normal revert of the workspace release commit restores its frontend while retaining current database records and browser-local offline queues.
