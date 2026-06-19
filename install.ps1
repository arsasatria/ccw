# CCW installer for Windows (PowerShell)
# Claude Code Wrapper — https://github.com/arsasatria/ccw
#
# One-line install:
#   irm https://raw.githubusercontent.com/arsasatria/ccw/main/install.ps1 | iex
#
# Re-running is safe and acts as an updater:
#   - If an install already exists at the same commit, the installer
#     skips the build (idempotent no-op).
#   - If a newer commit is on origin, it pulls + rebuilds.
#   - If -Reinstall is passed, the existing tree is backed up and
#     replaced with a fresh clone.
#   - If git pull fails for any reason, the existing tree is backed up
#     and replaced with a fresh clone (no data loss).
#   - A PID-based lock file prevents two installs from running at once.
#
# What it does:
#   1. Verifies Node.js >= 20, git, pnpm (via corepack)
#   2. Detects existing install (version + commit) and compares to remote
#   3. Clones / updates / reinstalls the source repo as needed
#   4. Runs pnpm install (with fallback if lockfile drifted) + pnpm rebuild
#   5. Runs pnpm build
#   6. Drops a ccw.cmd shim that invokes the built binary
#   7. Tries to drop a global shim in a PATH-on dir (%APPDATA%\npm, WindowsApps)
#   8. Verifies the shim works by running ccw --version
#   9. Adds the install dir to the user PATH if it isn't already
#  10. Auto-spawns the ccw gateway service and verifies the port is listening
#  11. Opens a new terminal with ccw ui (which opens the browser)
#
# Flags:
#   -Reinstall   Force a clean reinstall (back up + re-clone + rebuild).
#   -Help        Show usage.
#
# Examples:
#   irm https://raw.githubusercontent.com/arsasatria/ccw/main/install.ps1 | iex
#   iex (irm https://raw.githubusercontent.com/arsasatria/ccw/main/install.ps1) ; .\ccw\install.ps1 -Reinstall

# IMPORTANT: we keep ErrorActionPreference = 'Stop' for script-level
# safety, but EVERY native command (git, pnpm, node) is invoked through
# Invoke-Native / Step-Run, which locally sets 'SilentlyContinue' and
# relies on $LASTEXITCODE. This avoids the classic PowerShell trap where
# 2>&1 turns esbuild/vite progress lines (written to stderr) into
# terminating NativeCommandError records — the original cause of the
# mysterious "pnpm build failed" with no detail.
$ErrorActionPreference = 'Stop'

$RepoOwner  = 'arsasatria'
$RepoName   = 'ccw'
$Branch     = 'main'
$RepoUrl    = "https://github.com/$RepoOwner/$RepoName"
# $env:LOCALAPPDATA is set on every default Windows user profile, but it
# can be missing in stripped-down shells (e.g. some service contexts). When
# it's null, Join-Path silently produces a relative path like
# 'Programs\ccw' — which would then be created in the current working
# directory. Fall back to a stable absolute path so the rest of the
# installer still works.
if (-not $env:LOCALAPPDATA) {
  if ($env:USERPROFILE) {
    $env:LOCALAPPDATA = Join-Path $env:USERPROFILE 'AppData\Local'
  } else {
    throw 'Both $env:LOCALAPPDATA and $env:USERPROFILE are unset. Cannot determine install location. Re-run from a normal user PowerShell session.'
  }
}
$Dest       = Join-Path $env:LOCALAPPDATA 'Programs\ccw'
$ShimName   = 'ccw.cmd'
$LockFile   = Join-Path $env:TEMP 'ccw-install.lock'
$AcquiredLock = $false
$ForceReinstall = $false
$RebuildNeeded = $true
# Per-run install log. Every wrapped command's combined output is
# written here so a failure can be diagnosed without re-running.
$LogDir  = Join-Path $env:USERPROFILE '.ccw\logs'
# Use Get-Date -Format (custom DateTime pattern), then plain string
# interpolation. -f in PowerShell 5.1 only supports standard numeric
# formats (N, F0, X, etc.), not custom DateTime format specifiers like
# yyyyMMdd-HHmmss.
$LogFile = Join-Path $LogDir ("install-$(Get-Date -Format 'yyyyMMdd-HHmmss')-$PID.log")

# --- color / animation helpers -----------------------------------------
# When output is redirected (e.g. tests capture `*> $file`, or piping
# to a file), we must NOT move the cursor or animate the spinner — the
# redirected stream would fill with \r and partial frames. We detect
# that with [Console]::IsOutputRedirected and degrade to plain lines.
$script:IsInteractive = -not [Console]::IsOutputRedirected
$script:CanColor = $true
try {
  $script:CanColor = -not [Console]::IsOutputRedirected -and ($null -ne $host.UI.RawUI)
} catch { $script:CanColor = $false }

