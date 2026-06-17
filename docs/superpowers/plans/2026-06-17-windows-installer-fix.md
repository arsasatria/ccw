# Windows Installer Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `install.ps1` complete the full install → ready-to-use pipeline on Windows — pre-flight checks pass with clear errors, the `ccw` shim is callable, the gateway service is running, and the user lands in a new terminal with `ccw ui` already launching.

**Architecture:** Five coordinated changes to `install.ps1` (no other files touched). The flow becomes: pre-flight (Node/pnpm/git) → clone/build → install shim → install global shim (with explicit per-candidate log) → verify shim → add to PATH → spawn service (poll port 15s) → open new terminal with `ccw ui`. Five commits, one per task.

**Tech Stack:** PowerShell 5.1+ (Windows PowerShell / PowerShell 7+), `System.Net.Sockets.TcpClient` for port polling, no new dependencies.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `install.ps1` | Modify (5 functions added/modified, main flow wired) | Windows installer — clone, build, drop shim, add PATH, start service, open terminal |

No new files. No new tests (PowerShell installer is end-to-end tested manually on a Windows VM, see "Manual verification" steps).

---

## Task 1: Add `Test-Git` pre-flight check

**Files:**
- Modify: `install.ps1:170-178` (main flow, after `Test-Pnpm`)
- Modify: `install.ps1:48-66` (insert `Test-Git` after `Test-Pnpm`)

- [ ] **Step 1: Add the `Test-Git` function**

Insert the following function immediately after the closing `}` of `Test-Pnpm` (currently at line 66):

```powershell
function Test-Git {
  if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Host "  [ok] git $(& git --version)"
    return
  }
  Write-Host '  [fail] git not found. Install Git for Windows from https://git-scm.com/download/win' -ForegroundColor Red
  exit 1
}
```

- [ ] **Step 2: Wire `Test-Git` into the main flow**

Replace the existing `Test-Pnpm` call at line 171 with both calls:

```powershell
Test-Node
Test-Pnpm
Test-Git
```

The new line for `Test-Git` is added immediately after the `Test-Pnpm` call.

- [ ] **Step 3: Syntax-check the script**

Run:
```bash
powershell -NoProfile -Command "[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw 'install.ps1'), [ref]$null) | Out-Null; 'OK'"
```

Expected output: `OK`

If the script has a parse error, PowerShell will print a red error message. Fix the syntax issue and re-run.

- [ ] **Step 4: Manual verification (only on a Windows box without `git`)**

Temporarily rename `git` on PATH and run:
```bash
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
```

Expected output:
- `[fail] git not found. Install Git for Windows from https://git-scm.com/download/win`
- Exit code `1`

If you can't test without `git`, skip this step and verify the `Test-Git` function appears in the script and the main flow calls it.

- [ ] **Step 5: Commit**

```bash
git add install.ps1
git commit -m "fix(install): add Test-Git pre-flight check for Windows installer"
```

---

## Task 2: Make `Install-GlobalShim` not silent-fail

**Files:**
- Modify: `install.ps1:127-153` (rewrite the function body, keep the signature)

- [ ] **Step 1: Rewrite the `Install-GlobalShim` function body**

Replace the body of `Install-GlobalShim` (everything between the function declaration and the final `}`) with:

```powershell
  $globalShim = @"
@echo off
node "$Dest\packages\cli\dist\cli.js" %*
"@

  $candidates = @()
  $npmDir = Join-Path $env:APPDATA 'npm'
  if (Test-Path $npmDir) { $candidates += @{ Dir = $npmDir; Reason = 'npm global' } }
  $winApps = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps'
  $candidates += @{ Dir = $winApps; Reason = 'WindowsApps' }

  foreach ($c in $candidates) {
    $target = Join-Path $c.Dir $ShimName
    try {
      Set-Content -Path $target -Value $globalShim -Encoding ASCII -ErrorAction Stop
      Write-Host "  [ok] Global shim at $target ($($c.Reason), already on PATH)"
      return
    } catch {
      Write-Host "  [skip] $target not writable: $($_.Exception.Message)" -ForegroundColor DarkGray
    }
  }
  Write-Host "  [skip] No writable PATH dir found; rely on Add-To-Path below (open new terminal)."
```

