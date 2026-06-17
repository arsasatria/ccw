# Windows Installer Fix — Design

**Date:** 2026-06-17
**Status:** Approved (brainstorming complete)
**Related:** #186 (user-reported Windows installer broken)

## Goal

Make `install.ps1` complete the full install → ready-to-use pipeline on Windows without manual intervention:

1. Pre-flight checks succeed with clear errors (no cryptic failures).
2. The `ccw` shim is callable from any new terminal (PATH + global shim both verified).
3. The local gateway service is running by the time the installer exits.
4. The user is dropped into a new terminal with `ccw ui` already launching (which auto-opens the browser).

`install.sh` and application code are out of scope.

## Motivation

User reported 3 distinct symptoms when running the existing `install.ps1`:

1. **Install fails with error** — most likely cause: no `git` pre-flight check. The script calls `git clone` at `install.ps1:93` but never verifies `git` is installed, unlike `node` and `pnpm` which have `Test-Node`/`Test-Pnpm`. On a clean Windows box without Git for Windows, `git clone` exits with a cryptic error.
2. **Install succeeds, but `ccw` is not recognized** — `Install-GlobalShim` (line 127-153) tries to drop a second copy of the shim in `%APPDATA%\npm` or `Microsoft\WindowsApps`. The latter is AppLocker-protected; on most systems it is not user-writable. The script's `catch {}` block at line 148 swallows the failure silently — the user is told "[ok]" indirectly via the next step, but the shim was never written. The fallback is `Add-To-Path` (line 155-166), which updates user-level env but does not affect the current terminal. The user has to open a new terminal manually.
3. **Install succeeds, `ccw` is recognized, but service does not start** — the installer builds and installs, but never spawns `ccw start`. The user has to discover and run it themselves. `ccw code`/`ccw ui` auto-spawn the service (cli.ts:237-267, 352-389, 390+), so a `ccw ui` invocation from a new terminal works — but the user has to type it.

The fix is a set of 5 small, coordinated changes to `install.ps1` that make the install → ready-to-use pipeline complete without manual steps.

## Architecture

All changes are local to `install.ps1`. The flow becomes:

```
Banner
  ↓
Test-Node → Test-Pnpm → Test-Git           (NEW: Test-Git)
  ↓
Install-Source (clone or pull)
  ↓
Build-Source (pnpm install + pnpm build)
  ↓
Install-Shim (write ccw.cmd)
  ↓
Install-GlobalShim (try %APPDATA%\npm, then WindowsApps; log per-attempt)   (CHANGED: no silent fail)
  ↓
Test-Shim                                (NEW: validate $Dest\ccw.cmd --version exits 0)
  ↓
Add-To-Path (user PATH update + current session $env:Path)
  ↓
Start-ServiceAsync                       (NEW: Start-Process node cli.js start, poll port 15s)
  ↓
Open-NewTerminal                         (NEW: Start-Process cmd /k "ccw ui")
  ↓
"ccw installed. Service running. UI opening in new terminal."
```

The 5 changes are independent in code but coordinated in flow: each later step assumes the prior one succeeded.

## Components

### 1. `Test-Git` pre-flight

Add a third pre-flight check, parallel to `Test-Node` and `Test-Pnpm`:

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

Wire into the main flow: after `Test-Pnpm` at line 171.

**Why this matters:** `git clone` at line 93 has no fallback. On a Windows box without Git for Windows, the user sees a raw `git : The term 'git' is not recognized` error. This check provides an actionable message before any work begins.

### 2. `Install-GlobalShim` — no silent fail

Current code (line 127-153) uses `Test-Path` to filter candidates before the loop, then has a `catch {}` that swallows the error. Change to: include `WindowsApps` as a candidate unconditionally (it always exists on Win10+), and log per-attempt failure with the actual exception message.