function C($name) {
  if (-not $script:CanColor) { return '' }
  switch ($name) {
    'Reset' { return "`e[0m" }
    'Green' { return "`e[32m" }
    'Red'   { return "`e[31m" }
    'Cyan'  { return "`e[36m" }
    'Dim'   { return "`e[2m" }
    'Bold'  { return "`e[1m" }
    default { return '' }
  }
}

function Say($msg) { Write-Host $msg }
# NOTE: these format strings MUST be single-quoted. Double-quoted strings
# in PowerShell treat { and } as script-block / variable-name delimiters
# (e.g. `${var}`), so a literal "{0}✓{1}" inside "..." confuses the
# parser in 5.1. `-f` substitutes the placeholders, so no interpolation
# is needed.
function Ok($msg)  { Write-Host ('  {0}✓{1} {2}' -f (C Green), (C Reset), $msg) }
function Step-Info($msg) { Write-Host ('  {0}..{1} {2}' -f (C Dim), (C Reset), $msg) }
function Warn($msg) { Write-Host ('  {0}!{1} {2}' -f (C Cyan), (C Reset), $msg) -ForegroundColor Yellow }

function Fail($msg) {
  Write-Host ('  {0}✗ {1}{2}' -f (C Red), $msg, (C Reset)) -ForegroundColor Red
  throw $msg
}

function Write-Banner {
  Write-Host ''
  Write-Host ('  {0}CCW{1} · Claude Code Wrapper' -f (C Bold), (C Reset))
  Write-Host ('  {0}installer · github.com/{1}/{2}{3}' -f (C Dim), $RepoOwner, $RepoName, (C Reset))
  Write-Host ''
}

function Show-Usage {
  @"
Usage: powershell -File install.ps1 [-Reinstall] [-Help]

Options:
  -Reinstall   Force a clean reinstall. The existing $Dest is backed
                up to $Dest.bak.<timestamp> and replaced with a fresh
                clone. Use this if your install is in a bad state
                (broken build, wrong files) or to discard local
                source changes.
  -Help        Show this help.

Examples:
  irm https://raw.githubusercontent.com/arsasatria/ccw/main/install.ps1 | iex
  powershell -ExecutionPolicy Bypass -File install.ps1 -Reinstall
"@
}

function Parse-Args {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
  foreach ($a in $Args) {
    switch ($a) {
      '-Reinstall' { $script:ForceReinstall = $true }
      '-Help'      { Show-Usage; exit 0 }
      '--'         { continue }
      default      { Write-Host "  [warn] Unknown argument: $a (ignored)" -ForegroundColor Yellow }
    }
  }
}

