# Navigation and first-paint repair — 3 November 2026

The shared redesign could appear in its legacy layout before JavaScript moved the header, navigation and settings cards. Background renders could also replace a menu button between pointer-down and click, while repeated light-mode corrections scanned and restyled large parts of the document.

This repair:

- Ships the reseller shell, navigation, workflow strips and Settings accordion in the HTML. Hydration wires the existing controls without relocating the visible page.
- Applies saved appearance before first paint and opens Guide/Help deep links directly into their requested pane.
- Retains Retail and Manufacturing navigation nodes when switching views; view changes update selection rather than rebuilding the menu.
- Defers background rendering until native button activation is delivered, without flushing an old render into the next pointer-down. Explicit navigation renders immediately and consumes its stale queued repaint.
- Coalesces simultaneous workspace selector initialisers and prevents a superseded selection from rendering over the latest one.
- Makes repeated theme applications idempotent, limits light-mode correction to changed visible subtrees, and batches style reads/writes.
- Keeps mobile navigation hit targets stationary. Different-page links activate normally before the old document disappears; current-page links and same-page Guide/Help actions still work.
- Versions the shared files and Retail/Till precaches without clearing sessions, device pairing or offline sale queues.

Validation: 32 Node checks; original control IDs and compiled event attributes retained; strict CSP checks; changed-script syntax and stylesheet parsing. Browser checks used an isolated read-only fixture with fictional account/inventory data: desktop Stock navigation, Settings/Guide switching, theme changes, repeated Manufacturing and Retail section changes, and a quick 390 px mobile drawer → Remove stock transition. This is frontend interaction testing; no real payment, stock change, email or hardware printing was performed.

No backend installation or database migration is required. The previous frontend commit is `d9411a53e35f751f24e36bbb6e192b4443c89e6e`.
