param([string]$SetupPath,[string]$LauncherPath)
$ErrorActionPreference='Stop'
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($SetupPath,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
$launcher=[IO.File]::ReadAllText($LauncherPath)
$bootstrap=[regex]::Match($launcher,'(?m)^powershell\.exe .* -Command "(.*)"\r?$').Groups[1].Value
if (!$bootstrap) { throw 'Launcher bootstrap missing' }
[void][Management.Automation.Language.Parser]::ParseInput($bootstrap,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
$function=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-ExistingTrustValue'},$true)
Invoke-Expression $function.Extent.Text
$cases=@(
    @("authcert.override=/first.crt;/second.crt`n",'/first.crt;/second.crt'),
    @("trustedRootCert=/alias.crt`n",'/alias.crt'),
    @("authcert.override=/first.crt;\`n  /second.crt`n",'/first.crt;/second.crt'),
    @("authcert.override=/primary.crt`ntrustedRootCert=/alias.crt`n",'/primary.crt'),
    @("# authcert.override=/ignore`nauthcert.override=/old`nauthcert.override=/new`n",'/new')
)
foreach($case in $cases) { if ((Get-ExistingTrustValue $case[0]) -cne $case[1]) { throw 'Existing QZ roots were not preserved' } }
Write-Host 'PASS Windows PowerShell parser, launcher syntax and existing trust preservation.'

$reader=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Read-PublicCertificate'},$true)
Invoke-Expression $reader.Extent.Text
$ExpectedFingerprint=[regex]::Match([IO.File]::ReadAllText($SetupPath), 'ExpectedFingerprint = ''([a-f0-9]{64})''').Groups[1].Value
$CertificateFile=Join-Path (Split-Path $SetupPath) 'public.crt'
Read-PublicCertificate
$ExpectedFingerprint='00'*32
$rejected=$false
try { Read-PublicCertificate } catch { $rejected=$true }
if (!$rejected) { throw 'A mismatched certificate was accepted' }
Write-Host 'PASS native certificate decoding and fingerprint rejection.'