# --- animated step runner ----------------------------------------------
# Step-Run <label> <workingDir> <command> [args...]
#
# Runs a (potentially long) native command with its combined stdout+stderr
# captured to $LogFile. In a real terminal it shows an animated spinner +
# label on a single line, updated in place; when the command finishes the
# line is replaced with either:
#     ✓ <label> — <elapsed>
# or, on failure, a ✗ line (the caller then calls Print-Diagnostic).
#
# When output is redirected, no animation happens — a plain `[..] <label>`
# line is printed first so logs/tests stay readable and greppable.
#
# The original install.ps1 ran `pnpm build 2>&1 | Tee-Object ...` under
# `$ErrorActionPreference='Stop'`. esbuild and vite write progress text to
# STDERR; PowerShell wraps every stderr line as a NativeCommandError record
# and, under 'Stop', turns the FIRST one into a terminating error — so the
# build aborted with an empty $buildOutput and the user saw "pnpm build
# failed" with no detail, even though the build actually succeeded.
# Step-Run sidesteps this entirely: it locally sets 'SilentlyContinue',
# never merges stderr into the success stream, and decides success purely
# from $LASTEXITCODE.
function Step-Run {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [string]$WorkingDir = '',
    [Parameter(Mandatory=$true)][string]$Command,
    [string[]]$CmdArgs = @()
  )
  # Ensure log dir exists before redirecting into it.
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $start = Get-Date

  # Per-step temp files for stdout/stderr. Using ProcessStartInfo file
  # redirection (not async event handlers) is dramatically more robust
  # across PowerShell 5.1/7 and avoids the deadlocks you get when
  # ReadToEnd() is called on a process that fills its pipe buffer.
  $stepOut = Join-Path $env:TEMP "ccw-step-out-$PID-$([guid]::NewGuid().ToString('N')).log"
  $stepErr = Join-Path $env:TEMP "ccw-step-err-$PID-$([guid]::NewGuid().ToString('N')).log"

  # Build the command line for cmd /c so PATH resolution and .cmd shims
  # (pnpm.cmd) work exactly like the old `& pnpm ...` calls. Each arg is
  # individually quoted with cmd's double-quote conventions, so paths
  # with spaces (e.g. `C:\Program Files\ccw`) survive intact.
  $quoted = New-Object System.Collections.Generic.List[string]
  $quoted.Add($Command)
  if ($CmdArgs) {
    foreach ($a in $CmdArgs) {
      if ($a -match '[\s&|<>^"]') {
        # cmd-style escape: double up embedded " and wrap in "..."
        $escaped = $a -replace '"', '""'
        $quoted.Add('"' + $escaped + '"')
      } else {
        $quoted.Add($a)
      }
    }
  }
  $argString = $quoted -join ' '

  # Build the ProcessStartInfo. We do NOT use .NET stream redirection
  # (RedirectStandardOutput/Error) — reading those synchronously
  # deadlocks when the child fills its pipe buffer, and reading them
  # asynchronously requires event handlers that are fragile in PS 5.1.
  # Instead we let cmd /c itself redirect to per-step temp files via
  # `> file 2> file`. The combined install log is assembled from those
  # files afterward. This is the simplest deadlock-free approach.
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $env:ComSpec
  # cmd /c "<cmd> <args>" > "out" 2> "err". Quote the command string so
  # paths/flags with spaces survive. $argString was already built above.
  $psi.Arguments = "/c $argString > `"$stepOut`" 2> `"$stepErr`""
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  if ($WorkingDir) { $psi.WorkingDirectory = $WorkingDir }

  # `new Process(ProcessStartInfo)` is not available on the .NET Framework
  # 4.x runtime PowerShell 5.1 ships against, so we instantiate empty and
  # assign StartInfo (the documented cross-version pattern).
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  # try/finally guarantees the process handle is released even if Start()
  # throws (e.g. cmd not on PATH) or if the polling loop aborts.
  try {
    $proc.Start() | Out-Null

    if ($script:IsInteractive) {
      $frames = @('⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏')
      $i = 0
      while (-not $proc.HasExited) {
        Write-Host ('{0}{1}{2} {3}' -f (C Cyan), $frames[$i % 10], (C Reset), $Label) -NoNewline
        $i++
        Start-Sleep -Milliseconds 100
      }
      Write-Host "`r`e[K" -NoNewline
    } else {
      Write-Host ("  [..] $Label")
      while (-not $proc.HasExited) { Start-Sleep -Milliseconds 100 }
    }
    $proc.WaitForExit()
    $exitCode = $proc.ExitCode
  } catch {
    # If process creation itself failed (e.g. ComSpec missing), record
    # a synthetic failure so diagnostics can fire.
    $exitCode = 127
    $stepErrContent = $_.Exception.Message
  } finally {
    try { $proc.Dispose() } catch {}
  }

  # Read the captured output. Guard each read: the files may not exist
  # if the process failed to start.
  $outContent = ''
  $errContent = ''
  if (Test-Path $stepOut) {
    try { $outContent = Get-Content $stepOut -Raw -ErrorAction SilentlyContinue } catch {}
  }
  if (Test-Path $stepErr) {
    try { $errContent = Get-Content $stepErr -Raw -ErrorAction SilentlyContinue } catch {}
  }

  # Append a labeled section to the combined install log so the whole
  # run is debuggable end-to-end.
  Add-Content -Path $LogFile -Value "`n=== [$Label] $(Get-Date -Format o) exit=$exitCode ===" -ErrorAction SilentlyContinue
  if ($outContent) { Add-Content -Path $LogFile -Value $outContent -ErrorAction SilentlyContinue }
  if ($errContent) { Add-Content -Path $LogFile -Value "-- stderr --" -ErrorAction SilentlyContinue; Add-Content -Path $LogFile -Value $errContent -ErrorAction SilentlyContinue }

  # Clean up the per-step temp files.
  Remove-Item $stepOut, $stepErr -ErrorAction SilentlyContinue

  $elapsed = (Get-Date) - $start
  $tstr = if ($elapsed.TotalSeconds -lt 1) { '<1s' } else { '{0:N1}s' -f $elapsed.TotalSeconds }
  if ($exitCode -eq 0) {
    Ok ("$Label — $tstr")
  } else {
    Write-Host ('  {0}✗{1} {2}' -f (C Red), (C Reset), $Label) -ForegroundColor Red
  }
  # Expose captured output to caller via script-scoped vars (used by the
  # diagnostic matcher, which reads $LogFile tail anyway, but kept for
  # any future caller that wants in-memory access).
  $script:LastExitCode2 = $exitCode
  $script:LastOutput = $outContent
  $script:LastError  = $errContent
  return $exitCode
}

