# InventoryOS platform delivery

Baseline: frontend commit ea9464d9f663e7f3c09c9d86bb57183a53999e2e and its checked-in Retail backend package. This is a source review and staging plan, not a certification of what is installed on the live backend.

## 1. Retail and shared stock

The reviewed Retail package already has a scoped catalogue, stock movements, till floats and reconciliation, external card confirmation, refunds, VAT receipt snapshots, reporting and replay protection. The workspace guard explicitly keeps Retail separate from reseller/manufacturing workspaces. Reuse the checkout and drawer logic, preserve existing tills, and add a shared stock service behind authorised module adapters. Do not make other modules bypass the Retail workspace guard.

The first patch records old and new selling price and unit cost on a product edit, case receipt, delivery receipt or accepted supplier price review. It writes inside the existing stock or product transaction. Product History exposes the most recent 200 price/cost changes to the selected store's owner and admins. Historical costs are not inferred or rewritten. Existing stock events remain the stock movement record. The new entries use the existing audit table and its current export/deletion lifecycle; independently retained, tamper-evident financial audit is separate work.

Next release gate: verify the current installed backend's schema, manufacturing completion, reseller stock, dispatch and checkout write paths against a disposable database. Implement and test these rules before enabling shared stock:

- Products and ownership are mapped explicitly. A shared sellable pool tracks location balances and reservations; it does not absorb manufacturing materials or erase branch ownership. Independent stock remains the default.
- An owner previews each additive link with quantities by product and location, identifies overlaps and confirms the sum using a short-lived versioned preview. If stock or mappings change, require a fresh preview. Import each source balance once under an idempotency key; atomically switch writes to the shared service. Fail if the ownership boundary is unclear or the source pool is already included.
- Each movement carries a unique source action, scoped location, actor, quantity and reference. Corrections use compensating movements. Manufacturing releases committed finished goods once per production completion; it retains its material consumption, batch and cost records.
- Retail checkout and marketplace reservation lock the same location balance before committing. Neither may consume the last sellable unit twice. Reserve, finalise, release and refund/restock are distinct transitions with retry protection. Existing offline Retail checkout needs a dedicated reserved allocation or an online-only policy for linked sellable stock.
- Dispatch consumes paid branch fulfilment records and references the sale; printing or dispatching must not deduct stock a second time. Test concurrent checkout, retries, pending reservations, stale link previews, returns, rollback, offline sync and all legacy independent paths.

## 2. Mi Marché

Build seller storefronts and branch-aware drafts off the stock adapter. Import identifiers, descriptions and prices idempotently, and give staff a mobile photo queue. Publish only listings with approved content and seller payment/fulfilment setup. Branches control collection and shipping; one buyer basket becomes separately fulfilable branch orders. A failed checkout releases its reservations. A paid order keeps a snapshot of price, shipping, fee, tax and item details.

Model 0.5% direct storefront and possible 2% discovery fees as proposals. In-person sales are outside marketplace fees. Decide who takes payment, bears fees/refunds/disputes and receives funds before selecting the Connect configuration; test reconciliation and refund allocation in a sandbox before any live charges. Branches within one seller and baskets spanning different legal sellers are separate scenarios.

Keep flagged listings unpublished pending review. Use contextual text/image rules, seller explanations and an operator review trail. A sold one-off listing stays visible for seven days, then archives. An idempotent cleanup job removes only unreferenced images when no hold applies. Orders, settlement records and audit evidence use separate retention controls.

## 3. Accounts and compliance

Keep selling price, actual acquisition/production cost and valuation adjustments distinct. Persist sale/refund, VAT and cost snapshots. Build period-end stock reconstruction from dated movements plus a known opening position, with separate recorded/effective dates and explicit later corrections. Choose and validate the valuation method and period rules with an accountant before offering tax reporting. Start with sales, cash, expenses, stock valuation, VAT and audit exports; reconcile all totals to the underlying records before producing the tax-year pack.

Before calling the audit trail tamper-evident, test independent signed or anchored exports and restricted append-only writes with separate operational and privileged roles. Reconcile deletion, retention, anonymisation and legal holds first. Add the admin compliance view only after scoped authorisation, fresh 2FA, purpose entry, expiry, access logging and a reviewed request process are in place. Start with accountant exports; build direct filing as a separate, validated integration.

## Release order

Deploy the Retail history slice only after staging with the current backend. Next: shared stock adapter and finished-goods release; then seller drafts/photos, multi-branch checkout, payments and fulfilment. Build accounting exports against the same records, then add restricted compliance access and filing integrations. Each release must pass existing tests plus its own failure, retry and access tests before production.
