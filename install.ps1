# ccw installer for Windows (PowerShell)
#
# One-line install:
#   irm https://raw.githubusercontent.com/arsasatria/ccw/main/install.ps1 | iex
#
# What it does:
#   1. Verifies Node.js >= 20, pnpm (via corepack), and git
#   2. Clones (or updates) the source repo
#   3. Runs pnpm install + pnpm build
#   4. Drops a ccw.cmd shim that invokes the built binary
#   5. Tries to drop a global shim in a PATH-on dir (%APPDATA%\npm, WindowsApps)
#   6. Verifies the shim works by running ccw --version
#   7. Adds the install dir to the user PATH if it isn't already
#   8. Auto-spawns the ccw gateway service and verifies the port is listening
#   9. Opens a new terminal with ccw ui (which opens the browser)
#
# Re-running is safe and acts as an updater.

$ErrorActionPreference = 'Stop'

$RepoOwner = 'arsasatria'
$RepoName  = 'ccw'
$Branch    = 'main'
$RepoUrl   = "https://github.com/$RepoOwner/$RepoName"
$Dest      = Join-Path $env:LOCALAPPDATA 'Programs\ccw'
$ShimName  = 'ccw.cmd'

function Write-Banner {
  Write-Host ''
  Write-Host '+---------------------------------------------------+' -ForegroundColor Cyan
  Write-Host '|            ccw installer (Windows)                |' -ForegroundColor Cyan
  Write-Host '+---------------------------------------------------+' -ForegroundColor Cyan
  Write-Host ''
}

function Test-Node {
  try {
    $nodeVersion = (& node --version) 2>$null
    if (-not $nodeVersion) { throw }
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
    # `git --version` prints "git version X.Y.Z" — strip the leading
    # "git " to avoid "git git version X.Y.Z" in the success line.
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
    Write-Host '         Stop any running ccw service (ccw stop) and remove the directory manually, then re-run.' -ForegroundColor Yellow
    exit 1
  }
  Write-Host "  [ok] Backed up to $backup (safe to delete after you confirm the new install works)"
}

function Install-Source {
  if (Test-Path (Join-Path $Dest '.git')) {
    Write-Host "  [..] Updating existing install at $Dest"
    # --ff-only avoids the "divergent branches" warning that plain
    # `git pull` emits when local and remote have any commit difference.
    Push-Location $Dest
    try {
      # Capture output so we can show it on failure (e.g. no network, no
      # origin remote, divergent history, or local changes blocking the
      # fast-forward). All of these end up at the same backup+re-clone
      # path below — we never want a stale local copy to block updates.
      # The inner try/catch is required because native-command failures
      # throw under $ErrorActionPreference=Stop; we want to treat any
      # failure as "fall through to backup+re-clone" rather than abort.
      $pullExit = 1
      $pullOutput = $null
      try {
        $pullOutput = & git pull --ff-only --depth 1 origin main 2>&1
        $pullExit = $LASTEXITCODE
      } catch {
        $pullOutput = @($_.Exception.Message)
      }
      if ($pullExit -eq 0) {
        Write-Host '  [ok] Updated to latest'
        return
      }
      Write-Host "  [warn] git pull failed (exit $pullExit); will back up and re-clone" -ForegroundColor Yellow
      if ($pullOutput) { Write-Host ($pullOutput -join "`n") -ForegroundColor DarkGray }
    } finally {
      Pop-Location
    }
    # Any git pull failure (diverged, no network, no origin, etc.) - back up
    # and re-clone cleanly.
    Write-Host '  [..] Backing up current install and re-cloning from origin...'
    Backup-Dest
  } elseif (Test-Path $Dest) {
    # $Dest exists but is not a git repo (e.g. leftover from a partial install
    # or a renamed/moved directory). Back it up so the user can recover, then
    # clone a fresh source tree.
    Write-Host "  [..] $Dest exists but is not a git repo; backing it up and re-cloning..."
    Backup-Dest
  }
  Write-Host "  [..] Cloning $RepoUrl -> $Dest"
  New-Item -ItemType Directory -Force -Path (Split-Path $Dest) | Out-Null
  # git clone can also throw under $ErrorActionPreference=Stop if the network
  # is down or the URL is wrong. Catch and exit with a clear error.
  try {
    & git clone --depth 1 -b $Branch $RepoUrl $Dest
  } catch {
    Write-Host "  [fail] git clone failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '         Check the repo URL and your network.' -ForegroundColor Yellow
    exit 1
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Host '  [fail] git clone failed. Check the repo URL and your network.' -ForegroundColor Red
    exit 1
  }
}

