#!/bin/bash
# InventoryOS printer setup. Public signing certificate only; no account credentials.
set -euo pipefail
expected='__CERT_SHA256__'
temp_dir=$(mktemp -d -t inventoryos-qz)
cert="$temp_dir/inventoryos-public.crt"
cat > "$cert" <<'INVENTORYOS_PUBLIC_CERTIFICATE'
__CERT_PEM__
INVENTORYOS_PUBLIC_CERTIFICATE
finish() { if [ -n "$temp_dir" ]; then rm -rf -- "$temp_dir"; fi; }
failed() { printf '\nSetup stopped. Read the message above. You can safely run setup again.\n'; read -r -p 'Press Enter to close...' ignored || true; }
trap finish EXIT
trap failed ERR
printf 'InventoryOS printer setup\n\nFinish any current print jobs before continuing.\n'
if [ "$(uname -s)" != 'Darwin' ]; then printf 'This installer is for macOS only.\n'; exit 1; fi
if [ "$(grep -c -- '-----BEGIN CERTIFICATE-----' "$cert")" != 1 ] || grep -q -- 'PRIVATE KEY' "$cert"; then printf 'Invalid public certificate. Download a fresh setup from InventoryOS.\n'; exit 1; fi
actual=$(/usr/bin/openssl x509 -in "$cert" -noout -fingerprint -sha256 | sed 's/.*=//' | tr -d ':' | tr '[:upper:]' '[:lower:]')
if [ "$actual" != "$expected" ]; then printf 'Certificate fingerprint mismatch. Download a fresh setup.\n'; exit 1; fi
/usr/bin/openssl x509 -in "$cert" -noout -checkend 0 >/dev/null
not_before=$(/usr/bin/openssl x509 -in "$cert" -noout -startdate | cut -d= -f2-)
if [ "$(LC_ALL=C /bin/date -j -u -f '%b %e %T %Y %Z' "$not_before" '+%s')" -gt "$(/bin/date -u '+%s')" ]; then printf 'The InventoryOS signing certificate is not valid yet. Contact support.\n'; exit 1; fi
app='/Applications/QZ Tray.app'
version=''
if [ -f "$app/Contents/Info.plist" ]; then version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist"); fi
needs_install=1
if [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+) ]]; then
    if (( BASH_REMATCH[1] > 2 || (BASH_REMATCH[1] == 2 && BASH_REMATCH[2] >= 3) )); then needs_install=0; fi
fi
if [ "$needs_install" = 1 ]; then
    arch=$(uname -m)
    # Rosetta can report x86_64 on Apple silicon. Prefer the native package.
    if [ "$(/usr/sbin/sysctl -in hw.optional.arm64 2>/dev/null || true)" = 1 ]; then arch='arm64'; fi
    case "$arch" in
        arm64) asset='arm64'; hash='abeaa942f2ae3ddf12ab4ff9b5c9c291827d81d8100a5c62155ab028b31d9d2b' ;;
        x86_64) asset='x86_64'; hash='95a09c21c428aa7e68bc5e1a785e707897ef98eb7496a8ed7a7aa144adb5abe5' ;;
        *) printf 'Unsupported Mac processor.\n'; exit 1 ;;
    esac
    package="$temp_dir/qz-tray.pkg"
    printf '\nDownloading the official QZ Tray installer. This can take a few minutes...\n'
    /usr/bin/curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 30 --max-time 1800 "https://github.com/qzind/tray/releases/download/v2.3.0/qz-tray-2.3.0-$asset.pkg" -o "$package"
    if [ "$(/usr/bin/shasum -a 256 "$package" | awk '{print $1}')" != "$hash" ]; then printf 'QZ Tray download failed its integrity check. Nothing was installed.\n'; exit 1; fi
    /usr/sbin/pkgutil --check-signature "$package"
    /usr/sbin/spctl --assess --type install "$package"
    printf '\nmacOS needs administrator approval to install QZ Tray.\n'
    /usr/bin/sudo /usr/sbin/installer -pkg "$package" -target /
