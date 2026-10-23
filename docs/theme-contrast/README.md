# Appearance contrast update

Light appearance uses warm white panels, dark text, strong form borders and darker versions of all six saved accent colours. The original application dark appearance is retained. Screen-only styling and the runtime adapter exclude receipt/label artwork from dynamic colour correction.

Validation: three Node contrast/preference checks; browser checks using isolated sample-data fixtures made from the actual Add Stock, Retail, Till and Manufacturing markup. Checked dynamic legacy cards, yellow multi-location text and switching back to dark. No live stock, payments or account data were changed. The screenshot is a Retail appearance preview using sample data, not a live account.

The public marketing site has its own remembered light/dark choice, including its guide and policy pages. Its default is dark. Public-page persistence and mobile headers at 390px and 320px were checked separately.

No backend update is required. Shared HTML assets and Retail/Till service worker cache versions are refreshed for the new theme files.