```powershell
function Install-GlobalShim {
  $globalShim = "@echo off`r`nnode `"$Dest\packages\cli\dist\cli.js`" %*"

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
}
```

**Behavioral diff:**
- Before: filter `$candidates` with `Test-Path`, so `WindowsApps` is excluded on systems where `Test-Path` returns false (e.g. when `$env:LOCALAPPDATA` is unset or has odd casing). The loop then iterates a smaller set, and the `catch {}` swallows failures.
- After: include `WindowsApps` unconditionally (it always exists on supported Windows versions). Log per-attempt failure so the user knows whether the shim was placed. The final "no writable dir" line still fires as a fallback signal.

### 3. `Test-Shim` post-install

Add a verification step that actually runs the shim:

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

Wire into the main flow: after `Install-GlobalShim` and before `Add-To-Path`. If `Test-Shim` returns false, the installer continues (we don't want a missing config to block install), but logs the failure so the user knows the shim didn't work.

**Why not exit on failure:** The shim might fail because `~/.ccw/config.json` doesn't exist yet (a fresh install won't have one until the user runs `ccw model` or the UI). The shim itself (the `.cmd` file) is correct in that case — the issue is downstream. We log and continue.

### 4. `Start-ServiceAsync`

Spawn the local gateway service and wait for it to be reachable on its port.

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

  # Resolve port from config (default 3456, matches cli.ts:127)
  $port = 3456
  $configPath = Join-Path $env:USERPROFILE '.ccw\config.json'
  if (Test-Path $configPath) {
    try {
      $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
      if ($cfg.PORT) { $port = [int]$cfg.PORT }
    } catch { /* fall back to default */ }
  }

  # Poll port using TcpClient (mirrors isPortListening in cli.ts:103)
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

Wire into the main flow: after `Add-To-Path` (which ensures the user PATH is updated; the current installer session's `$env:Path` was also updated at line 164, so node is findable).

**Why `WindowStyle Hidden`:** the service writes its own logs to `~/.ccw/logs/` (via the pino logger wired in `cli.ts`); a hidden window is appropriate. The user can inspect logs manually if startup fails.

**Why poll 15s:** the first run has cold-start cost (config read, plugin/transformer load). The existing `waitForService` in `cli.ts:134-162` uses 30s, but that runs after a `code`/`ui` invocation that the user expects to be quick. For an installer context, 15s is a reasonable ceiling — if the service hasn't bound its port by then, something is genuinely wrong (port conflict, plugin error).

**Why TcpClient instead of `Test-NetConnection`:** `Test-NetConnection` has ~1s overhead per call and is verbose. TcpClient with a 500ms wait matches the pattern in `cli.ts:103-116` and polls faster.

### 5. `Open-NewTerminal`

Open a new `cmd` window with `ccw ui` already typed, so the user lands in a usable terminal without copy-paste.

```powershell
function Open-NewTerminal {
  Write-Host '  [..] Opening new terminal with ccw ui...'
  try {
    Start-Process -FilePath 'cmd' -ArgumentList '/k', 'ccw ui'
    Write-Host '  [ok] New terminal opened (ccw ui will auto-start the UI in your browser)'
  } catch {
    Write-Host "  [fail] Could not open new terminal: $_" -ForegroundColor Red
    Write-Host '  Open a new terminal manually and run: ccw ui' -ForegroundColor Yellow
  }
}
```

Wire into the main flow: at the very end, after `Start-ServiceAsync`.

**Why `ccw ui` and not `ccw code`:** `ccw ui` opens the web UI in the browser, which is the natural next step for a fresh install (add providers, pick models). `ccw code` is a CLI command for running Claude Code with a prompt, which requires a provider to be configured first. `ccw ui` handles both: if the service isn't running, it auto-spawns it (cli.ts:390+); if it is running, it just opens the browser.

**Why `cmd /k` instead of `powershell -NoExit`:** `cmd /k` is universally available on Windows (even on stripped-down installs), and `ccw.cmd` (the shim) is a batch file that just calls node. Running it under `cmd` is consistent with the shim's runtime.

**Why not refresh PATH in the new terminal automatically:** `cmd /k "ccw ui"` — when the new `cmd` process starts, it inherits the parent's env, which includes the `Add-To-Path` update at line 164 (`$env:Path = "$env:Path;$Dest"`). Even if the user-level PATH update hasn't propagated, the current session's PATH is in the child process. So `ccw ui` resolves in the new terminal.

## Data Flow

### Scenario A — Fresh install, clean Windows box (target use case)

```
User runs: irm https://.../install.ps1 | iex
  ↓