# --- error diagnostics -------------------------------------------------
# Print-Diagnostic <step-label> <exit-code>
#
# Inspects the tail of $LogFile, matches it against a catalog of known
# failure patterns, and prints a human-readable diagnostic block:
# what happened, the likely cause, and concrete steps to fix it.
function Print-Diagnostic {
  param([string]$Label, [int]$ExitCode)
  $snippet = ''
  if (Test-Path $LogFile) {
    try { $snippet = (Get-Content $LogFile -Tail 60 -ErrorAction SilentlyContinue) -join "`n" } catch {}
  }

  $cause = ''; $fix = ''
  if ($snippet -match '(?i)cannot find module[^@]*@?esbuild|installed esbuild for another platform|esbuild.*binary|You installed esbuild') {
    $cause = "esbuild's native platform binary is missing. pnpm 8+ skips dependency postinstall scripts by default, so the @esbuild/<os>-<arch> binary was never downloaded and the first esbuild call fails."
    $fix = "cd `"$Dest`" ; pnpm rebuild`n  (this re-runs the skipped postinstall scripts)`nThen re-run this installer. If it still fails, install the platform`npackage directly, e.g.:`n  npm i -g @esbuild/win32-x64"
  }
  elseif ($snippet -match '(?i)ERR_PNPM_OUTDATED_LOCKFILE|lockfile.*(out of sync|not up to date)') {
    $cause = "The pnpm lockfile is out of sync with package.json (common right after a release that bumped dependencies)."
    $fix = "The installer already retries without --frozen-lockfile. If that also`nfailed, regenerate the lockfile manually:`n  cd `"$Dest`" ; Remove-Item pnpm-lock.yaml ; pnpm install`nThen re-run this installer."
  }
  elseif ($snippet -match '(?i)EACCES|permission denied|EPERM|operation not permitted|Access is denied') {
    $cause = "A file or directory could not be written (permission denied). Antivirus software (e.g. Windows Defender) can also block esbuild's binary extraction."
    $fix = "Check write permissions on `"$Dest`" and `"$env:USERPROFILE\.ccw`".`nIf an antivirus quarantined esbuild, add an exclusion for `"$Dest`".`nRe-run PowerShell as Administrator if the destination is protected."
  }
  elseif ($snippet -match '(?i)ENOSPC|no space left on|disk full|There is not enough space') {
    $cause = "The disk is full."
    $fix = "Free up space on the volume holding `"$Dest`" and re-run."
  }
  elseif ($snippet -match '(?i)ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|Could not resolve host|getaddrinfo|Network is unreachable|unable to access') {
    $cause = "A network request failed (DNS lookup failed, host unreachable, or connection timed out) while fetching packages."
    $fix = "Check your internet connection, proxy, or VPN settings, then re-run.`nIf behind a corporate proxy, set:`n  `$env:HTTPS_PROXY = 'http://your-proxy:port'"
  }
  elseif ($snippet -match '(?i)error TS[0-9]+') {
    $cause = "A TypeScript type error occurred during the build (tsc). This is usually a code defect in the repo at this commit, not an environment issue."
    $fix = "See the 'error TSxxxx' lines in the full log below. If this is the`nlatest commit, please report it. To inspect locally:`n  cd `"$Dest`" ; pnpm build"
  }
  elseif ($snippet -match '(?i)ERR_PNPM_PEER_DEP_ISSUES|peer dep') {
    $cause = "A peer dependency conflict was detected during install."
    $fix = "Try a clean dependency install:`n  cd `"$Dest`" ; Remove-Item -Recurse node_modules ; pnpm install"
  }
  elseif ($snippet -match '(?i)''(pnpm|node|git)''\s+is not recognized|command not found|executable file not found|No such file or directory|ENOENT.*spawn') {
    # Covers Windows: "'pnpm' is not recognized as an internal or external command"
    # and POSIX: "pnpm: command not found", "env: 'pnpm': No such file or directory".
    if ($snippet -match '(?i)pnpm') {
      $cause = "The pnpm executable could not be found on PATH. Either pnpm is not installed, or this installer's PATH doesn't include the directory pnpm lives in."
      $fix = "Install pnpm globally: npm install -g pnpm@9`nThen re-run this installer. If pnpm IS installed but the error`npersists, open a NEW terminal so the updated PATH is loaded."
    }
    elseif ($snippet -match '(?i)git') {
      $cause = "The git executable could not be found on PATH."
      $fix = "Install Git for Windows from https://git-scm.com/download/win,`nthen re-run this installer."
    }
    else {
      $cause = "A required executable (node, pnpm, or git) could not be found on PATH."
      $fix = "Install Node.js >= 20 from https://nodejs.org, then:`n  npm install -g pnpm@9`nThen re-run this installer."
    }
  }
  else {
    $cause = "The command exited non-zero and no specific known pattern matched."
    $fix = "Open the full log below and search for the first 'error' / 'Error'`nline. If unsure, re-run with a clean slate:`n  powershell -File install.ps1 -Reinstall"
  }

  $fixLines = $fix -split "`n"
  Write-Host ""
  Write-Host ('  {0}✗ {1} — exit {2}{3}' -f (C Red), $Label, $ExitCode, (C Reset)) -ForegroundColor Red
  Write-Host ""
  Write-Host "  ── Diagnostic ────────────────────────────────────────────"
  Write-Host "  Step:          $Label"
  Write-Host "  Likely cause:  $cause"
  Write-Host ""
  Write-Host "  How to fix:"
  foreach ($l in $fixLines) { Write-Host "    $l" }
  Write-Host ""
  Write-Host "  Full log:"
  Write-Host "    $LogFile"
  Write-Host "  ──────────────────────────────────────────────────────────"
}

