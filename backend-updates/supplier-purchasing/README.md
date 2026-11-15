# Supplier purchasing review package

Open **Supplier documents** in Reordering to turn priced, pending reorders from one inventory into a purchase order. Members can create drafts. Workspace owners and admins can approve, issue, or cancel drafts and approved orders. Issuing records a workspace-scoped purchase order number. The issued document can be printed or saved to PDF through the browser.

Receive stock in the existing **Ordered** tab. Each received reorder line updates the purchase order's progress. Part of the quantity within a single reorder line is outside this package. An issued order retains its numbered document and line snapshot.

Owners and admins can record supplier invoice numbers, totals and due dates against issued orders. They can record amounts already paid, including partial payments. The view displays outstanding and overdue balances in GBP. Existing Reordering continues to create stock expenses when goods are received. Supplier invoice records do not post expenses, move money or alter stock.

## Staging sequence

Use an isolated backend and database. The current reorder route from the supplied review ZIP matched the checked-in checksum. The package contains only the new migration and module. Generate the route change from a copy of the target backend.

```sh
node backend-updates/supplier-purchasing/prepare-reorder.cjs /path/to/staging/backend > /tmp/reorder-with-purchasing.js
node --check /tmp/reorder-with-purchasing.js
```

1. Apply `files/sql/supplier-purchasing.sql` with `ON_ERROR_STOP` against a schema that already has the Reordering tables. It is additive and needs no backfill. Verify appropriate permissions for the staging service role if a separate migration role owns the tables.
2. In the staging copy, add `files/utils/supplierPurchasing.js` as `utils/supplierPurchasing.js` and integrate the generated `routes/reorder.js` after the checksum and syntax checks pass. Keep the prior route for rollback and restart the staging backend.
3. Pair this with the draft frontend. Test with a fictional shop, several priced reorders and owner, member and viewer sessions. Approve and issue a document, print it, receive one reorder through the existing Ordered tab, and confirm the progress and expense. Record a supplier invoice, two partial payments and an accidental retry. Confirm a separate workspace cannot read the purchase order.
4. Repeat document issue and partial payment attempts from simultaneous connections in staging PostgreSQL. For rollback, revert frontend and routes and preserve the new tables if purchase or payment history exists.

The local PostgreSQL WASM integration test exercises these operations against the supplied schema with fictional records and a single connection. Run it with `INVENTORYOS_REVIEW_SCHEMA_LOADER` set to an absolute path to a local CommonJS fixture exposing `loadCurrentSchema()` with a `query`, `exec` and `close` API. The command is `node --test backend-updates/supplier-purchasing/tests/*.test.cjs`. The complete schema and prior backend source belong on the owner’s server and are unnecessary in this repository. Production use needs a separate approval and a staging test.