function Build-Source {
  Push-Location $Dest
  try {
    Write-Host '  [..] pnpm install --frozen-lockfile (this can take a minute on first run)'
    # Wrap each pnpm call so a failure doesn't abort the installer before
    # we can show the error and (for the install case) retry without frozen.
    $installExit = 1
    try {
      & pnpm install --frozen-lockfile
      $installExit = $LASTEXITCODE
    } catch {
      Write-Host "  [warn] pnpm install --frozen-lockfile threw: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    if ($installExit -eq 0) {
      Write-Host '  [ok] pnpm install (frozen)'
    } else {
      # The frozen lockfile is out of sync with package.json (common after a
      # new release that updated dependencies but kept the lockfile pinned).
      # Retry without --frozen-lockfile so pnpm can regenerate the lockfile.
      Write-Host '  [warn] pnpm install --frozen-lockfile failed (lockfile may be out of sync with package.json)' -ForegroundColor Yellow
      Write-Host '  [..] Retrying without --frozen-lockfile to update the lockfile...'
      try {
        & pnpm install
        $installExit = $LASTEXITCODE
      } catch {
        Write-Host "  [fail] pnpm install threw: $($_.Exception.Message)" -ForegroundColor Red
        throw 'pnpm install failed (both frozen and non-frozen). Check your network and pnpm version.'
      }
      if ($installExit -ne 0) {
        throw 'pnpm install failed (both frozen and non-frozen). Check your network and pnpm version.'
      }
      Write-Host '  [ok] pnpm install (lockfile updated)'
    }

    # pnpm 8+ ignores postinstall scripts by default for security. esbuild,
    # core-js, and other native-binary packages need their postinstall to run,
    # otherwise the build will fail later with "Cannot find module" errors.
    # `pnpm rebuild` re-runs the skipped scripts for already-installed deps.
    Write-Host '  [..] pnpm rebuild (run postinstall scripts pnpm skipped for safety, e.g. esbuild)'
    try {
      & pnpm rebuild 2>&1 | Out-Null
    } catch {
      Write-Host "  [warn] pnpm rebuild threw: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    Write-Host '  [..] pnpm build'
    # Capture stdout and stderr separately so a build failure shows
    # the actual compiler/typescript error rather than a bare
    # 'pnpm build failed'. We tee to the host terminal so the user
    # sees progress in real time and to a string we can print on
    # failure.
    $buildOutput = ''
    try {
      $buildOutput = & pnpm build 2>&1 | Tee-Object -Variable outStream | Out-String
      # Tee-Object's -Variable form assigns to $outStream as a side
      # effect; the pipeline above captures both into $buildOutput.
      # Remove the duplicate $outStream variable since we use $buildOutput.
      Remove-Variable outStream -ErrorAction SilentlyContinue
    } catch {
      Write-Host "  [fail] pnpm build threw: $($_.Exception.Message)" -ForegroundColor Red
      if ($buildOutput) { Write-Host $buildOutput -ForegroundColor DarkGray }
      throw 'pnpm build failed'
    }
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  [fail] pnpm build exited with code $LASTEXITCODE. Last output above." -ForegroundColor Red
      if ($buildOutput) { Write-Host $buildOutput -ForegroundColor DarkGray }
      throw 'pnpm build failed'
    }
    Write-Host '  [ok] pnpm build'
  } finally {
    Pop-Location
  }
}

function Install-Shim {
  $shim = @"
@echo off
node "%~dp0packages\cli\dist\cli.js" %*
"@
  $shimPath = Join-Path $Dest $ShimName
  Set-Content -Path $shimPath -Value $shim -Encoding ASCII
}

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
Start-ServiceAsync
Open-NewTerminal
Write-Host ''
Write-Host 'ccw installed.' -ForegroundColor Green
Write-Host "  Source: $Dest"
Write-Host "  Binary: $Dest\packages\cli\dist\cli.js"
Write-Host "  Local shim:   $Dest\$ShimName"
Write-Host ''
Write-Host 'A new terminal has been opened with ccw ui.' -ForegroundColor Cyan
Write-Host 'If it did not open, run ccw ui in a new terminal.' -ForegroundColor DarkGray
Write-Host ''
