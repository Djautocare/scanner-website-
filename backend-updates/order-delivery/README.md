# Workspace order delivery review package

Courier tracking extends the current workspace Orders workflow. A user records a parcel reference and checks updates on an official carrier site. The app stores manual updates with timestamps and an audit actor. The first version supports one tracking reference per order. An explicit courier verification is required for a delivered status. No carrier calls happen in the background. Stock and dispatch state do not change.

## Compatibility and staging

The route replacement was developed against the Combined Backend Update snapshot. The route in the supplied backend review ZIP matched that snapshot. The migration, permissions and event history passed against an isolated restore of the supplied schema with fictional records. Check the target `routes/workspaceOrdersRoutes.js` against `expected-route.sha256`. If it differs, merge the two route declarations into the target route without replacing other current handlers. Confirm that the existing `utils/workspaceOrders` exposes `service().schema()`, the authenticated workspace middleware populates `req.workspace`, and the order table already exists.

In an isolated database restored from a synthetic or scrubbed fixture, apply `files/sql/workspace-order-delivery.sql` after the workspace-orders migration. Add `files/utils/orderDelivery.js` and integrate `files/routes/workspaceOrdersRoutes.js`. Confirm that GET and POST both work for a current workspace order, a viewer cannot submit POST, a second workspace cannot read either route, and legacy orders and Dispatch Centre remain usable. Check simultaneous updates in a real PostgreSQL staging instance. The SQL runs in one transaction and only adds an event table. Existing orders require no backfill.

Rollback the routes and utility first if staging validation fails. Keep the event table to preserve recorded history. Apply to production only following review of the live source, a staging pass and separate owner approval.