function Diagnose-And-Fail {
  param([string]$Label, [int]$ExitCode)
  Print-Diagnostic -Label $Label -ExitCode $ExitCode
  Fail "Installation failed at step: $Label"
}

function Acquire-Lock {
  if (Test-Path $LockFile) {
    $otherPid = $null
    try { $otherPid = Get-Content $LockFile -ErrorAction Stop } catch {}
    if ($otherPid -and (Get-Process -Id $otherPid -ErrorAction SilentlyContinue)) {
      Write-Host "  [fail] Another CCW install is in progress (pid $otherPid). If this is wrong, delete $LockFile and re-run." -ForegroundColor Red
      exit 1
    }
    Write-Host "  [..]   Removing stale lock from pid $otherPid" -ForegroundColor DarkGray
    Remove-Item $LockFile -ErrorAction SilentlyContinue
  }
  Set-Content -Path $LockFile -Value $PID
  $script:AcquiredLock = $true
}

function Release-Lock {
  if ($script:AcquiredLock) {
    Remove-Item $LockFile -ErrorAction SilentlyContinue
    $script:AcquiredLock = $false
  }
}

function Get-InstalledVersion {
  $pkg = Join-Path $Dest 'packages\cli\package.json'
  if (-not (Test-Path $pkg)) { return '' }
  $m = Select-String -Path $pkg -Pattern '"version"\s*:\s*"([^"]+)"' -ErrorAction SilentlyContinue
  if ($m) { return $m.Matches[0].Groups[1].Value }
  return ''
}

function Get-LocalCommit {
  if (-not (Test-Path (Join-Path $Dest '.git'))) { return '' }
  # We must run `git rev-parse` from $Dest, not the current working
  # directory. If the installer is being run from a directory that
  # happens to be a git repo, reading HEAD from CWD would return the
  # wrong commit and the up-to-date check would think $Dest is at HEAD
  # when it isn't.
  Push-Location $Dest
  try {
    $oldEAP = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
      $head = & git rev-parse --short HEAD 2>$null
      return $head
    } finally {
      $ErrorActionPreference = $oldEAP
    }
  } finally {
    Pop-Location
  }
}

function Get-RemoteCommit {
  # Harden against the original fragility: the previous `$out[0].Substring(0,7)`
  # silently threw when git emitted a single line (collapsed to a string,
  # which has no Substring), always returning ''. Now we normalize to an
  # array, take the first line, and guard its length before slicing.
  try {
    $oldEAP = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    $out = & git ls-remote --heads origin $Branch 2>$null
    $ErrorActionPreference = $oldEAP
    if (-not $out) { return '' }
    $first = ($out -split "`n")[0]
    if ($first -and $first.Length -ge 7) {
      return $first.Substring(0, 7)
    }
    return ''
  } catch {
    return ''
  }
}

function Test-Node {
  try {
    $oldEAP = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    $nodeVersion = (& node --version 2>$null)
    $ErrorActionPreference = $oldEAP
    if (-not $nodeVersion) { throw 'node not found' }
    $major = [int]($nodeVersion.Trim() -replace '^v(\d+).*', '$1')
    if ($major -lt 20) {
      throw "Node.js >= 20 required (found $nodeVersion). Install from https://nodejs.org"
    }
    Write-Host "  [ok] node $nodeVersion"
  } catch {
    Write-Host "  [fail] $_" -ForegroundColor Red
    exit 1
  }
}

function Test-Pnpm {
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    Write-Host "  [ok] pnpm $(& pnpm --version)"
    return
  }
  Write-Host "  [..] pnpm not found, enabling via corepack..."
  & corepack enable 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host '  [fail] corepack enable failed. Run PowerShell as Administrator or install pnpm manually:' -ForegroundColor Red
    Write-Host '         npm install -g pnpm' -ForegroundColor Yellow
    exit 1
  }
  & corepack prepare pnpm@9.15.0 --activate 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host '  [fail] pnpm setup via corepack failed' -ForegroundColor Red
    exit 1
  }
  Write-Host "  [ok] pnpm $(& pnpm --version) (via corepack)"
}