Key changes from the original:
- Removed `if (Test-Path $winApps) { ... }` filter so `WindowsApps` is always tried.
- Changed `Set-Content` to use `-ErrorAction Stop` so the catch block fires.
- Added per-candidate skip log with the exception message.

- [ ] **Step 2: Syntax-check the script**

Run:
```bash
powershell -NoProfile -Command "[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw 'install.ps1'), [ref]$null) | Out-Null; 'OK'"
```

Expected output: `OK`

- [ ] **Step 3: Manual verification (only on a Windows box where `WindowsApps` is not writable)**

Run the full installer. Expected output (assuming `%APPDATA%\npm` doesn't exist and `WindowsApps` is AppLocker-protected):
```
  [skip] C:\Users\<user>\AppData\Local\Microsoft\WindowsApps\ccw.cmd not writable: Access to the path '...' is denied.
  [skip] No writable PATH dir found; rely on Add-To-Path below (open new terminal).
```

If both candidates are writable, you'll see `[ok] Global shim at ...` instead — that's also correct.

- [ ] **Step 4: Commit**

```bash
git add install.ps1
git commit -m "fix(install): log per-candidate failure in Install-GlobalShim, stop swallowing errors"
```

---

## Task 3: Add `Test-Shim` post-install verification

**Files:**
- Modify: `install.ps1:115-122` (insert `Test-Shim` after `Install-Shim`)
- Modify: `install.ps1:174-178` (wire into main flow)

- [ ] **Step 1: Add the `Test-Shim` function**

Insert the following function immediately after the closing `}` of `Install-Shim` (currently at line 122):

```powershell
function Test-Shim {
  $shimPath = Join-Path $Dest $ShimName
  try {
    $output = & $shimPath --version 2>&1
    if ($LASTEXITCODE -eq 0) {
      Write-Host "  [ok] shim works: ccw --version -> $output"
      return $true
    }
    Write-Host "  [fail] shim exited with code $LASTEXITCODE. Check that Node 20+ is on PATH and $Dest\packages\cli\dist\cli.js exists." -ForegroundColor Red
  } catch {
    Write-Host "  [fail] shim not executable: $_" -ForegroundColor Red
  }
  return $false
}
```

- [ ] **Step 2: Wire `Test-Shim` into the main flow**

After the `Install-GlobalShim` call in the main flow (currently at line 177), add:

```powershell
Test-Shim
```

- [ ] **Step 3: Syntax-check the script**

Run:
```bash
powershell -NoProfile -Command "[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw 'install.ps1'), [ref]$null) | Out-Null; 'OK'"
```

Expected output: `OK`

- [ ] **Step 4: Manual verification (on the Windows box where you'll actually run the installer)**

Run the full installer. After `Install-GlobalShim`, expected output:
```
  [ok] shim works: ccw --version -> 2.1.0
```

(or whatever the current version in `packages/cli/package.json` is)

If the shim fails, you'll see `[fail]` with diagnosis — that means something is wrong with the build or shim, and the install should not be considered complete.

- [ ] **Step 5: Commit**

```bash
git add install.ps1
git commit -m "fix(install): add Test-Shim post-install verification"
```

---

## Task 4: Add `Start-ServiceAsync` for auto-spawning the gateway

**Files:**
- Modify: `install.ps1:155-166` (insert `Start-ServiceAsync` after `Add-To-Path`)

- [ ] **Step 1: Add the `Start-ServiceAsync` function**

Insert the following function immediately after the closing `}` of `Add-To-Path` (currently at line 166):

```powershell
function Start-ServiceAsync {
  $cliPath = Join-Path $Dest 'packages\cli\dist\cli.js'
  if (-not (Test-Path $cliPath)) {
    Write-Host "  [skip] $cliPath not found, cannot start service" -ForegroundColor Yellow
    return $false
  }

  Write-Host '  [..] Starting ccw service...'
  try {
    Start-Process -FilePath 'node' -ArgumentList "`"$cliPath`" start" -WindowStyle Hidden
  } catch {
    Write-Host "  [fail] Start-Process failed: $_" -ForegroundColor Red
    return $false
  }

  $port = 3456
  $configPath = Join-Path $env:USERPROFILE '.ccw\config.json'
  if (Test-Path $configPath) {
    try {
      $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
      if ($cfg.PORT) { $port = [int]$cfg.PORT }
    } catch { /* fall back to default */ }
  }

  $maxWait = 15
  $elapsed = 0
  while ($elapsed -lt $maxWait) {
    Start-Sleep -Seconds 1
    $elapsed++
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $iar = $client.BeginConnect('127.0.0.1', $port, $null, $null)
      if ($iar.AsyncWaitHandle.WaitOne(500, $false)) {
        $client.EndConnect($iar)
        $client.Close()
        Write-Host "  [ok] Service running on port $port"
        return $true
      }
      $client.Close()
    } catch { /* port not yet listening, keep polling */ }
  }
  Write-Host "  [fail] Service did not start within ${maxWait}s. Check ~/.ccw/logs/ for details." -ForegroundColor Red
  return $false
}
```

- [ ] **Step 2: Wire `Start-ServiceAsync` into the main flow**

After the `Add-To-Path` call in the main flow (currently at line 178), add:

```powershell
Start-ServiceAsync
```

- [ ] **Step 3: Syntax-check the script**

Run:
```bash
powershell -NoProfile -Command "[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw 'install.ps1'), [ref]$null) | Out-Null; 'OK'"
```

Expected output: `OK`

- [ ] **Step 4: Manual verification (on the Windows box where you'll actually run the installer)**

Run the full installer. After `Add-To-Path`, expected output:
```
  [..] Starting ccw service...
  [ok] Service running on port 3456
