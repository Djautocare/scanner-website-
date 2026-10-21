# Retail subscriptions and Till app

The main InventoryOS account keeps its existing Free / Starter / Pro / Business
subscription. Retail is separately licensed per store (one Retail inventory).

- Retail Starter: £9.99/store/month, including two registered tills.
- Retail Pro: £19.99/store/month, including two registered tills and Pro tools.
- Additional till pairs: £4.99/month each.
- Enterprise: contact the owner for a custom arrangement; not self-serve billing.

Open `retail/manage.html` for store billing, till registration/pairing, separate
cash sessions and staff store/refund permissions. Open `retail/till/index.html`
on checkout devices. Pairing is one-use and ten minutes; re-pairing revokes the
old device without allocating another till position.

Staff QR/number identifies a person; their separate PIN authenticates them.
Till credentials are random, hashed server-side and rejected by normal website
JWT authentication. Staff tokens are store/till-bound and rechecked against
current assignments, PIN version, device generation and subscription. Cashier
API responses omit product costs and admin settings. Refunds require a fresh
QR/number plus matching PIN from a refund-authorised person at that store.

Loyalty is a Pro entitlement plus an enabled store tool. Scanning customer
`IO-LC-...` selects the account, while staff use `IO-ST-...`. Customer profiles
show balance/history and reprint the same QR. Sale completion links the customer
and clears the selection. Registration does not imply marketing consent.

Card payments use the retailer's existing standalone reader and explicit manual
confirmation. InventoryOS does not initiate or verify a card transaction or
refund. Card totals/refunds do not change expected cash. Cash-deposit bookings
settle through owner cash checkout; mixed cash-deposit/card settlement is not
supported. Database transactions serialize store mutations and persist request
IDs/results to recover lost responses without duplicating sales or stock moves.

The original admin router receives additional Retail controls after its existing
authentication/authorisation middleware. Retail plan, extra pairs and individual
feature overrides have optional expiry, explicit denial, reasons, version checks
and audit history. They do not modify Stripe charges or legacy plan overrides.

The two PWAs have different IDs/scopes/icons. Main app service worker never
caches signed-in screens/API data. Till service worker caches its public shell
only. The restricted staff Till requires connectivity. Legacy signed offline
cash queues remain supported and should be synced before installation.

Receipt/mobile printing uses the scrolling-dialog fix. Actual printer/scanner
compatibility must be tested on the user's devices. Names/preferences can be
recorded per till; the new Till does not install native drivers, open cash drawers
or add silent QZ printing. Existing InventoryOS QZ flows are retained.

Backend setup is in `backend-updates/retail/START-HERE.txt` and
`backend-updates/retail/STRIPE-SETUP.txt`. Initial existing Retail installations
receive a one-time seven-day transition grant; subsequent restarts never extend
it. New stores require a paid entitlement or explicit admin grant.