function Test-Git {
  if (Get-Command git -ErrorAction SilentlyContinue) {
    $gitVersion = (& git --version) -replace '^git\s+', ''
    Write-Host "  [ok] git $gitVersion"
    return
  }
  Write-Host '  [fail] git not found. Install Git for Windows from https://git-scm.com/download/win' -ForegroundColor Red
  exit 1
}

function Backup-Dest {
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backup = "$Dest.bak.$timestamp"
  Write-Host "  [..] Moving existing $Dest to $backup..."
  try {
    Move-Item -Path $Dest -Destination $backup -ErrorAction Stop
  } catch {
    Write-Host "  [fail] Could not move $Dest to ${backup}: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '         Stop any running CCW service (ccw stop) and remove the directory manually, then re-run.' -ForegroundColor Yellow
    exit 1
  }
  Write-Host "  [ok] Backed up to $backup (safe to delete after you confirm the new install works)"
}

function Install-Source {
  # Detect what is already on disk before we do anything. The user
  # re-running the installer should see exactly what changed (or
  # nothing, if already up to date).
  $installedVersion = Get-InstalledVersion
  $localCommit     = Get-LocalCommit
  $remoteCommit    = Get-RemoteCommit

  Write-Host ''
  Write-Host "  [..]   Source:           $Dest"
  if ($installedVersion) {
    Write-Host "  [..]   Installed version: v$installedVersion"
  } else {
    Write-Host "  [..]   Installed version: (none - fresh install)"
  }
  if ($localCommit)  { Write-Host "  [..]   Local commit:      $localCommit" }
  if ($remoteCommit) { Write-Host "  [..]   Remote commit:     $remoteCommit (origin/$Branch)" }
  else               { Write-Host "  [..]   Remote commit:     (no network or repo moved)" -ForegroundColor DarkGray }

  # -Reinstall: always back up and re-clone, even when up to date.
  if ($ForceReinstall -and (Test-Path $Dest)) {
    if ($installedVersion) {
      Write-Host "  [..] -Reinstall: backing up v$installedVersion and re-cloning"
    } else {
      Write-Host "  [..] -Reinstall: backing up existing $Dest and re-cloning"
    }
    Backup-Dest
    $script:RebuildNeeded = $true
  } elseif (Test-Path (Join-Path $Dest '.git')) {
    # Already a git checkout. Try the cheapest path first: fast-forward.
    if ($localCommit -and $remoteCommit -and $localCommit -eq $remoteCommit) {
      # Up to date. No rebuild needed; just re-verify the shim and service.
      if ($installedVersion) {
        Write-Host "  [ok] Already up to date (v$installedVersion, commit $localCommit)"
      } else {
        Write-Host "  [ok] Already up to date (commit $localCommit)"
      }
      $script:RebuildNeeded = $false
      return
    }
    Write-Host "  [..] Updating existing install at $Dest"
    # --ff-only avoids the "divergent branches" warning that plain
    # `git pull` emits when local and remote have any commit difference.
    $pullExit = 1
    $pullOutput = $null
    Push-Location $Dest
    try {
      $oldEAP = $ErrorActionPreference
      $ErrorActionPreference = 'SilentlyContinue'
      try {
        $pullOutput = & git pull --ff-only --depth 1 origin $Branch 2>&1
        $pullExit = $LASTEXITCODE
      } finally {
        $ErrorActionPreference = $oldEAP
      }
      if ($pullExit -eq 0) {
        $afterCommit = Get-LocalCommit
        if ($afterCommit -eq $localCommit) {
          if ($installedVersion) {
            Write-Host "  [ok] Already up to date (v$installedVersion, commit $afterCommit)"
          } else {
            Write-Host "  [ok] Already up to date (commit $afterCommit)"
          }
          $script:RebuildNeeded = $false
        } else {
          Write-Host "  [ok] Updated: $localCommit -> $afterCommit"
          $script:RebuildNeeded = $true
        }
        return
      }
      Write-Host "  [warn] git pull failed (exit $pullExit); will back up and re-clone" -ForegroundColor Yellow
      if ($pullOutput) { Write-Host ($pullOutput -join "`n") -ForegroundColor DarkGray }
    } finally {
      Pop-Location
    }
    Write-Host '  [..] Backing up current install and re-cloning from origin...'
    Backup-Dest
    $script:RebuildNeeded = $true
  } elseif (Test-Path $Dest) {
    # $Dest exists but is not a git repo (leftover from a partial install
    # or a renamed/moved directory). Back it up so the user can recover,
    # then clone a fresh source tree.
    Write-Host "  [..] $Dest exists but is not a git repo; backing it up and re-cloning..."
    Backup-Dest
    $script:RebuildNeeded = $true
  } else {
    $script:RebuildNeeded = $true
  }
  # Pre-check: parent dir must be writable. New-Item -Force on an
  # unwritable parent would fail late (during clone) with a confusing
  # permission error. Surface a clear diagnostic upfront instead.
  $destParent = Split-Path $Dest -Parent
  if (-not (Test-Path $destParent)) {
    try {
      New-Item -ItemType Directory -Force -Path $destParent -ErrorAction Stop | Out-Null
    } catch {
      throw "Cannot create install parent directory: $destParent`n  Reason: not writable by the current user.`n  Fix:    set `$env:CCW_HOME to a directory you can write to, e.g.`n          `$env:CCW_HOME = `"$env:USERPROFILE\.local\share\ccw`"`n          then re-run this installer."
    }
  }
  if ((Test-Path $destParent) -and -not (Test-Path "$destParent\.") ) {
    # Stale path component — extremely rare; treat as missing.
    throw "Install parent path is not a valid directory: $destParent"
  }
  try {
    # Probe write access by creating + deleting a sentinel file. This is
    # the only reliable check on Windows: ACLs can grant write through
    # inherited permissions even when the file is reported as read-only.
    $probe = Join-Path $destParent '.ccw-write-probe'
    [System.IO.File]::WriteAllText($probe, 'ok')
    Remove-Item $probe -ErrorAction SilentlyContinue
  } catch {
    throw "Install parent directory is not writable: $destParent`n  Reason: $destParent exists but the current user has no write permission.`n  Fix:    pick a different install location via:`n          `$env:CCW_HOME = `"$env:USERPROFILE\.local\share\ccw`"`n          then re-run this installer."
  }
  New-Item -ItemType Directory -Force -Path $destParent | Out-Null
  # The label below intentionally contains the word "Cloning" — the
  # regression tests grep for it.
  $rc = Step-Run -Label "Cloning $RepoUrl" -Command 'git' -CmdArgs @('clone', '--depth', '1', '-b', $Branch, $RepoUrl, $Dest)
  if ($rc -ne 0) {
    Diagnose-And-Fail -Label 'git clone' -ExitCode $rc
  }
  $newVersion = Get-InstalledVersion
  if ($newVersion) {
    Write-Host "  [..]   Installed version: v$newVersion (just cloned)"
  }
}

