# InventoryOS development review

The marketing and app changes are companion draft changes for one review. Release operations and migration on the live PostgreSQL instance require separate approval. The courier and supplier purchasing packages were checked against a source-only copy of the current backend and a clean restore of its schema.

## Scope and status

| # | Feature | Status | Current state and next dependency |
|---|---|---|---|
| 1 | Barcode Generator | Implemented and tested | Browser-based Code 128, three physical sizes, SVG download and print. |
| 2 | SKU Generator | Implemented and tested | Batch generation and CSV download. Uniqueness is scoped to the generated list. |
| 3 | Purchase Order Generator | Implemented and tested | Supplier details, optional logo, line totals, optional tax, and A4 PDF. Form values stay in the browser. |
| 4 | Packing Slip Generator | Implemented and tested | Ship-to details, items, SKU and quantities, plus A4 PDF and printing. |
| 5 | Reorder Point Calculator | Implemented and tested | Daily demand, lead time and safety stock, rounded up. |
| 6 | Break-Even Calculator | Implemented and tested | Whole-unit quantities, contribution and revenue. |
| 7 | Wholesale Price Calculator | Implemented and tested | Margin and markup modes with optional VAT and penny rounding. |
| 8 | EOQ Calculator | Implemented and tested | Whole-unit optimum and estimated ordering and holding costs. |
| 9 | Advanced Purchase Orders | Reordering flow implemented and tested in isolation | Create a draft from priced reorders, approve and issue a numbered document, and use browser print or Save PDF. Receipt progress follows existing reorder lines. Partial quantities within a line and a shared flow with Retail purchasing remain pending. |
| 10 | Supplier Payment Tracking | Manual recording implemented and tested in isolation | Owners and admins can record supplier invoice totals, due dates and partial payments against issued purchase orders. The balance shows paid, outstanding and overdue amounts. Payments happen outside InventoryOS. |
| 11 | Advanced Multi-Warehouse Management | Not started | Use existing inventory and location links. Confirm canonical location IDs, workspace permissions, and physical stock semantics before adding balances or restrictions. |
| 12 | Stock Transfer Orders | Not started | Build on existing move operations after verifying locking, mixed inventories, idempotency and partial receipt in the deployed stock service. |
| 13 | Backorder Management | Not started | Depends on a common allocation service that checks sales, packing, holds, receipts and warehouse movements. |
| 14 | Courier Delivery Tracking | Manual flow implemented. Route and migration verified against the review ZIP. | One reference per workspace order, official carrier pages, and manually entered statuses with a timestamped history. Real-carrier automatic updates remain unconfigured. |
| 15 | Composite Products and Bundles | Existing pick bundles audited. Upgrade not started. | A pick list is distinct from a product composition. Validate all sale and return deduction paths before implementing composite SKU transactions. |
| 16 | Serial Number Tracking | Not started | Requires a single item-level lifecycle across receiving, moves, sales and returns, with active serial uniqueness. |
| 17 | Batch, Lot and Expiry Tracking | Existing manufacturing traceability audited. Extension not started. | Extend the existing lots and recall flow after verifying Retail and Reseller stock integration. Avoid parallel traceability tables. |
| 18 | Custom Price Lists | Not started | Resolve prices through current order and till services and keep price and tax snapshots on historical sales. |
| 19 | Advanced Sales Order Management | Existing draft and dispatch flow audited. Upgrade not started. | Preserve workspace orders, Retail and Dispatch rather than making a second order store. Quotes, allocations, partial fulfilment, cancellation and returns still need integration. |
| 20 | Marketplace Sales Integrations | CSV fallback implemented and tested against draft-order contract. Direct integrations unconfigured. | Preview a standard CSV, match item barcodes to selected inventories, and confirm drafts in the existing Orders flow. Export the orders currently returned to the screen. Requires authorised seller credentials and approved APIs for any direct sync. |
| 21 | Advanced Invoicing | Existing invoice flow audited. Upgrade not started. | Preserve issued invoice documents and numbering. Payment terms, receivables, partial payment and credit notes need the current Retail and Mi Marché invoice and payment source. |

## Existing integration points

- `workspace/app.js` renders the current Orders view. Marketplace CSV calls the existing `POST /workspace-orders` draft endpoint after local validation and explicit confirmation. Request IDs stay stable for the same order and lines. The existing database uniqueness and scope controls remain authoritative. Imports save one order at a time and can be retried after a partial result. They create no allocations or stock movements.
- Dispatch links workspace orders to its packing job. Courier tracking adds a separate manual event history for that same order. It does not update packing status, inform marketplaces, call a carrier API or deduct stock.
- Reordering remains responsible for receiving stock and recording stock expenses. The supplier purchasing package in `backend-updates/supplier-purchasing` adds document approval, numbering and a separate payment record tied to an existing reorder. Retail purchasing, warehouse operations and related workflow extensions still need integration work.
- The packages include additive transactional migrations and expected base-route hashes. Verify the target route hashes on staging before integration.

## Costs and tests

All the implemented workflows use the existing app stack. The standalone generators and calculators require no account, external API, payment service or database. The barcode tool reuses the existing MIT-licensed JsBarcode distribution. Courier tracking links to the carriers' sites without offering an API integration. Marketplace access is optional and no paid dependency or account was added.

The Node.js 24 app suite covers CSV validation, delivery history and approvals. Both new migrations ran twice against an isolated PostgreSQL WASM restore of the supplied 171-table schema. Purchasing tests covered scoped reads, roles, stale reorder costs, retries, receipt progress, overdue balances, payment reconciliation and overpayments. Delivery tests covered manual confirmation, version conflicts and workspace isolation. Multi-connection PostgreSQL staging and real printer verification are pending.
