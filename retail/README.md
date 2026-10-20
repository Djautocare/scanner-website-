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

Card/contactless terminal payments, drawer hardware, VAT returns and external POS synchronisation are not connected. The checkout accepts cash only. Do not mark card payments as automatically processed.

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


## Focused till, USB scanners and offline cash (v3)

Checkout > Full-screen till provides a focused responsive layout with a small Exit to dashboard button. The Fullscreen API is optional; the layout remains usable without it. USB/Bluetooth keyboard-wedge scanners with Enter/Tab suffix are routed to product setup or checkout, including rapid scans when another field has focus. Product setup validates an EAN/UPC before requesting a match, preserves manual entry, and explains missing backend responses. Retail mobile fields use 16px text and a fixed viewport scale.

`GET /overview?offline_device_id=<UUID>` returns per-device signed checkout context and product quotes when a non-viewer has an open till. These use a purpose-derived HMAC key from the existing JWT_SECRET. Offline cash sales carry these signed financial snapshots, the original till ID and their original sale time. Current membership, role, plan and mode are checked again at upload. Prices/cost/tax/seller details are preserved from the approved snapshot; stock deltas are applied to current server stock. `created_at` records the sale time; `recorded_at` records ingestion. Historical daily reorder snapshots are not reconstructed for late uploads. Changing JWT_SECRET invalidates unsynced authorisations; reconcile devices before rotating it.

The service worker has scope `/retail/` and caches an explicit public app shell only. Account records live in IndexedDB partitioned by user/workspace/inventory. A read-write transaction saves each sale before receipt display. Web Locks serialize queue sync across tabs. Uncertain results retain identical request IDs/payloads. The snapshot stays frozen until all sent writes are acknowledged and a fresh server overview is obtained, preventing double application after a lost response. Original scoped headers are sent directly, independently of the currently patched topbar request wrapper. An acknowledged operation remains saved until its refreshed snapshot is persisted.

Preparation permits cash sales for 24 hours with a seven-day upload window. A new login, product editing, new name lookups, deliveries, counts, refunds, settings and till cash management require a connection. A closed/replaced till or revoked access blocks sync and keeps the sale visible; no automatic retargeting or deletion occurs. A JSON backup is available for reconciliation, not automatic re-import. Reopen Retail to sync if all tabs were closed. Do not clear site storage while sales are pending; persistent storage is requested but eviction remains browser-controlled. Service-worker updates do not take over an active till.

Run `offline.test.cjs` with the same test dependency path. It covers signed quotes, original financial/time snapshots, additive stock updates, replay after a lost confirmation, tampering, scope/device/actor/role/plan checks, expiry and closed-till conflicts. Browser integration also checks offline reload, queued receipt durability, reconnect after another device adds stock and two-tab queue sync. Physical scanner/printer/mobile-device smoke tests remain necessary.


## Business tools (v4)

Opt-in settings per Retail inventory provide General, Corner shop, Barber/salon and Bakery presets plus ten independent tools: services; appointments/walk-ins with requested reminders; staff/tips/commission; case conversions; offers/meal deals; preorders and cash deposits; loyalty QR cards; reductions/waste; gross contribution reports; and a same-browser second display. Existing inventories start with the tools off. Membership, role, workspace/inventory and current subscription checks remain server-side. Mutations use existing transaction/idempotency handling. Admin-only financial reports and configuration preserve the existing account security model.

Apply `backend-updates/retail` on the backend PC, run `check-retail.cjs`, then restart. `retail-business.sql` is additive and keeps historical receipt, VAT, cost, offer and deposit snapshots. Cash deposit liabilities and till movements are recorded separately from sales. Refunds reverse the original loyalty/commission effects. Reminders use the backend's existing Resend configuration with durable jobs, a short lease, bounded retries and an idempotency key.

