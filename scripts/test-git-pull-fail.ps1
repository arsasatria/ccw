# Test Install-Source when local .git has no 'origin' remote
# (simulates a common re-run failure after the source dir was moved/renamed)
$ErrorActionPreference = 'Stop'

$scriptContent = Get-Content 'C:\Users\arsas\AntigravityProjects\claude-code-router\install.ps1' -Raw
$lines = $scriptContent -split "`r?`n"
$endIdx = 0
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -match '^\s*Write-Banner\s*$') { $endIdx = $i; break }
}
$functions = ($lines[0..($endIdx - 1)] -join "`n")
Invoke-Expression $functions

$Dest = "C:\Users\arsas\AppData\Local\Temp\ccw-pull-fail-test"

# Cleanup any prior state
Get-ChildItem -Path (Split-Path $Dest) -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like (Split-Path $Dest -Leaf) + '*' } |
  Remove-Item -Recurse -Force
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }

# Set up: a git repo with NO origin remote and a stray file
New-Item -ItemType Directory -Path $Dest | Out-Null
Set-Content -Path "$Dest\local-changes.txt" -Value "user's own file"
Push-Location $Dest
try {
  & git init -q 2>&1 | Out-Null
  & git -c user.email=t@t -c user.name=t commit -q --allow-empty -m "initial" 2>&1 | Out-Null
  # Make a local commit so HEAD != origin (which doesn't exist)
  Set-Content -Path "$Dest\local-changes.txt" -Value "stale local data"
  & git add . 2>&1 | Out-Null
  & git -c user.email=t@t -c user.name=t commit -q -m "local-only" 2>&1 | Out-Null
  # git init does not add an origin remote by default, so there's nothing to
  # remove. Verify the empty remote list:
  $remoteList = (& git remote) -join ', '
  Write-Host "TEST SETUP: $Dest is a git repo with NO origin remote"
  Write-Host "  remotes: '$remoteList'"
} finally {
  Pop-Location
}
Write-Host ""

Write-Host "RUNNING: Install-Source (expect: warn, backup, clone, no exit)"
Write-Host "=========================================="
try {
  Install-Source
} catch {
  Write-Host "Install-Source threw: $_" -ForegroundColor Red
}
Write-Host "=========================================="
Write-Host ""

Write-Host "POST-RUN STATE:"
if (Test-Path (Join-Path $Dest '.git')) {
  $remote = (& git -C $Dest remote) -join ', '
  if ($remote -like '*origin*') {
    Write-Host "  [ok] $Dest has 'origin' remote (clone succeeded)"
  } else {
    Write-Host "  [fail] $Dest has no 'origin' remote (clone didn't replace it)"
  }
} else {
  Write-Host "  [fail] $Dest\.git missing"
}

$backups = Get-ChildItem -Path (Split-Path $Dest) -Directory |
  Where-Object { $_.Name -like (Split-Path $Dest -Leaf) + '.bak.*' }
if ($backups) {
  Write-Host "  [ok] Backup directory created: $($backups[0].Name)"
  if (Test-Path "$($backups[0].FullName)\.git") {
    Write-Host "  [ok] Backup contains the original .git"
  } else {
    Write-Host "  [fail] Backup does not contain .git"
  }
  if (Test-Path "$($backups[0].FullName)\local-changes.txt") {
    Write-Host "  [ok] Backup contains local-changes.txt"
  } else {
    Write-Host "  [fail] Backup missing local-changes.txt"
  }
} else {
  Write-Host "  [fail] No backup directory"
}

Write-Host ""
Write-Host "CLEANUP"
if ($backups) { $backups | Remove-Item -Recurse -Force }
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
Write-Host "Done."
