# Test Install-Source's "already up to date" skip path. After a fresh
# install, running Install-Source again should:
#   - detect the installed version (e.g. v2.1.0)
#   - detect that local commit == remote commit
#   - set $RebuildNeeded=$false
#   - return without cloning or rebuilding
$ErrorActionPreference = 'Stop'

# Source only the function definitions from install.ps1 (everything
# up to but excluding the Write-Banner definition, which marks the
# start of the main script body).
$scriptContent = Get-Content 'C:\Users\arsas\AntigravityProjects\claude-code-router\install.ps1' -Raw
$lines = $scriptContent -split "`r?`n"
$endIdx = 0
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -match '^\s*Write-Banner\s*$') { $endIdx = $i; break }
}
$functions = ($lines[0..($endIdx - 1)] -join "`n")
Invoke-Expression $functions

$Dest = "C:\Users\arsas\AppData\Local\Temp\ccw-up-to-date-test"

# Cleanup any prior state
Get-ChildItem -Path (Split-Path $Dest) -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like (Split-Path $Dest -Leaf) + '*' } |
  Remove-Item -Recurse -Force
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }

# Make a $Dest that looks like a freshly-cloned ccw install at the
# latest commit, so Get-LocalCommit == Get-RemoteCommit. We do a
# real local clone (not a fake `git init`) because the installer's
# "Already up to date" check compares the local short HEAD to
# `git ls-remote --heads origin main`. A fake empty commit would
# have a different hash and trigger the diverged-branches path,
# not the up-to-date path.
New-Item -ItemType Directory -Force -Path "$Dest\packages\cli" | Out-Null
Set-Content -Path "$Dest\packages\cli\package.json" -Value '{ "name": "@ccw/cli", "version": "2.1.0" }'

# Clone the project locally (fast, no network) into a separate temp
# dir, then move just the .git into $Dest. The fake package.json
# stays because git clone --no-checkout doesn't write the working
# tree.
$tmpClone = Join-Path $env:TEMP "ccw-up-to-date-clone-$(Get-Random)"
$cloneOk = $true
# Git writes "Cloning into ..." to stderr; with
# `$ErrorActionPreference = 'Stop'` (set at top of file) that
# becomes a terminating error record and trips the catch below.
# Temporarily silence error action for the clone call only.
$oldEAP = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
try {
  & git clone --depth 1 -b main --no-checkout 'C:\Users\arsas\AntigravityProjects\claude-code-router' $tmpClone 2>$null
  if ($LASTEXITCODE -ne 0) { $cloneOk = $false }
} finally {
  $ErrorActionPreference = $oldEAP
}
if (-not $cloneOk) {
  Write-Host "  [skip] local clone failed; cannot test up-to-date path"
  if (Test-Path $tmpClone) { Remove-Item -Recurse -Force $tmpClone }
  if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
  exit 0
}
Move-Item -Path (Join-Path $tmpClone '.git') -Destination (Join-Path $Dest '.git')
Remove-Item -Recurse -Force $tmpClone

# Sanity: confirm the local HEAD we just cloned matches the remote
# HEAD the installer will compare against. If not, the test isn't
# actually exercising the up-to-date path.
$oldEAP = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
$localHead = (& git -C $Dest rev-parse --short HEAD 2>$null) -join ''
$remoteHead = ''
try {
  $out = (& git ls-remote --heads origin main 2>$null)
  if ($out) {
    $first = ($out -split "`n")[0]
    if ($first -and $first.Length -ge 7) {
      $remoteHead = $first.Substring(0, 7)
    }
  }
} catch {}
$ErrorActionPreference = $oldEAP
if (-not $localHead -or -not $remoteHead -or $localHead -ne $remoteHead) {
  Write-Host "  [skip] local HEAD ($localHead) != origin/main ($remoteHead); not actually up-to-date"
  if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
  exit 0
}

# Reset $RebuildNeeded before running.
$script:RebuildNeeded = $true

Write-Host "TEST: Install-Source on an up-to-date install"
Write-Host "  Dest=$Dest"
$outFile = Join-Path $env:TEMP "ccw-install-output.txt"
$buildFile = Join-Path $env:TEMP "ccw-build-output.txt"
# Redirect to file (NOT `... | Tee-Object`) so Install-Source runs
# in the current scope and $RebuildNeeded changes are visible to
# the checks below. A pipeline forks a subshell for the LHS, which
# would isolate the variable write.
Install-Source *> $outFile
Get-Content $outFile
Write-Host ""

Write-Host "POST-RUN STATE:"
$output = Get-Content $outFile -Raw

if ($output -match 'Already up to date') {
  Write-Host "  [ok] Install-Source reported already up to date"
} else {
  Write-Host "  [fail] Install-Source did not report 'Already up to date'"
  exit 1
}

if ($output -match 'Cloning') {
  Write-Host "  [fail] Install-Source unexpectedly cloned (should be a no-op)"
  exit 1
} else {
  Write-Host "  [ok] Install-Source did not clone (no-op)"
}

if (-not $RebuildNeeded) {
  Write-Host "  [ok] RebuildNeeded=\$false (caller can skip Build-Source)"
} else {
  Write-Host "  [fail] RebuildNeeded=\$true (expected \$false)"
  exit 1
}

# Build-Source should be a no-op when RebuildNeeded=$false. We
# redirect its output to a file (Write-Host goes to the host, not
# the success stream, so `$x = Build-Source` would capture nothing).
Build-Source *> $buildFile
$buildOut = Get-Content $buildFile -Raw
if ($buildOut -match 'Skipping pnpm install') {
  Write-Host "  [ok] Build-Source skipped pnpm install + build"
} else {
  Write-Host "  [fail] Build-Source did not skip pnpm install"
  exit 1
}

# Cleanup
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
if (Test-Path $outFile) { Remove-Item -Force $outFile }
if (Test-Path $buildFile) { Remove-Item -Force $buildFile }
Write-Host ""
Write-Host "TEST PASSED"
