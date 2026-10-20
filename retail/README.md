# InventoryOS Retail

Retail is an optional, separate shop area at `/retail/index.html`. Enable it in the existing Settings page after installing the matching backend update. It uses the existing account, theme, workspace and inventory selector; it does not replace reseller or manufacturing screens.

The backend source and installer are in `backend-updates/retail/`. Run the installer from the Windows backend directory, then `node .\check-retail.cjs` and restart the existing backend task. See the package’s `START-HERE.txt`. Do not deploy this folder as a second server or replace the existing backend wholesale.

## Behaviour

- Retail stock has its own product records and ledger. Existing stock is not copied or deducted. Enter actual opening quantities and avoid recording the same physical units in two areas.
- Fixed GBP prices, unit costs, minimum quantities and reorder targets.
- Cash checkout is atomic with stock/cash movements; negative stock creates a physical-count request. Counts reject stale stock versions.
- One open till per inventory. Cash lift means money out; change handout means money into that drawer. Balances retain variances and establish the next counted baseline.
- Full cash refunds retain the original sale and optionally restore saleable returned stock. Browser receipts are available.
- Expected/incoming deliveries support partial receipt. Reorder quantities subtract outstanding deliveries. Recording an order does not send it to a supplier or make a payment.
- The dashboard shows expected/incoming deliveries, due/upcoming tasks, counts, cash controls and seven-day net sales.
- Daily in-app reorder snapshots default to 17:00 Europe/London. The backend worker must be running. Missed days are not reconstructed and no report email is sent by this module.

Card/contactless terminal payments, drawer hardware, offline trading, VAT calculation and external POS synchronisation are not connected. The checkout accepts cash only. Do not mark card payments as automatically processed.

## Access and requests

All `/retail` routes require the existing auth/workspace middleware. The service independently checks membership, owner billing access and the exact requested inventory. Reads are scoped to workspace and inventory. Viewers cannot write. Product settings, order creation, cash management and refunds require owner/admin access. Existing selected-plan access and product limits apply; enabling the mode does not change billing.

Every mutation requires a UUID `request_id`. Transactions serialize per workspace and persist the request hash/result. Reusing an ID with different details is rejected. The frontend retains an uncertain action across reloads and offers a safe retry using its original payload/ID. It never creates a fresh checkout ID automatically after an uncertain result.

Main endpoints: `GET /status`, `PATCH /settings`, `GET /overview`, `POST /products`, `PATCH /products/:id`, `POST /stock-in`, `POST /counts`, `POST /counts/:id`, `POST /till/open`, `POST /till/movement`, `POST /till/balance`, `POST /checkout`, `POST /sales/:id/refund`, `POST /deliveries`, `PATCH /deliveries/:id`, `POST /deliveries/:id/receive`, `POST /tasks`, `PATCH /tasks/:id`. All are prefixed `/retail`.

Product display supports 5,000 products per inventory. Baskets/orders support 100 different products. Recent history screens show 100 sales/cash events, 200 deliveries, 500 counts/tasks and 31 reports; older records remain in PostgreSQL.

## Validation

The included database regression suite uses PGlite (embedded PostgreSQL) and exercises schema installation, workspace/inventory isolation, roles, retries, negative stock/counts, cash variance baselines, partial deliveries, refunds, plan checks and report scheduling/DST. With `@electric-sql/pglite` installed in a separate test dependency directory, set `RETAIL_TEST_MODULES` to that `node_modules` directory and run `node backend-updates/retail/tests/retail.test.cjs`.

The implementation was also checked in Chromium with fixture data at desktop/mobile widths, including all views, forms, theme state, change calculation and a persisted checkout retry after an uncertain response. Installer tests used the supplied backend server and checked its two-line patch, repeat installation, conflict refusal, preservation of `.env`/admin source and guarded restore. This does not replace a smoke test against the owner’s live PostgreSQL/backend or connected printer hardware.
