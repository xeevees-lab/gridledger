<#
  Lets other PCs on the office network open the GridLedger dashboard, securely over HTTPS.
  Run in PowerShell as Administrator:  powershell -ExecutionPolicy Bypass -File .\enable-lan.ps1
  Options:
    -Port 8443                       HTTPS port (default 8443)
    -CertPfx C:\certs\company.pfx    Use your company's certificate instead of a self-made one
    -CertPassword "..."              Password of that .pfx file
    -Disable                         Go back to "this PC only"
#>
param([int]$Port = 8443, [string]$CertPfx = "", [string]$CertPassword = "", [switch]$Disable)
$ErrorActionPreference = 'Stop'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw "Please run PowerShell as Administrator." }

$dataDir = @("C:\GridLedger\dashboard-data", "$env:ProgramData\GridLedger\dashboard-data") | Where-Object { Test-Path "$_\appsettings.Local.json" } | Select-Object -First 1
if (-not $dataDir) { throw "Dashboard settings not found. Install the Dashboard first (setup-dashboard.ps1)." }
$cfgFile = "$dataDir\appsettings.Local.json"
$cfg = Get-Content $cfgFile -Raw | ConvertFrom-Json

if ($Disable) {
  $cfg.PSObject.Properties.Remove('Kestrel')
  $cfg | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $cfgFile
  Get-NetFirewallRule -DisplayName "GridLedger HTTPS" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Restart-Service GridLedgerDashboard
  Write-Host "Office-network access switched off. Dashboard: http://127.0.0.1:8080 on this PC only." -ForegroundColor Green
  return
}

$pfxPath = "$dataDir\gridledger-https.pfx"
if ($CertPfx) {
  Copy-Item $CertPfx $pfxPath -Force
  $pfxPass = $CertPassword
  Write-Host "Using your company certificate."
} else {
  $name = $env:COMPUTERNAME
  $fqdn = [System.Net.Dns]::GetHostEntry($name).HostName
  $cert = New-SelfSignedCertificate -DnsName @($fqdn, $name, "localhost") -CertStoreLocation Cert:\LocalMachine\My `
    -FriendlyName "GridLedger" -NotAfter (Get-Date).AddYears(5) -KeyExportPolicy Exportable -KeyLength 2048 -HashAlgorithm SHA256
  $chars = [char[]]((48..57) + (65..90) + (97..122))
  $pfxPass = -join (1..32 | ForEach-Object { $chars | Get-Random })
  Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password (ConvertTo-SecureString $pfxPass -AsPlainText -Force) | Out-Null
  $pub = Join-Path $PSScriptRoot "GridLedger-certificate.cer"
  Export-Certificate -Cert $cert -FilePath $pub | Out-Null
  Write-Host "Made a certificate for $fqdn (valid 5 years)."
  Write-Host "To stop the browser warning on other PCs, give IT this file to install as a trusted certificate: $pub" -ForegroundColor Yellow
}

$kestrel = @{
  Endpoints = @{
    Local = @{ Url = "http://127.0.0.1:8080" }
    Office = @{ Url = "https://0.0.0.0:$Port"; Certificate = @{ Path = $pfxPath; Password = $pfxPass } }
  }
}
$cfg | Add-Member -NotePropertyName Kestrel -NotePropertyValue $kestrel -Force
$cfg | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $cfgFile

Get-NetFirewallRule -DisplayName "GridLedger HTTPS" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "GridLedger HTTPS" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Domain, Private | Out-Null
Restart-Service GridLedgerDashboard
Write-Host ""
Write-Host "Done. On other office PCs open:  https://$($env:COMPUTERNAME):$Port" -ForegroundColor Green
Write-Host "Only Domain and Private networks are allowed (not public Wi-Fi). On this PC http://127.0.0.1:8080 still works."