Test-Node: ok (Node 20+)
Test-Pnpm: ok (corepack enabled pnpm 9.15.0)
Test-Git: ok (Git for Windows installed)
  ↓
Install-Source: clones to $env:LOCALAPPDATA\Programs\ccw
  ↓
Build-Source: pnpm install (60-120s on first run) + pnpm build (10-30s)
  ↓
Install-Shim: writes $Dest\ccw.cmd
  ↓
Install-GlobalShim: tries %APPDATA%\npm (may not exist on fresh box) → skip
                    tries WindowsApps → skip (AppLocker)
                    → "no writable PATH dir; rely on Add-To-Path"
  ↓
Test-Shim: $Dest\ccw.cmd --version → ok (prints version)
  ↓
Add-To-Path: updates user PATH + current session $env:Path
  ↓
Start-ServiceAsync: spawns node cli.js start (WindowStyle Hidden)
                    polls 127.0.0.1:3456 every 1s
                    on first run, port opens at ~3s → "Service running on port 3456"
  ↓
Open-NewTerminal: Start-Process cmd /k "ccw ui"
                    → new cmd window opens, runs ccw ui
                    → ccw ui auto-detects service already running, opens browser
  ↓
Installer exits with green "ccw installed. Service running. UI opening in new terminal."
  ✅ zero manual steps
```

### Scenario B — git missing

```
User runs: irm | iex
  ↓
Test-Node: ok
Test-Pnpm: ok
Test-Git: FAIL → "git not found. Install Git for Windows from https://..."
              exit 1
  ↓
Installer exits before any cloning, before any build.
  ✅ no wasted time, no cryptic error
```

### Scenario C — service won't start (port conflict)

```
... (Test-Node, Test-Pnpm, Test-Git, Install-Source, Build-Source, Install-Shim, Test-Shim, Add-To-Path all ok)
  ↓
Start-ServiceAsync: spawns node cli.js start
                    polls port for 15s — never opens (port already bound by something else)
                    → "Service did not start within 15s. Check ~/.ccw/logs/ for details."
                    returns $false (does not exit)
  ↓
Open-NewTerminal: still opens (ccw ui will surface the actual port conflict in browser)
  ↓
Installer exits with: "ccw installed. Service may not have started. Open new terminal and run 'ccw status' to diagnose."
  ✅ user gets actionable next step
```

### Scenario D — shim broken (Node not on PATH, dist missing)

```
... (everything up to Install-Shim ok)
  ↓
Test-Shim: $Dest\ccw.cmd --version
           → "shim exited with code 1. Check that Node 20+ is on PATH and cli.js exists."
           returns $false
  ↓
Installer continues to Add-To-Path, Start-ServiceAsync, Open-NewTerminal
  ↓
Service starts (Start-Process uses full path to node), new terminal opens ccw ui
  → browser shows "ccw is running, configure your first provider"
  → shim may still be broken; user has to fix separately
  ✅ service still works via full path; user is informed
