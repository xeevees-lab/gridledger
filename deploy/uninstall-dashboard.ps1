<# Removes the GridLedger Dashboard service. Run as Administrator. The Engine and its data are not touched. #>
if (Get-Service GridLedgerDashboard -ErrorAction SilentlyContinue) { Stop-Service GridLedgerDashboard -ErrorAction SilentlyContinue; sc.exe delete GridLedgerDashboard | Out-Null; Write-Host "GridLedger Dashboard service removed." -ForegroundColor Green }
else { Write-Host "GridLedger Dashboard service is not installed." }