```

To verify the service is actually accepting requests, in another terminal run:
```bash
powershell -NoProfile -Command "Invoke-WebRequest -Uri 'http://127.0.0.1:3456/' -UseBasicParsing | Select-Object -ExpandProperty StatusCode"
```

Expected output: a status code (200 or 404 — both indicate the server is up).

To test the failure path, bind port 3456 first:
```bash
powershell -NoProfile -Command "node -e \"require('net').createServer().listen(3456)\""
```

Then re-run the installer. Expected output:
```
  [..] Starting ccw service...
  [fail] Service did not start within 15s. Check ~/.ccw/logs/ for details.
```

- [ ] **Step 5: Commit**

```bash
git add install.ps1
git commit -m "feat(install): auto-spawn ccw service and verify port is listening"
```

---

## Task 5: Add `Open-NewTerminal` to drop the user into a usable terminal

**Files:**
- Modify: `install.ps1:155-189` (insert `Open-NewTerminal` after `Start-ServiceAsync`, and add to main flow)

- [ ] **Step 1: Add the `Open-NewTerminal` function**

Insert the following function immediately after the closing `}` of `Start-ServiceAsync`:

```powershell
function Open-NewTerminal {
  Write-Host '  [..] Opening new terminal with ccw ui...'
  try {
    Start-Process -FilePath 'cmd' -ArgumentList '/k', 'ccw ui'
    Write-Host '  [ok] New terminal opened (ccw ui will open the UI in your browser)'
  } catch {
    Write-Host "  [fail] Could not open new terminal: $_" -ForegroundColor Red
    Write-Host '  Open a new terminal manually and run: ccw ui' -ForegroundColor Yellow
  }
}
```

- [ ] **Step 2: Wire `Open-NewTerminal` into the main flow**

After the `Start-ServiceAsync` call (added in Task 4), add:

```powershell
Open-NewTerminal
```

The main flow should now end with: `... Add-To-Path; Start-ServiceAsync; Open-NewTerminal`.

- [ ] **Step 3: Update the final installer message**

Replace the final `Write-Host` block (lines 180-190) with the updated version that reflects the new auto-start behavior:

```powershell
Write-Host ''
Write-Host 'ccw installed.' -ForegroundColor Green
Write-Host "  Source: $Dest"
Write-Host "  Binary: $Dest\packages\cli\dist\cli.js"
Write-Host "  Local shim:   $Dest\$ShimName"
Write-Host ''
Write-Host 'A new terminal has been opened with ccw ui.' -ForegroundColor Cyan
Write-Host 'If it did not open, run ccw ui in a new terminal.' -ForegroundColor DarkGray
Write-Host ''
```

- [ ] **Step 4: Syntax-check the script**

Run:
```bash
powershell -NoProfile -Command "[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw 'install.ps1'), [ref]$null) | Out-Null; 'OK'"
```

Expected output: `OK`

- [ ] **Step 5: Manual verification (on the Windows box where you'll actually run the installer)**

Run the full installer. After `Start-ServiceAsync` reports `Service running on port 3456`, expected output:
```
  [..] Opening new terminal with ccw ui...
  [ok] New terminal opened (ccw ui will open the UI in your browser)

