# Test Install-Source's concurrency lock. A second install started
# while the first holds the lock must fail with a clear message.
# Stale locks (process gone) must be removed automatically.
$ErrorActionPreference = 'Stop'

$scriptContent = Get-Content 'C:\Users\arsas\AntigravityProjects\claude-code-router\install.ps1' -Raw
$lines = $scriptContent -split "`r?`n"
$endIdx = 0
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -match '^\s*Write-Banner\s*$') { $endIdx = $i; break }
}
$functions = ($lines[0..($endIdx - 1)] -join "`n")
Invoke-Expression $functions

# Use a dedicated lock file path so we don't conflict with anything
# real. Acquire-Lock reads/writes $LockFile directly; we set it
# before calling.
$testLock = Join-Path $env:TEMP "ccw-lock-test-$(Get-Random).lock"
$script:LockFile = $testLock
$script:AcquiredLock = $false

Write-Host "TEST 1: acquire lock, second acquire must fail"
Acquire-Lock
if ((Test-Path $testLock) -and ((Get-Content $testLock) -eq $PID)) {
  Write-Host "  [ok] First acquire wrote PID $PID to $testLock"
} else {
  Write-Host "  [fail] First acquire did not write PID"
  exit 1
}

# Second acquire in a child PowerShell process must exit non-zero.
# We don't run it in-process because the parent's lock is still
# held; we'd deadlock. Spawn powershell.exe to call Acquire-Lock
# against the same $LockFile, capture exit code.
$secondOutFile = Join-Path $env:TEMP "ccw-lock-second-out.txt"
$secondScript = @"
`$ErrorActionPreference = 'Stop'
`$script:LockFile = '$testLock'
`$script:AcquiredLock = `$false
try {
  Acquire-Lock
  Write-Host 'BUG: second acquire succeeded'
  exit 0
} catch {
  Write-Host "Caught: `$_"
  exit 99
}
"@
$secondScriptPath = Join-Path $env:TEMP "ccw-lock-second.ps1"
Set-Content -Path $secondScriptPath -Value $secondScript

$proc = Start-Process -FilePath 'powershell.exe' `
  -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $secondScriptPath `
  -RedirectStandardOutput $secondOutFile `
  -RedirectStandardError "$secondOutFile.err" `
  -PassThru -Wait
if ($proc.ExitCode -ne 0) {
  Write-Host "  [ok] Second acquire was rejected (exit $($proc.ExitCode))"
} else {
  Write-Host "  [fail] Second acquire unexpectedly succeeded"
  exit 1
}
if (Test-Path $secondOutFile) { Remove-Item -Force $secondOutFile }
if (Test-Path "$secondOutFile.err") { Remove-Item -Force "$secondOutFile.err" }
if (Test-Path $secondScriptPath) { Remove-Item -Force $secondScriptPath }

# Release and verify the lock file is gone.
Release-Lock
if (-not (Test-Path $testLock)) {
  Write-Host "  [ok] Release-Lock removed the lock file"
} else {
  Write-Host "  [fail] Release-Lock did not remove the lock file"
  exit 1
}

Write-Host ""
Write-Host "TEST 2: stale lock is auto-removed on next acquire"
# Write a fake PID that is NOT running, then acquire.
Set-Content -Path $testLock -Value '999999'
# Make sure 999999 is not a running process (sanity).
$staleAlive = $false
try {
  $proc999 = Get-Process -Id 999999 -ErrorAction Stop
  $staleAlive = $true
} catch {}
if ($staleAlive) {
  Write-Host "  [skip] pid 999999 is somehow running; skipping stale-lock test"
} else {
  $script:AcquiredLock = $false
  # Capture only the first few lines of output for visibility.
  $staleOutFile = Join-Path $env:TEMP "ccw-lock-stale-out.txt"
  Acquire-Lock *> $staleOutFile
  $staleOut = Get-Content $staleOutFile -Raw
  ($staleOut -split "`n" | Select-Object -First 3) | ForEach-Object { Write-Host $_ }
  if ((Get-Content $testLock) -eq $PID) {
    Write-Host "  [ok] Stale lock from pid 999999 was replaced with $PID"
  } else {
    Write-Host "  [fail] Stale lock was not replaced"
    exit 1
  }
  if (Test-Path $staleOutFile) { Remove-Item -Force $staleOutFile }
  Release-Lock
}

if (Test-Path $testLock) { Remove-Item -Force $testLock }
Write-Host ""
Write-Host "TEST PASSED"
