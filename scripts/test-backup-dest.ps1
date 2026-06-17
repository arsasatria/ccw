# Test Install-Source auto-backup behavior with simulated $Dest
$ErrorActionPreference = 'Stop'

$scriptContent = Get-Content 'C:\Users\arsas\AntigravityProjects\claude-code-router\install.ps1' -Raw
$lines = $scriptContent -split "`r?`n"
$endIdx = 0
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -match '^\s*Write-Banner\s*$') { $endIdx = $i; break }
}
$functions = ($lines[0..($endIdx - 1)] -join "`n")
Invoke-Expression $functions

# Override $Dest AFTER loading the functions (Invoke-Expression above re-sets it)
$Dest = "C:\Users\arsas\AppData\Local\Temp\ccw-install-test"

# Create a fake non-git directory at $Dest
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
New-Item -ItemType Directory -Path $Dest | Out-Null
Set-Content -Path "$Dest\stray-file.txt" -Value "leftover from a previous install"
Set-Content -Path "$Dest\config.json" -Value '{"port": 9999}'

Write-Host "TEST SETUP: $Dest is a non-git directory with 2 stray files"
Get-ChildItem $Dest | Format-Table Name
Write-Host ""

Write-Host "RUNNING: Install-Source (expect: backup then clone, no exit)"
Write-Host "=========================================="
try {
  Install-Source
} catch {
  Write-Host "Install-Source threw: $_" -ForegroundColor Red
}
Write-Host "=========================================="
Write-Host ""

Write-Host "POST-RUN STATE:"
if (Test-Path $Dest) {
  Write-Host "  [ok] $Dest still exists (clone succeeded)"
  if (Test-Path (Join-Path $Dest '.git')) {
    Write-Host "  [ok] $Dest\.git exists (it's a git repo now)"
  } else {
    Write-Host "  [fail] $Dest\.git missing"
  }
} else {
  Write-Host "  [info] $Dest does not exist (clone likely failed without network)"
}

$backups = Get-ChildItem -Path (Split-Path $Dest) -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'ccw-install-test.bak.*' }
if ($backups) {
  Write-Host "  [ok] Backup directory(ies) created:"
  $backups | ForEach-Object { Write-Host "         $($_.FullName)" }
  if (Test-Path "$($backups[0].FullName)\stray-file.txt") {
    Write-Host "  [ok] Backup contains the original stray files"
  } else {
    Write-Host "  [fail] Backup does not contain stray files"
  }
} else {
  Write-Host "  [fail] No backup directory created"
}

Write-Host ""
Write-Host "CLEANUP: removing test artifacts"
if ($backups) { $backups | Remove-Item -Recurse -Force }
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
Write-Host "Done."