Signed offline snapshots now include approved promotions and service metadata. Ordinary product/service cash sales can queue; linked bookings/preorders, deposits, tips, staff attribution and loyalty require online transactions. Prepare the device again after changing settings/prices/deals. Promotion maths is shared with the backend.

The customer display uses a random BroadcastChannel in the same browser/device. Only public basket/payment content crosses it. It is not a remote display service. Loyalty QR codes contain a random card token; the authenticated scoped API resolves a customer. Customer contact information is not put in the display or QR.

Manufacturing has its own `manufacturing/index.html` workspace, and the old root URL redirects with its hash/query preserved. Original APIs, Business entitlement and enablement checks remain. Retail production orders open the existing recipe calculator for planning; Manufacturing stock is not silently transferred into Retail.

### Universal public product lookup

The server requests Open Facts v3 `product_type=all`, allowing exact GTIN matches from Open Food Facts (including alcoholic drinks), Open Beauty Facts, Open Products Facts and Open Pet Food Facts. Redirects are restricted to those four HTTPS hosts and the same GTIN; response sizes, timeouts and rate limits are bounded. Only the barcode is sent; no account, stock, prices or camera images are uploaded. Source attribution is saved for the matched catalogue and links to its product page under ODbL. Public data is incomplete; manually saved shop barcodes remain usable. Lookup does not infer prices, VAT classifications or age eligibility.

### Verification

Backend suites in `backend-updates/retail/tests` cover prior-data migrations, cash/till balances, roles/isolation, VAT/refunds, signed offline sync/idempotency, all business workflows, promotion allocation and universal catalogue redirects. Tests require a disposable PGlite dependency via `RETAIL_TEST_MODULES`. Browser integration additionally exercised the real Retail backend, QR decoding, deposits/collection, second display, mobile overflow and all eight Manufacturing views/Business gate. No production customer data or real reminder emails were used.


## Counter and appearance tools (v5)

Retail navigation now groups Products, Customers, Reports and Admin. Stock-count due badges appear on Admin and Stock counts. Products and Services have separate creation/list screens. Product metadata adds category, favourite and optional minimum age; checkout records explicit age-check acknowledgements and a saved cashier snapshot.

Opt-in staff PIN login remains separate from InventoryOS account/workspace roles. Credentials use salted scrypt, sessions use random hashed bearer tokens scoped to account/workspace/inventory/device, PIN changes/deactivation revoke sessions, and repeated failures cause a persisted 15-minute lockout. PINs are never included in the normal pending-mutation queue or request-result store. Shared till devices should use a workspace member account. Staff login and assigned/attributed checkout require a connection; mandatory PIN mode disables issuing ordinary offline authorisation. Sync device queues before enabling it.

Server-side parked baskets can be recalled once and use current prices; parking does not touch stock or cash. Partial returns allocate the original discounted gross/net amounts cumulatively across units, avoiding penny drift, and record immutable return lines, stock/cash effects, loyalty reversal and commission adjustments. Exchanges run the return and replacement sale in one transaction with explicit return credit/new cash. Daily totals and gross-profit reports understand new returns as well as legacy full refunds. Older backends must not be used for financial reporting after recording v5 returns.

CSV imports have a transactional dry-run preview, bounded RFC-style parsing, version/digest validation and atomic confirmation. Matching barcodes update product details while preserving current stock; opening quantities apply only to newly created physical products. Export escapes formula-like cells. Services remain separate.

Shelf labels are generated locally as 2×1 or 4×6 inch PDF pages with current name/price and Code 128 bars, using the pinned MIT-licensed JsBarcode 3.11.6 asset. Download/mobile file share and browser PDF printing are available; real printer/phone compatibility still needs testing on the customer's hardware.

The shared theme engine independently stores light/dark appearance in this browser, synchronises open tabs, preserves the account accent, and adapts older fixed dark surfaces. Light uses darker accent shades for legibility. No authentication routes or site administrator restrictions were changed. The customer display and standalone Manufacturing workspace also load the shared appearance engine.
