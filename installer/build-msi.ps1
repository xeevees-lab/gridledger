<#
  Builds the Dashboard installer: GridLedger-Dashboard-Setup.msi
  Needs: .NET 10 SDK, Node.js (for the screens) and internet. Run from this folder:
    powershell -ExecutionPolicy Bypass -File .\build-msi.ps1
#>
param([string]$Version = "1.0.0")
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path $here -Parent
$pub = Join-Path $here "publish"
if (Test-Path $pub) { Remove-Item $pub -Recurse -Force }

Write-Host "1/3 Building the screens (React)..." -ForegroundColor Cyan
Push-Location (Join-Path $root "web")
npm ci; if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
npm run build; if ($LASTEXITCODE -ne 0) { throw "Screen build failed" }
Pop-Location

Write-Host "2/3 Publishing the Dashboard (self-contained: no .NET needed on the customer PC)..." -ForegroundColor Cyan
dotnet publish (Join-Path $root "src\GridLedger.Dashboard\GridLedger.Dashboard.csproj") -c Release -r win-x64 --self-contained true -p:Version=$Version -o $pub
if ($LASTEXITCODE -ne 0) { throw "Publish failed" }

Write-Host "3/3 Building the MSI..." -ForegroundColor Cyan
dotnet build (Join-Path $here "GridLedger.Dashboard.Installer.wixproj") -c Release -p:PublishDir=$pub -p:ProductVersion=$Version
if ($LASTEXITCODE -ne 0) { throw "MSI build failed" }
$msi = Get-ChildItem (Join-Path $here "bin") -Recurse -Filter *.msi | Select-Object -First 1
Write-Host ""; Write-Host "Installer ready: $($msi.FullName)" -ForegroundColor Green
