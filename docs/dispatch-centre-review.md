# Dispatch Centre review — 3 November 2026

Prepared on `preview/dispatch-centre-cleanup` from frontend commit `19194f44a273203630df07bc4689556a9938986f`. Do not merge until the owner has reviewed the private preview.

- Compact live queue counts with separate Ready and Review totals.
- File import and email setup start collapsed. New email processing/error activity opens the email panel so progress remains visible.
- Packing is the main action. Refresh, pick-list printing, mobile queue printing and confirmed clearing live in More actions.
- The location view shows the pick list once; individual label editing is a disclosure. The label view keeps ready item editors collapsed and unmatched item editors open.
- Shipping label previews, printing and printer troubleshooting have their own disclosure. The duplicate clear-print-retries control is omitted.
- Existing crop, stock match, packing, completion, print formats and API routes remain in use. No backend update is required.
- Fixed the print-preview mobile share click handler receiving a MouseEvent instead of its button ID, made file import keyboard accessible, prevented file-input click recursion, ignored stale workspace queue loads, and kept empty imported labels editable.

Private preview uses fictional data and a local simulated API/QZ adapter. Those adapters must never be shipped to the real website. Stock, billing, real emails and hardware are not exercised by the preview. The live API, inbound email, QZ client and compiled security-handler modules remain byte-for-byte unchanged.

Automated validation: 37 checks covering navigation, onboarding, contrast, CSP and five Dispatch regressions; page control ID preservation and stylesheet/script parsing. Browser review additionally checks sample stock matching, file selection/crop/upload, email import progress and packing/navigation.