function Build-Source {
  # Install-Source sets $RebuildNeeded=$false when the source is already
  # up to date. In that case we skip pnpm install + pnpm build entirely
  # — the existing build artifacts and node_modules are still valid.
  # (This exact message is asserted by the regression tests.)
  if (-not $RebuildNeeded) {
    Write-Host "  [..]   Skipping pnpm install + build (no source change)"
    return
  }

  # pnpm install. Try --frozen-lockfile first (reproducible, matches CI);
  # fall back to a regenerating install if the lockfile drifted. Each
  # attempt runs exactly once via Step-Run, which captures all output to
  # $LogFile and NEVER trips the NativeCommandError trap that the old
  # `2>&1 | Tee-Object` pipeline hit under ErrorActionPreference=Stop.
  $rc = Step-Run -Label 'pnpm install (frozen lockfile)' -WorkingDir $Dest -Command 'pnpm' -CmdArgs @('install', '--frozen-lockfile')
  if ($rc -ne 0) {
    Write-Host "  [warn] frozen lockfile install failed (lockfile may be out of sync); retrying without --frozen-lockfile" -ForegroundColor Yellow
    $rc = Step-Run -Label 'pnpm install (lockfile update)' -WorkingDir $Dest -Command 'pnpm' -CmdArgs @('install')
    if ($rc -ne 0) {
      Diagnose-And-Fail -Label 'pnpm install' -ExitCode $rc
    }
  }

  # pnpm 8+ ignores postinstall scripts by default for security. esbuild,
  # core-js, and other native-binary packages need their postinstall to
  # run, otherwise the build fails later with "Cannot find module" errors.
  # `pnpm rebuild` re-runs the skipped scripts. Non-fatal.
  $rc = Step-Run -Label 'pnpm rebuild (postinstall scripts)' -WorkingDir $Dest -Command 'pnpm' -CmdArgs @('rebuild')
  if ($rc -ne 0) {
    Write-Host "  [warn] pnpm rebuild reported an issue (continuing)" -ForegroundColor Yellow
  }

  # pnpm build. Single execution, output fully captured. This replaces
  # the buggy `& pnpm build 2>&1 | Tee-Object` that false-failed on
  # esbuild/vite stderr progress lines.
  $rc = Step-Run -Label 'pnpm build' -WorkingDir $Dest -Command 'pnpm' -CmdArgs @('build')
  if ($rc -ne 0) {
    Diagnose-And-Fail -Label 'pnpm build' -ExitCode $rc
  }
}

