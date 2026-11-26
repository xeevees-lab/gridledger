<#
  GridLedger DASHBOARD - installs or updates the Dashboard (the screens customers use) as a Windows service.
  Run in PowerShell as Administrator:  powershell -ExecutionPolicy Bypass -File .\setup-dashboard.ps1
  If the GridLedger Engine is on this PC, the connection is set up automatically.
  Engine on another server:  .\setup-dashboard.ps1 -EngineUrl https://engine-server:8443 -GatewayKey <key>
#>
param([string]$InstallDir = "C:\GridLedger", [int]$Port = 8080, [string]$EngineUrl = "", [string]$GatewayKey = "")
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
function Step($n, $t) { Write-Host ""; Write-Host "[$n/5] $t" -ForegroundColor Cyan }
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw "Please run PowerShell as Administrator." }

function Ensure-DotNet {
  $dn = "$env:ProgramFiles\dotnet\dotnet.exe"
  $have = { if (-not (Test-Path $dn)) { return $false }; $l = @(& $dn --list-runtimes 2>$null); ([bool]($l -match '^Microsoft\.NETCore\.App 10\.')) -and ([bool]($l -match '^Microsoft\.AspNetCore\.App 10\.')) }
  if (& $have) { Write-Host "  .NET 10 runtime: OK"; return }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw ".NET 10 is not installed. Download 'ASP.NET Core Runtime 10 - Windows Hosting Bundle' from https://dotnet.microsoft.com/download/dotnet/10.0, install it, then run this script again."
  }
  Write-Host "  Installing the .NET 10 runtime (one time, a few minutes)..."
  winget install -e --id Microsoft.DotNet.Runtime.10 --silent --accept-package-agreements --accept-source-agreements | Out-Null
  winget install -e --id Microsoft.DotNet.AspNetCore.10 --silent --accept-package-agreements --accept-source-agreements | Out-Null
  if (-not (& $have)) {
    throw ".NET 10 could not be installed automatically. Download 'ASP.NET Core Runtime 10 - Windows Hosting Bundle' from https://dotnet.microsoft.com/download/dotnet/10.0, install it, then run this script again."
  }
  Write-Host "  .NET 10 runtime: installed"
}
function Start-PwService([string]$Name, [string[]]$LogDirs) {
  $since = Get-Date
  try { Start-Service $Name }
  catch {
    Write-Host ""
    Write-Host "  The '$Name' service did not start. Reason found by Windows:" -ForegroundColor Yellow
    Start-Sleep 2
    $ev = Get-WinEvent -LogName Application -MaxEvents 60 -ErrorAction SilentlyContinue |
      Where-Object { $_.TimeCreated -ge $since.AddSeconds(-5) -and $_.ProviderName -match '\.NET Runtime|Application Error|GridLedger' } | Select-Object -First 2
    foreach ($e in $ev) { Write-Host (($e.Message -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 10) -join "`n") }
    foreach ($d in $LogDirs) {
      $log = Get-ChildItem $d -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
      if ($log) { Write-Host "  Last lines of $($log.FullName):"; Get-Content $log.FullName -Tail 15 }
    }
    throw "The '$Name' service could not start. Please send a screenshot of this window to GridLedger support."
  }
}

# Files from a downloaded zip are marked "from the internet"; Windows may block such programs from running as a service.
Get-ChildItem $here -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue

Step 1 "Copying the Dashboard"
Ensure-DotNet
$svc = Get-Service GridLedgerDashboard -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') { Stop-Service GridLedgerDashboard -Force; Start-Sleep 2 }
New-Item -ItemType Directory -Force -Path "$InstallDir\dashboard", "$InstallDir\dashboard-data" | Out-Null
if (Test-Path "$here\app\GridLedger.Dashboard.exe") { Copy-Item "$here\app\*" "$InstallDir\dashboard" -Recurse -Force }
else {
  dotnet publish "$here\source\src\GridLedger.Dashboard\GridLedger.Dashboard.csproj" -c Release -r win-x64 --self-contained true -o "$InstallDir\dashboard"
  if ($LASTEXITCODE -ne 0) { throw "Build failed." }
}

Step 2 "Connecting to the GridLedger Engine"
$cfgFile = "$InstallDir\dashboard-data\appsettings.Local.json"
$cfg = if (Test-Path $cfgFile) { Get-Content $cfgFile -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
$engineCfg = "$InstallDir\data\appsettings.Local.json"
if (-not $EngineUrl -and -not $cfg.PSObject.Properties['EngineUrl'] -and (Test-Path $engineCfg)) {
  $e = Get-Content $engineCfg -Raw | ConvertFrom-Json
  $EngineUrl = if ($e.Urls) { $e.Urls } else { "http://127.0.0.1:8090" }
  $GatewayKey = $e.GatewayKey
  Write-Host "  Found the Engine on this PC ($EngineUrl)."
}
if ($EngineUrl) { $cfg | Add-Member -NotePropertyName EngineUrl -NotePropertyValue $EngineUrl -Force }
if ($GatewayKey) { $cfg | Add-Member -NotePropertyName GatewayKey -NotePropertyValue $GatewayKey -Force }
if (-not $cfg.PSObject.Properties['Kestrel']) { $cfg | Add-Member -NotePropertyName Urls -NotePropertyValue "http://127.0.0.1:$Port" -Force }
$cfg | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $cfgFile
icacls "$InstallDir\dashboard-data" /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
if (-not $cfg.PSObject.Properties['EngineUrl']) { Write-Host "  No Engine found yet: the browser will ask for the Engine address and gateway key." -ForegroundColor Yellow }

Step 3 "Installing the Windows service 'GridLedger Dashboard'"
if (-not $svc) {
  New-Service -Name GridLedgerDashboard -BinaryPathName "`"$InstallDir\dashboard\GridLedger.Dashboard.exe`"" -DisplayName "GridLedger Dashboard" `
    -Description "GridLedger screens. Shows data from the GridLedger Engine." -StartupType Automatic | Out-Null
}
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\GridLedgerDashboard" -Name Environment -Type MultiString -Value @("GL_DASHBOARD_DATA_DIR=$InstallDir\dashboard-data")
sc.exe failure GridLedgerDashboard reset= 86400 actions= restart/5000/restart/10000/restart/60000 | Out-Null
Get-ChildItem "$InstallDir\dashboard" -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
Start-PwService GridLedgerDashboard @("$InstallDir\dashboard-data\logs")

Step 4 "Checking the Dashboard"
$ok = $false
for ($i = 0; $i -lt 40; $i++) { try { Invoke-WebRequest "http://127.0.0.1:$Port/gateway/status" -UseBasicParsing -TimeoutSec 2 | Out-Null; $ok = $true; break } catch { Start-Sleep 2 } }
if (-not $ok) { throw "The Dashboard did not start." }

Step 5 "Done"
Write-Host "  GridLedger Dashboard: http://127.0.0.1:$Port" -ForegroundColor Green
Start-Process "http://127.0.0.1:$Port"
