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

Card/contactless terminal payments, drawer hardware, offline trading, VAT returns and external POS synchronisation are not connected. The checkout accepts cash only. Do not mark card payments as automatically processed.

## Access and requests

All `/retail` routes require the existing auth/workspace middleware. The service independently checks membership, owner billing access and the exact requested inventory. Reads are scoped to workspace and inventory. Viewers cannot write. Product settings, order creation, cash management and refunds require owner/admin access. Existing selected-plan access and product limits apply; enabling the mode does not change billing.

Every mutation requires a UUID `request_id`. Transactions serialize per workspace and persist the request hash/result. Reusing an ID with different details is rejected. The frontend retains an uncertain action across reloads and offers a safe retry using its original payload/ID. It never creates a fresh checkout ID automatically after an uncertain result.

Main endpoints: `GET /status`, `PATCH /settings`, `GET /overview`, `POST /products`, `PATCH /products/:id`, `POST /stock-in`, `POST /counts`, `POST /counts/:id`, `POST /till/open`, `POST /till/movement`, `POST /till/balance`, `POST /checkout`, `POST /sales/:id/refund`, `POST /deliveries`, `PATCH /deliveries/:id`, `POST /deliveries/:id/receive`, `POST /tasks`, `PATCH /tasks/:id`. All are prefixed `/retail`.

Product display supports 5,000 products per inventory. Baskets/orders support 100 different products. Recent history screens show 100 sales/cash events, 200 deliveries, 500 counts/tasks and 31 reports; older records remain in PostgreSQL.

## Validation

The included database regression suite uses PGlite (embedded PostgreSQL) and exercises schema installation, workspace/inventory isolation, roles, retries, negative stock/counts, cash variance baselines, partial deliveries, refunds, plan checks and report scheduling/DST. With `@electric-sql/pglite` installed in a separate test dependency directory, set `RETAIL_TEST_MODULES` to that `node_modules` directory and run `node backend-updates/retail/tests/retail.test.cjs`.

The implementation was also checked in Chromium with fixture data at desktop/mobile widths, including all views, forms, theme state, change calculation and a persisted checkout retry after an uncertain response. Installer tests used the supplied backend server and checked its two-line patch, repeat installation, conflict refusal, preservation of `.env`/admin source and guarded restore. This does not replace a smoke test against the owner’s live PostgreSQL/backend or connected printer hardware.

## Receipt details, VAT and phone setup (v2)

Retail settings now store the receipt business name/address, optional VAT registration number and an off-by-default VAT receipt toggle. Prices are VAT-inclusive. VAT is extracted per line using integer pence, with nearest-penny/half-up rounding, and grouped into 20%, 5%, zero-rated, exempt and outside-scope rows. Existing products have no assumed VAT treatment; review them before VAT-enabled checkout. This module produces a sales receipt with a VAT breakdown, not full VAT invoices/credit notes or VAT returns. Special schemes are not implemented.

Sales preserve seller details in `receipt_business` and the immutable tax snapshot in `vat_receipt`. Existing receipts remain unchanged. The server rejects stale VAT settings/product tax details before recording a sale. Settings and product changes are owner/admin-only. The shared mode toggle preserves receipt configuration.

Products & stock > Scan to add product opens the phone camera. Native barcode detection is preferred; a self-hosted, pinned ZXing decoder is the fallback. Two matching checksum-valid scans are required. Exact EAN/UPC/GTIN lookup shows the Open Food Facts name/pack match for explicit acceptance; price, quantity, cost and tax treatment remain shop-specific. Save and scan next repeats the setup flow. Manual entry and duplicate-barcode checks remain available. Camera tracks are stopped on match, close, page hide and timeout, including delayed permission responses.

`GET /retail/catalogue/:barcode` validates GTIN/check digit and checks owner/admin workspace/inventory access. It contacts only the fixed Open Food Facts HTTPS host using a custom app User-Agent, with timeout/body-size limits and no redirects. Only the GTIN and public app identity leave the backend. Camera frames and account/stock/price data do not. Public lookup responses use a bounded in-memory cache, single-flight requests and per-actor/global throttles. No shared customer product database or upstream contributions are created.

Saved lookup products retain their source code/attribution. Open Food Facts data uses ODbL with attribution/share-alike conditions. The UI links to the source/licence; review the licence before redistribution or combining data into a shared catalogue. Do not use this lookup to infer VAT or prices. Camera quality and device permissions still need a real-phone smoke test.

References: [HMRC VAT Notice 700](https://www.gov.uk/guidance/vat-guide-notice-700), [Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/), and the local scanner licences in `retail/vendor/`. The scanner bundle is @zxing/browser 0.1.5, unmodified, SHA-256 `b5ad3df920738ca7adcb74508d7e6b6a5b9024993fb9a0c702da1ad8964eca07`; MIT browser layer plus Apache-2.0 ZXing core licences are retained.

Run `vat-catalogue.test.cjs` alongside the base regression suite using the same `RETAIL_TEST_MODULES` test dependency path. It tests upgrading populated v1 tables, VAT-off sales, shop-name preservation, mixed VAT rates/rounding, stale baskets, refunds, exact-barcode lookup, cache, limits, malformed/oversized responses, and provider errors without contacting the live provider. Browser tests also exercised scan/accept/save-next with simulated camera output and real EAN image decoding through the fallback.
