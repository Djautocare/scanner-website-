# InventoryOS business workflow release review

Review the app changes and the marketing-site tools together. The release has one Ubuntu backend update. Install it on an isolated staging backend before testing the app branch. Review the staged result before approving the two production merges and the installation on VM 100.

## Scope

| Original items | Review build |
|---|---|
| 1–8 · Public tools | Barcode and SKU generators, purchase-order and packing-slip PDFs, and reorder-point, break-even, wholesale and EOQ calculators are in the companion [marketing draft](https://github.com/Djautocare/inventoryos-marketing-site/pull/5). |
| 9–10 · Supplier purchasing and payments | Numbered purchase orders and supplier invoice balances are live under **Reordering → Supplier documents**. The staged update can be applied alongside that release. |
| 11–12 · Warehouses and transfer orders | **Products & stock → Stock operations** uses existing inventories and locations. See balances and held stock, identify warehouses, and request, approve, dispatch and partially receive transfers with a history. Standard transfers use matching barcodes across the selected inventories in one workspace. Named Manufacturing batches remain in the Manufacturing stock workflow. |
| 13 · Backorders | Confirm an order to check its required stock, show shortages and hold available units when sending the confirmed order to packing. Packing or deleting its packing job releases the hold in the same database operation. |
| 14 · Courier tracking | Save a carrier and tracking number on a workspace order. InPost can receive signed updates and Royal Mail can check saved parcel numbers automatically. The existing tracking history also supports manual updates and carrier links. |
| 15 · Bundles | Configure components for a stock product. Orders retain the bundle price and packing uses a snapshot of the component quantities. This integration covers workspace orders and Dispatch Centre. |
| 16 · Serials | Add Stock registers entered serials. Move Stock and warehouse transfers preserve selected serials and their history, while sales, Dispatch, refunds, discard and corrections record the affected units. Older or automated writes without a serial context remain reviewable through reconciliation. |
| 17 · Batch, lot and expiry | Receive a batch into an existing stock position, display its expiry and review the Manufacturing ledger. The stock engine retains its existing batch-pick and expiry rules. |
| 18 · Price lists | Apply a price list to a workspace order, or choose a store-level list for walk-in sales on the dedicated Retail Till app. The till refreshes before payment and checkout validates the current prices. Issued receipts retain their prices. Existing linked preorders, bookings and signed offline quotes retain their recorded prices. |
| 19 · Sales order management | Create quotes with an expiry, confirm them, check shortages, cancel unshipped orders and split an order across parcels. Completed orders support a return record linked to the original workflow. The return record itself does not move stock or money. |
| 20 · Marketplace sales | The workspace owner can connect eBay and allowlisted Vinted Pro accounts for recurring read-only imports. Exact SKU matches become draft orders. Other lines can be matched from the review queue. CSV import/export remains available. |
| 21 · Customer invoicing | Print an A4 invoice from a packing queue item or **Let’s Pack**. Reuse the saved invoice number, item charges and supply details. Capture billing details, optional delivery, VAT, paid amounts, due dates and parcel-specific credit notes where applicable. Existing Retail and Mi Marché invoice entry points keep their original document numbers. Parcel finance records record transactions made elsewhere. |

The parcel invoice includes unique numbering, seller and buyer information, issue and supply dates, quantities, unit prices, line totals and applicable VAT. The printer output is a customer copy for the parcel. [Invoice fields](https://www.gov.uk/invoicing-and-taking-payment-from-customers/invoices-what-they-must-include) · [VAT invoices and credit notes](https://www.gov.uk/guidance/vat-guide-notice-700)

## Verification

The Ubuntu installer checks the pre-release source hashes and applies the complete migration, including the earlier business workflow work. The integrations run against test responses until you configure and authorise provider accounts. Evri and DPD retain manual tracking. Run the app test suite and the backend ZIP source checks. On staging, verify A4 output and multi-connection contention in PostgreSQL. Exercise an existing Retail and Mi Marché invoice, a parcel invoice with VAT, a partial supplier payment, a short-stock order split and two competing attempts to allocate or transfer the same units. Test the marketing tools and navigation on mobile and desktop before approving publication.