fi
exe="$app/Contents/MacOS/QZ Tray"
# QZ stores qz-tray.properties beside qz-tray.jar in Contents/Resources.
properties="$app/Contents/Resources/qz-tray.properties"
if [ ! -x "$exe" ] || [ ! -f "$properties" ]; then printf 'QZ Tray installation could not be verified. Contact support.\n'; exit 1; fi
if [ -z "$temp_dir" ]; then temp_dir=$(mktemp -d -t inventoryos-qz); fi
directory='/Library/Application Support/InventoryOS/Printing'
target="$directory/$expected.crt"
/usr/bin/awk '
    /^# BEGIN InventoryOS printing\r?$/ { managed=1; next }
    /^# END InventoryOS printing\r?$/ { managed=0; next }
    !managed { print }
' "$properties" > "$temp_dir/clean.properties"
existing=$(/usr/bin/awk '
    function accept(line, key, val) {
        if (line ~ /^[ \t]*[#!]/) return
        key=line; sub(/^[ \t]*/, "", key)
        if (key !~ /^(authcert\.override|trustedRootCert)([ \t]*[=:]|[ \t]+)/) return
        val=key; sub(/^(authcert\.override|trustedRootCert)([ \t]*[=:][ \t]*|[ \t]+)/, "", val)
        if (key ~ /^authcert\.override/) { primary=val; have_primary=1 } else { alias=val }
    }
    { line=$0; sub(/\r$/, "", line); if (!continuing && line ~ /^[ \t]*[#!]/) next; if (continuing) sub(/^[ \t]*/, "", line); logical=logical line
      trailing=logical; sub(/^.*[^\\]/, "", trailing)
      if (length(trailing)%2) { sub(/\\$/, "", logical); continuing=1; next }
      accept(logical); logical=""; continuing=0 }
    END { if (logical!="") accept(logical); if (have_primary) printf "%s", primary; else printf "%s", alias }
' "$temp_dir/clean.properties")
# Only append an InventoryOS section; retain all original QZ properties and other roots.
cp "$temp_dir/clean.properties" "$temp_dir/updated.properties"
printf '\n# BEGIN InventoryOS printing\nauthcert.override=%s%s%s\n# END InventoryOS printing\n' "$existing" "${existing:+;}" "$target" >> "$temp_dir/updated.properties"
printf '\nmacOS needs administrator approval to configure QZ printing trust.\n'
if [ -L "$directory" ] || [ -L '/Library/Application Support/InventoryOS' ]; then printf 'Printing setup directory must not be a link. Contact support.\n'; exit 1; fi
/usr/bin/sudo /bin/mkdir -p "$directory"
/usr/bin/sudo /usr/sbin/chown root:wheel '/Library/Application Support/InventoryOS' "$directory"
/usr/bin/sudo /bin/chmod 755 '/Library/Application Support/InventoryOS' "$directory"
backup="$directory/qz-tray.properties.backup-$(date -u '+%Y%m%d-%H%M%S')-$$"
/usr/bin/sudo /bin/cp -p "$properties" "$backup"
/usr/bin/sudo /usr/bin/install -o root -g wheel -m 644 "$cert" "$target"
if ! /usr/bin/sudo /bin/cp "$temp_dir/updated.properties" "$properties"; then
    /usr/bin/sudo /bin/cp -p "$backup" "$properties"
    printf 'Could not save QZ settings. Previous settings restored.\n'; exit 1
fi
# Restart only QZ Tray, as the signed-in user, to load the added certificate.
/usr/bin/open -na "$app" --args --steal
/usr/bin/open 'https://app.inventoryos.co.uk/printer-setup.html?setup=complete'
printf '\nSetup complete. Choose your printer and print a test label in the page that opened.\n'
read -r -p 'Press Enter to close...' ignored || true