ccw installed.
  Source: C:\Users\<user>\AppData\Local\Programs\ccw
  Binary: C:\Users\<user>\AppData\Local\Programs\ccw\packages\cli\dist\cli.js
  Local shim:   C:\Users\<user>\AppData\Local\Programs\ccw\ccw.cmd

A new terminal has been opened with ccw ui.
If it did not open, run ccw ui in a new terminal.
```

A new `cmd` window should pop up. Inside it, `ccw ui` runs and the browser opens to the web UI (typically `http://127.0.0.1:3456/`).

- [ ] **Step 6: Commit**

```bash
git add install.ps1
git commit -m "feat(install): open new terminal with ccw ui after install completes"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|--------------|------|
| Test-Git pre-flight | Task 1 |
| Install-GlobalShim no-silent-fail | Task 2 |
| Test-Shim post-install | Task 3 |
| Start-ServiceAsync (poll port 15s) | Task 4 |
| Open-NewTerminal (cmd /k "ccw ui") | Task 5 |
| Wire into main flow | Tasks 1, 3, 4, 5 (Step 2 of each) |
| Update final message | Task 5 Step 3 |
| Manual verification on Windows | Each task's "Manual verification" step |

All spec requirements covered. No gaps.

**2. Placeholder scan:** No "TBD", "TODO", or "implement later". Every step has actual code. No "similar to Task N" references — each task is self-contained.

**3. Type consistency:**
- `$Dest` and `$ShimName` are defined at lines 22-23 and used consistently across all new functions.
- `$cliPath` is computed once in `Start-ServiceAsync` and used in the `Start-Process` call.
- Port default `3456` matches `cli.ts:127` (`config.PORT || 3456`).
- TcpClient polling pattern matches `isPortListening` in `cli.ts:103-116`.
- `Start-Process` argument quoting uses backticks for inner double-quotes, consistent with the existing `Install-Shim` function.

**4. Granularity check:** Each task is a single function add (or modify) + wire into main flow + syntax check + commit. Manual verification is a separate step the user runs on their Windows box. This matches the 2-5 minute per-step target.

**5. Commit count:** 5 commits, one per task. Per-task commits make it easy to bisect if any single change misbehaves.

**6. Total impact:** 1 file modified, ~110 lines added (a bit more than the spec's ~70 estimate because the plan includes the full functions verbatim, not pseudocode).
