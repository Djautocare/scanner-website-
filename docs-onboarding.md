# Guided practice for first-time Free selections

A first successful Free selection starts `/getting-started.html`. It guides the user through a separate, interactive practice workspace with spotlight popups. Existing selected plans and paid checkout flows do not auto-start the tutorial. A real downgrade retains its confirmation; a first-time Free selection no longer uses the confusing “switch/downgrade” confirmation. Plan actions are protected against duplicate clicks while the request/navigation is pending.

## Required basics

Create a location → add stock → search/select stock → set quantity → consolidate → confirm removal → check the dashboard → find Settings → Inventory Guide. The user can then continue with Free or explore optional examples.

## Optional examples

- Pro/Business email label import: press **Send test email**, follow a simulated email receipt/cropping sequence, review three illustrative labels and try the mobile-print preview. This does not send a real email, process a real attachment or contact a printer.
- Starter expenses and a sample receipt.
- Starter barcode print jobs, with an illustrative barcode preview.
- Pro reordering, ordered/received stages and assignment from holding.
- Business shared-workspace role settings without invitations.

Manufacturing and Retail are excluded. Plan labels distinguish the paid workflows. The completion screen links to existing plan comparison and an email request for a manually activated Business week; neither purchases nor activates a subscription.

## Isolation and progress

`js/practice-model.mjs` holds the example stock and other demo records in memory. The page imports no live InventoryAPI, QZ Tray or account theme-saving code, makes no API requests and uploads no files. It never creates an actual stock movement, expense, order, receipt, invitation, email, print operation or billing change. It does not erase or reset existing real account data.

Only `{version,status,step,coreComplete,explored}` is saved under an account-scoped local-browser key: `inventoryos_getting_started_v1:<encoded user id>`. No practice names, quantities, location notes or receipt contents are saved. Refresh resumes at the tutorial step using fresh generic examples. Closing or completing the page discards the in-memory records. A back-forward-cache restore reloads the page instead of retaining old practice data.

This is a browser-local onboarding preference, not a server-side access control. Clearing browser data removes progress; progress is not shared between devices. Backend plan enforcement remains authoritative. No backend or database update is required. For server-wide completion and conversion analytics in future, add an authenticated account-level onboarding record rather than using the local flag as an entitlement check.

A small external gate on the root application pages redirects an enrolled, unfinished account back to practice before ordinary stock pages. Login, billing and Settings/Help remain reachable. Retail, tills and manufacturing applications are not gated. Other accounts have separate progress. Completion opens the real dashboard on its existing Free plan.

Users can replay at Settings → Inventory Guide → **Try guided practice again**, or `/getting-started.html?replay=1`. Replay does not reset a completed onboarding flag. An account with genuinely pending onboarding completes that pending flow even when the replay query is supplied.

## Validation

- `node --test tests/onboarding.test.mjs tests/browser-security.test.cjs tests/cloudflare-csp.test.cjs`
- `node tests/onboarding.browser.cjs` and `node tests/onboarding-billing.browser.cjs` with Playwright available under `CODEX_PRIMARY_RUNTIME_NODE_MODULES`; optionally set `RETAIL_CHROMIUM_EXECUTABLE` to a local Chromium executable.

The browser suite uses a local fixture, strict production CSP, separate test accounts and synthetic data. It completes the required flow and all five optional examples at desktop dark/green and mobile light/purple sizes, checks reload/replay and clean completion, preserves unrelated existing browser data, and asserts that no external or non-GET requests occur. An additional 320px/667px run covers small phones. The billing browser fixture verifies the actual first-Free selection, a real-plan downgrade confirmation and a failed selection, including duplicate-click prevention. No live accounts, messages, stock or subscriptions are created by testing.
