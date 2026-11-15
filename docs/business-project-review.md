# InventoryOS business workflow release review

Review the app changes and the marketing-site tools together. The release has one Ubuntu backend update. Install it on an isolated staging backend before testing the app branch. Review the staged result before approving the two production merges and the installation on VM 100.

## Scope

| Original items | Review build |
|---|---|
| 1–8 · Public tools | Barcode and SKU generators, purchase-order and packing-slip PDFs, and reorder-point, break-even, wholesale and EOQ calculators are in the companion [marketing draft](https://github.com/Djautocare/inventoryos-marketing-site/pull/5). |
| 9–10 · Supplier purchasing and payments | Numbered purchase orders and supplier invoice balances are live under **Reordering → Supplier documents**. The staged update can be applied alongside that release. |
| 11–12 · Warehouses and transfer orders | **Products & stock → Stock operations** uses existing inventories and locations. See balances and held stock, identify warehouses, and request, approve, dispatch and partially receive transfers with a history. Standard transfers use matching barcodes across the selected inventories in one workspace. Named Manufacturing batches remain in the Manufacturing stock workflow. |
| 13 · Backorders | Confirm an order to check its required stock, show shortages and hold available units when sending the confirmed order to packing. Packing or deleting its packing job releases the hold in the same database operation. |
| 14 · Courier tracking | Save a carrier, parcel reference and timeline on a workspace order. Supported carrier links and manual updates use the package’s delivery event migration. |
| 15 · Bundles | Configure components for a stock product. Orders retain the bundle price and packing uses a snapshot of the component quantities. This integration covers workspace orders and Dispatch Centre. |
| 16 · Serials | Register and retire numbered units, record the stock position and review the history. Unscanned decreases mark the affected serials for reconciliation. The till and other legacy stock screens do not identify serials automatically. |
| 17 · Batch, lot and expiry | Receive a batch into an existing stock position, display its expiry and review the Manufacturing ledger. The stock engine retains its existing batch-pick and expiry rules. |
| 18 · Price lists | Add prices by product and apply a list when making a workspace order. Saved unit prices remain on the order. Retail Till still uses its existing price engine. |
| 19 · Sales order management | Create quotes with an expiry, confirm them, check shortages, cancel unshipped orders and split an order across parcels. Completed orders support a return record linked to the original workflow. The return record itself does not move stock or money. |
| 20 · Marketplace sales | Preview a standard CSV, match barcodes within the selected inventories and create draft orders. Export the loaded orders. Direct marketplace API sync and automatic carrier tracking are pending provider access and verification. |
| 21 · Customer invoicing | Print an A4 invoice from a packing queue item or **Let’s Pack**. Reuse the saved invoice number, item charges and supply details. Capture billing details, optional delivery, VAT, paid amounts, due dates and parcel-specific credit notes where applicable. Existing Retail and Mi Marché invoice entry points keep their original document numbers. Parcel finance records record transactions made elsewhere. |

The parcel invoice includes unique numbering, seller and buyer information, issue and supply dates, quantities, unit prices, line totals and applicable VAT. The printer output is a customer copy for the parcel. [Invoice fields](https://www.gov.uk/invoicing-and-taking-payment-from-customers/invoices-what-they-must-include) · [VAT invoices and credit notes](https://www.gov.uk/guidance/vat-guide-notice-700)

## Verification

Run the app test suite and the backend ZIP source checks. On staging, verify A4 output and multi-connection contention in PostgreSQL. Exercise an existing Retail and Mi Marché invoice, a parcel invoice with VAT, a partial supplier payment, a short-stock order split and two competing attempts to allocate or transfer the same units. Test the marketing tools and navigation on mobile and desktop before approving publication.
