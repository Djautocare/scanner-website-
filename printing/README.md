# InventoryOS desktop printing setup

Account settings → Printing generates the customer's setup download using the current public certificate from the existing authenticated `/qz/status` and `/qz/certificate` routes. No backend update is required when those existing routes are configured.

- Windows: one `.cmd` file extracts its public certificate and PowerShell setup to a temporary directory, requests UAC approval, then removes the temporary directory. Supports x64 and ARM64.
- macOS: a ZIP preserves the command file's executable permission. Open the ZIP, then the command. Supports Intel and Apple silicon, including Rosetta detection. macOS may require approval in Privacy & Security and an administrator password.
- Setup downloads the official QZ Tray 2.3.0 installer when the installed copy is missing or older. Downloads have pinned SHA-256 hashes and native signature checks. A newer installed version is retained.
- Both templates verify the bundled public certificate fingerprint and validity before changing QZ trust. Each download checks the public certificate against `/qz/status`. Private keys and authentication tokens are never included. Signing still happens on the existing backend.
- Only QZ printing trust is changed; the public certificate is not installed into the operating system's root trust store. Existing `authcert.override`/`trustedRootCert` paths are retained in a marked InventoryOS section. Other QZ settings and built-in trusted roots remain. Rerunning replaces that section rather than duplicating it. Public certificates are stored in an administrator-owned InventoryOS Printing directory.
- Before writing properties, setup saves a timestamped backup under `C:\ProgramData\InventoryOSPrinting` or `/Library/Application Support/InventoryOS/Printing`. A failed properties write restores that backup. QZ itself is not uninstalled if a later configuration step fails.
- Setup starts QZ as the signed-in user with `--steal`, then opens `https://app.inventoryos.co.uk/printer-setup.html?setup=complete`. The customer must select their printer, save settings and test printing. Printer-specific drivers, paper sizes and hardware connection remain device-specific.

These are transparent setup scripts, not InventoryOS-signed EXE/PKG applications. They do not bypass operating-system download approval, change machine-wide PowerShell execution policy, disable security tools, install a printer driver, or switch on app-specific auto-print preferences. Internet access and administrator approval are required. Finish active print jobs first.

## Maintenance and verification

Failed certificate/status requests show specific setup, network, origin, subscription or signing-file errors, without displaying raw backend paths. An older successful status response may omit the redundant `configured` flag; certificate fingerprint and validity checks still apply. An explicit `configured: false` remains a failure.

The Settings troubleshooting link downloads `check-printing.cjs`. Run it from the existing backend folder to check the configured key/certificate, signing match, validity, allowed origins and route mount. It does not change files or expose environment values. It cannot verify a specific signed-in account's billing access; it notes the legacy Pro gate when present. Its checks are covered by `node --test printing/tests/diagnostic.test.cjs`.

When updating QZ, obtain official release assets from `qzind/tray`, verify their release digests, and update the pinned version, URLs and hashes in both templates. Update the standard installer links in `settings.html` too. Certificate rotation needs a fresh website-generated setup download and rerun on each printing computer.

Run `printing/tests/installer.browser.cjs` with the same Playwright/Chromium environment variables as Retail browser tests. It generates a disposable test certificate, checks both browser downloads, opens the ZIP with Python's ZIP reader, checks executable permissions, validates native shell syntax, exercises the actual existing-trust parser and checks error paths. Set `INVENTORYOS_TEST_PWSH` to a PowerShell runtime to also parse both Windows stages and execute the certificate/trust helpers. The test does not install QZ or modify a real machine's printing configuration.

To manually reverse only InventoryOS trust, first back up the current QZ properties. Remove the `# BEGIN InventoryOS printing` through `# END InventoryOS printing` block from the relevant `qz-tray.properties`, then restart QZ. If other apps have changed that same trust entry since setup, preserve those paths. The timestamped properties backups are available for recovery; do not blindly overwrite newer settings from other apps.

Sources: [QZ signing](https://qz.io/docs/signing), [deployment](https://qz.io/docs/deployment), [command line](https://qz.io/docs/command-line), [QZ 2.3 Certificate.java](https://github.com/qzind/tray/blob/v2.3.0/src/qz/auth/Certificate.java) and [CaInvoker.java](https://github.com/qzind/tray/blob/v2.3.0/src/qz/installer/provision/invoker/CaInvoker.java).