function Install-Shim {
  $shim = @"
@echo off
REM CCW (Claude Code Wrapper) shim — forwards to the built CLI bundle.
node "%~dp0packages\cli\dist\cli.js" %*
"@
  $shimPath = Join-Path $Dest $ShimName
  Set-Content -Path $shimPath -Value $shim -Encoding ASCII
}

function Test-Shim {
  $shimPath = Join-Path $Dest $ShimName
  try {
    $oldEAP = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    $output = & $shimPath --version 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $oldEAP
    if ($code -eq 0) {
      Write-Host "  [ok] shim works: ccw --version -> $output"
      return $true
    }
    Write-Host "  [fail] shim exited with code $code. Check that Node 20+ is on PATH and $Dest\packages\cli\dist\cli.js exists." -ForegroundColor Red
  } catch {
    Write-Host "  [fail] shim not executable: $_" -ForegroundColor Red
  }
  return $false
}

# Drop a second copy of the shim in a directory that is ALREADY on PATH for
# the current user. This makes `ccw` callable from any new terminal
# immediately, with no PATH refresh and no waiting for env propagation.
function Install-GlobalShim {
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
}

function Add-To-Path {
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $userPath) { $userPath = '' }
  if ($userPath -like "*$Dest*") {
    Write-Host "  [ok] $Dest already on user PATH"
    return
  }
  $newPath = if ($userPath) { "$userPath;$Dest" } else { $Dest }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  $env:Path = "$env:Path;$Dest"
  Write-Host "  [ok] Added $Dest to user PATH (open a NEW terminal for it to take effect)"
}

function Start-ServiceAsync {
  $cliPath = Join-Path $Dest 'packages\cli\dist\cli.js'
  if (-not (Test-Path $cliPath)) {
    Write-Host "  [skip] $cliPath not found, cannot start service" -ForegroundColor Yellow
    return $false
  }

  Write-Host '  [..] Starting CCW service...'
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
    } catch {
      # config unreadable or PORT non-numeric; fall back to default port
    }
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
    } catch {
      # port not yet listening, keep polling
    }
  }
  Write-Host "  [fail] Service did not start within ${maxWait}s. Check ~/.ccw/logs/ for details." -ForegroundColor Red
  return $false
}

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

# Acquire the lock BEFORE prereq checks. If two installers race
# (e.g. a user opens two PowerShell windows and runs the install in
# both), the second one fails fast with a clear message rather than
# corrupting $Dest. The trap releases the lock on any exit, including
# Ctrl+C and prereq failures.
Parse-Args @args
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Release-Lock } -ErrorAction SilentlyContinue
try {
  # Best-effort: Release-Lock on Ctrl+C. PowerShell's trap/exit hooks
  # for SIGINT are limited; the engine event above is the most
  # reliable way to clean up across termination paths.
  $null = [Console]::TreatControlCAsInput = $false
} catch {}
Acquire-Lock

Write-Banner
Write-Host 'Checking prerequisites:'
Test-Node
Test-Pnpm
Test-Git
Write-Host ''
Write-Host 'Installing:'
Install-Source
Build-Source
Install-Shim
Install-GlobalShim
Test-Shim
Add-To-Path
$svcOk = Start-ServiceAsync
# Gate: only open the UI terminal if the service actually came up.
# Previously this ran unconditionally even when the service failed to
# start, which was confusing.
if ($svcOk) { Open-NewTerminal }
Write-Host ''
$finalVersion = Get-InstalledVersion
$finalCommit  = Get-LocalCommit
if ($finalVersion -and $finalCommit) {
  Write-Host "CCW v$finalVersion (commit $finalCommit) ready at $Dest" -ForegroundColor Green
  if (-not $RebuildNeeded) {
    Write-Host "  (no source change since last install; build was skipped)" -ForegroundColor DarkGray
  }
} else {
  Write-Host 'CCW installed.' -ForegroundColor Green
}
Write-Host "  Source: $Dest"
Write-Host "  Binary: $Dest\packages\cli\dist\cli.js"
Write-Host "  Local shim:   $Dest\$ShimName"
Write-Host ''
Write-Host 'A new terminal has been opened with ccw ui.' -ForegroundColor Cyan
Write-Host 'If it did not open, run ccw ui in a new terminal.' -ForegroundColor DarkGray
Write-Host ''

# Release the lock now (in case the engine event didn't fire).
Release-Lock
