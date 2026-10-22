# InventoryOS printer setup. Public signing certificate only; no account credentials.
param([switch]$MachineSetup)
$ErrorActionPreference = 'Stop'
$ExpectedFingerprint = '__CERT_SHA256__'
$CertificateFile = Join-Path $PSScriptRoot 'inventoryos-public.crt'
$SetupUrl = 'https://app.inventoryos.co.uk/printer-setup.html?setup=complete'

function Get-QzExecutable {
    foreach ($base in @($env:ProgramW6432, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($base) { $candidate = Join-Path $base 'QZ Tray\qz-tray.exe'; if (Test-Path -LiteralPath $candidate) { return $candidate } }
    }
    return $null
}
function Read-PublicCertificate {
    $pem = [IO.File]::ReadAllText($CertificateFile)
    if ($pem -notmatch '\A\s*-----BEGIN CERTIFICATE-----\s*([A-Za-z0-9+/=\s]+)-----END CERTIFICATE-----\s*\z') { throw 'The public certificate file is invalid. Download a fresh setup from InventoryOS.' }
    $raw = [Convert]::FromBase64String($Matches[1])
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList (,$raw)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $fingerprint = ([BitConverter]::ToString($sha.ComputeHash($raw))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
    if ($fingerprint -ne $ExpectedFingerprint) { throw 'Certificate fingerprint does not match. Download a fresh setup from InventoryOS.' }
    if ([DateTime]::UtcNow -lt $cert.NotBefore.ToUniversalTime() -or [DateTime]::UtcNow -ge $cert.NotAfter.ToUniversalTime()) { throw 'InventoryOS signing certificate is not currently valid. Contact the account owner.' }
}
function Get-ExistingTrustValue([string]$Content) {
    $logical = ''; $primary = $null; $alias = $null
    foreach ($line in ($Content -split '\r?\n')) {
        if (!$logical -and $line -match '^\s*[#!]') { continue }
        if ($logical) { $logical += $line.TrimStart() } else { $logical = $line }
        $trailing = [regex]::Match($logical, '\\+$').Length
        if (($trailing % 2) -eq 1) { $logical = $logical.Substring(0, $logical.Length - 1); continue }
        if ($logical -match '^\s*(authcert\.override|trustedRootCert)(?:\s*[=:]\s*|\s+)(.*)$') {
            if ($Matches[1] -eq 'authcert.override') { $primary = $Matches[2] } else { $alias = $Matches[2] }
        }
        $logical = ''
    }
    if ($null -ne $primary) { return $primary }; return $alias
}
try {
    Write-Host 'InventoryOS printer setup' -ForegroundColor Green
    Read-PublicCertificate
    if (!$MachineSetup) {
        Write-Host 'Windows will ask permission to install QZ Tray and configure InventoryOS printing.'
        Write-Host 'Please finish any current print jobs before continuing.'
        $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -MachineSetup'
        $result = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -Verb RunAs -Wait -PassThru
        if ($result.ExitCode -ne 0) { throw 'Setup did not complete. Check the setup window for details, then run it again.' }
        $exe = Get-QzExecutable
        if (!$exe) { throw 'QZ Tray could not be found after installation.' }
        Start-Process -FilePath $exe -ArgumentList '--steal'
        Start-Process $SetupUrl
        Write-Host 'Setup complete. Choose your printer and print a test label in the page that opened.' -ForegroundColor Green
    } else {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        if (!(New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator approval is required.' }
        $exe = Get-QzExecutable
        $version = if ($exe) { [regex]::Match((Get-Item -LiteralPath $exe).VersionInfo.ProductVersion, '\d+\.\d+\.\d+').Value } else { '' }
        if (!$exe -or !$version -or [version]$version -lt [version]'2.3.0') {
            $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
            switch ($arch) {
                'ARM64' { $asset = 'arm64'; $hash = '10e308b91d84b637520eb36096cb6814b33a66f3cabc317ce776253e759babc8' }
                'AMD64' { $asset = 'x86_64'; $hash = '7a44a50f679f0a1dab6679e6c22158dd335511074f5fcc1b208b6f9caf711ba7' }
                default { throw 'This setup supports 64-bit Windows on Intel, AMD or ARM.' }
            }
            $tempDirectory = Join-Path ([IO.Path]::GetTempPath()) ('inventoryos-qz-' + [Guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $tempDirectory | Out-Null
            try {
                $download = Join-Path $tempDirectory 'qz-tray.exe'
                Write-Host 'Downloading the official QZ Tray installer. This can take a few minutes...'
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/qzind/tray/releases/download/v2.3.0/qz-tray-2.3.0-$asset.exe" -OutFile $download
                if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'QZ Tray download failed its integrity check. Nothing was installed.' }
                if ((Get-AuthenticodeSignature -LiteralPath $download).Status -ne 'Valid') { throw 'The official QZ Tray installer signature could not be verified. Nothing was installed.' }
                $installed = Start-Process -FilePath $download -ArgumentList '/S' -Wait -PassThru
                if ($installed.ExitCode -ne 0) { throw "QZ Tray installer returned $($installed.ExitCode)." }
            } finally { Remove-Item -LiteralPath $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue }
            $exe = Get-QzExecutable
            if (!$exe) { throw 'QZ Tray installation could not be verified.' }
        }
        $appDirectory = Split-Path -Parent $exe
        $properties = Join-Path $appDirectory 'qz-tray.properties'
        if (!(Test-Path -LiteralPath $properties)) { throw 'QZ Tray properties are missing. Open QZ Tray once, then rerun setup.' }
        $directory = Join-Path $env:ProgramData 'InventoryOSPrinting'
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
        if ((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Printing setup directory must not be a link. Contact support.' }
        # Public trust material must be readable by staff but writable only by administrators.
        $acl = New-Object Security.AccessControl.DirectorySecurity
        $acl.SetAccessRuleProtection($true, $false)
        $admins = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
        $system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
        $users = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')
        $acl.SetOwner($admins)
        $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
        $propagate = [Security.AccessControl.PropagationFlags]::None
        foreach ($principal in @($admins, $system)) { $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($principal, 'FullControl', $inherit, $propagate, 'Allow'))) }
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($users, 'ReadAndExecute', $inherit, $propagate, 'Allow')))
        Set-Acl -LiteralPath $directory -AclObject $acl
        $target = Join-Path $directory ($ExpectedFingerprint + '.crt')
        if ((Test-Path -LiteralPath $target) -and ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'The certificate destination must not be a link. Contact support.' }
        Copy-Item -LiteralPath $CertificateFile -Destination $target -Force
        $fileAcl = New-Object Security.AccessControl.FileSecurity
        $fileAcl.SetAccessRuleProtection($true, $false)
        $fileAcl.SetOwner($admins)
        foreach ($principal in @($admins, $system)) { $fileAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($principal, 'FullControl', 'Allow'))) }
        $fileAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($users, 'Read', 'Allow')))
        Set-Acl -LiteralPath $target -AclObject $fileAcl
        $encoding = [Text.Encoding]::GetEncoding(28591)
        $original = [IO.File]::ReadAllText($properties, $encoding)
        $clean = [regex]::Replace($original, '(?ms)^# BEGIN InventoryOS printing\r?\n.*?^# END InventoryOS printing(?:\r?\n|$)', '')
        $existing = Get-ExistingTrustValue $clean
        $pathValue = $target.Replace('\', '/').Replace('^', '^^').Replace(';', '^;').Replace('|', '^|')
        $pathValue = $pathValue.Replace('\', '\\')
        if ($pathValue -match '[^\x20-\x7e]') { throw 'The system data path is not supported by this setup. Contact support.' }
        $value = if ([string]::IsNullOrEmpty($existing)) { $pathValue } else { $existing + ';' + $pathValue }
        $backup = Join-Path $directory ('qz-tray.properties.backup-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fffffff'))
        Copy-Item -LiteralPath $properties -Destination $backup
        $updated = $clean.TrimEnd("`r", "`n") + "`r`n# BEGIN InventoryOS printing`r`nauthcert.override=$value`r`n# END InventoryOS printing`r`n"
        try { [IO.File]::WriteAllText($properties, $updated, $encoding) } catch { Copy-Item -LiteralPath $backup -Destination $properties -Force; throw }
        Write-Host 'InventoryOS public certificate configured in QZ Tray. Existing trust settings were preserved.' -ForegroundColor Green
        exit 0
    }
} catch {
    Write-Host ('Setup stopped: ' + $_.Exception.Message) -ForegroundColor Red
    if ($MachineSetup) { Read-Host 'Press Enter to close'; exit 1 }
    Read-Host 'Press Enter to close'; exit 1
}
