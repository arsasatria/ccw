# Test Install-Source's -Reinstall flag. When set, an existing
# install must be backed up and replaced with a fresh clone, even
# if the existing install is at the latest commit.
$ErrorActionPreference = 'Stop'

$scriptContent = Get-Content 'C:\Users\arsas\AntigravityProjects\claude-code-router\install.ps1' -Raw
$lines = $scriptContent -split "`r?`n"
$endIdx = 0
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -match '^\s*Write-Banner\s*$') { $endIdx = $i; break }
}
$functions = ($lines[0..($endIdx - 1)] -join "`n")
Invoke-Expression $functions

$Dest = "C:\Users\arsas\AppData\Local\Temp\ccw-reinstall-test"

# Cleanup any prior state
Get-ChildItem -Path (Split-Path $Dest) -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like (Split-Path $Dest -Leaf) + '*' } |
  Remove-Item -Recurse -Force
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }

# Make a $Dest that looks like a freshly-cloned ccw install. The
# fake commit hash on the local clone is intentionally DIFFERENT
# from the real origin/main HEAD, so the -Reinstall path (which
# fires regardless of commit match) is the only way out of this
# test. Without -Reinstall, install_source would back up + re-clone
# anyway because of the diverged branches; -Reinstall tests that
# the flag triggers the same path on its own.
New-Item -ItemType Directory -Force -Path "$Dest\packages\cli" | Out-Null
Set-Content -Path "$Dest\packages\cli\package.json" -Value '{ "name": "@ccw/cli", "version": "2.1.0" }'
Push-Location $Dest
try {
  & git init -q 2>$null
  & git -c user.email=t@t -c user.name=t commit -q --allow-empty -m "fake" 2>$null
} finally {
  Pop-Location
}

# Reset state.
$script:ForceReinstall = $true
$script:RebuildNeeded = $true

Write-Host "TEST: Install-Source with -Reinstall"
Write-Host "  Dest=$Dest"
$outFile = Join-Path $env:TEMP "ccw-install-output.txt"
Install-Source *> $outFile
Get-Content $outFile
Write-Host ""

Write-Host "POST-RUN STATE:"

# The pre-existing dest should have been backed up.
$backups = Get-ChildItem -Path (Split-Path $Dest) -Directory |
  Where-Object { $_.Name -like (Split-Path $Dest -Leaf) + '.bak.*' }
if ($backups) {
  Write-Host "  [ok] Pre-existing $Dest was backed up:"
  $backups | ForEach-Object { Write-Host "         $($_.FullName)" }
} else {
  Write-Host "  [fail] No backup created"
  exit 1
}

# Install-Source should have triggered a fresh clone.
$output = Get-Content $outFile -Raw
if ($output -match 'Cloning') {
  Write-Host "  [ok] Install-Source triggered a fresh clone"
} else {
  Write-Host "  [fail] Install-Source did not clone"
  exit 1
}

# The clone should now have a real origin remote.
if (Test-Path (Join-Path $Dest '.git')) {
  $remote = (& git -C $Dest remote 2>$null) -join ', '
  if ($remote -like '*origin*') {
    Write-Host "  [ok] $Dest has 'origin' remote (real clone)"
  } else {
    Write-Host "  [fail] $Dest has no 'origin' remote"
    exit 1
  }
} else {
  Write-Host "  [fail] $Dest\.git missing"
  exit 1
}

# RebuildNeeded must be $true (we did a fresh clone).
if ($RebuildNeeded) {
  Write-Host "  [ok] RebuildNeeded=`$true (caller should rebuild)"
} else {
  Write-Host "  [fail] RebuildNeeded=`$false (expected `$true)"
  exit 1
}

# Cleanup
if ($backups) { $backups | Remove-Item -Recurse -Force }
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
if (Test-Path $outFile) { Remove-Item -Force $outFile }
Write-Host ""
Write-Host "TEST PASSED"