```

## Error Handling

| Scenario | Before | After |
|----------|--------|-------|
| `git` not installed | `git clone` exits with raw `git : The term 'git' is not recognized` | `Test-Git` exit 1 with link to download Git for Windows |
| `WindowsApps` not writable | `catch {}` silent skip; user not informed | Logged with `Exception.Message` per candidate |
| Shim runs but exits non-zero | Not detected until user runs `ccw` and gets cryptic error | `Test-Shim` logs the issue, installer continues with diagnosis |
| Service won't start (port conflict, plugin error) | Not detected; user has to discover | `Start-ServiceAsync` polls 15s, logs timeout with `~/.ccw/logs/` reference |
| User doesn't open new terminal | `ccw` not found | `Open-NewTerminal` opens automatically |
| `node` not on PATH of the spawn process | Service won't start (Start-Process uses bare `node`) | `Test-Node` is the first check; if it passed, `node` is on PATH |

### Mitigations

- `Test-Git` runs before any expensive step. No wasted build time on missing prerequisite.
- `Test-Shim` is non-fatal: a broken shim doesn't block the service from starting. The user can fix the shim later.
- `Start-ServiceAsync` is non-fatal: if the service fails to start, the installer still completes and tells the user what to do.
- `Open-NewTerminal` is wrapped in try/catch: if `Start-Process` fails (rare on Windows), the user gets a manual instruction.
- The 15s polling ceiling prevents the installer from hanging on a service that never starts.

## Testing

Manual end-to-end (PowerShell is impractical to unit-test in a cross-platform CI):

1. **Clean Windows VM, no Git for Windows** — installer exits at `Test-Git` with clear error. Verifies change #1.
2. **Clean Windows VM with Git, no npm, WindowsApps AppLocker-active** — `Install-GlobalShim` logs per-candidate skip with reason. `Add-To-Path` succeeds. Verifies change #2.
3. **Clean Windows VM with Git + Node + npm, fresh $Dest** — full happy path. `Test-Shim` returns ok. `Start-ServiceAsync` reports port open within 15s. `Open-NewTerminal` opens cmd with `ccw ui`. Verifies changes #3, #4, #5.
4. **Re-run installer** (existing $Dest with .git) — `Install-Source` fast-forwards or re-clones. No duplicate service. Verifies idempotency.
5. **Port 3456 already bound** (run `node -e "require('net').createServer().listen(3456)"` first) — `Start-ServiceAsync` polls 15s, times out, logs "Service did not start". `Open-NewTerminal` still opens. Verifies failure path of change #4.
6. **Windows PowerShell 5.1 vs PowerShell 7+** — run the installer from each. Both should work (script uses only `Get-Command`, `Start-Process`, `Set-Content`, `[System.Net.Sockets.TcpClient]`, all available in both).
7. **Edge case: `$env:LOCALAPPDATA` contains spaces** (unusual but possible) — `Join-Path` handles this; `Start-Process` argument quoting handles this; verified by the existing shim path which already does `"%~dp0packages\cli\dist\cli.js"`.

## Out of Scope (YAGNI)

- Cross-platform Node.js installer (`install.mjs`). The current shell scripts work; rewriting is a separate decision.
- Windows Service / scheduled task for auto-start at boot. Current `ccw start` manual or auto-via-`ccw code`/`ccw ui` is sufficient for the install → ready-to-use moment.
- Richer logging. The pino logger at `~/.ccw/logs/` is already comprehensive; installer doesn't need to duplicate.
- Changes to `install.sh`. Not reported as broken; behavior is the parallel of `install.ps1` for Mac/Linux.
- Changes to `cli.ts`. The spawn logic at `cli.ts:237-267` and `cli.ts:352-389` is already correct.
- Tapping into the existing `waitForService` in `cli.ts:134-162`. Polling port directly from the installer is simpler and doesn't require the installer to depend on a built artifact's helper function.
- Verifying the new terminal actually launched. If `Start-Process` returns without throwing, the OS has accepted the request. Visual confirmation is the user's job.

## Implementation Estimate

- `Test-Git` — ~10 lines
- `Install-GlobalShim` change — ~5 lines modified (replace `Test-Path` filter, change catch logging)
- `Test-Shim` — ~12 lines
- `Start-ServiceAsync` — ~30 lines
- `Open-NewTerminal` — ~8 lines
- Wire into main flow — ~5 lines added at the call sites
- Total: ~70 lines added to `install.ps1`
- 1 commit
