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
    Write-Host "  [ok] git $(& git --version)"
    return
  }
  Write-Host '  [fail] git not found. Install Git for Windows from https://git-scm.com/download/win' -ForegroundColor Red
  exit 1
}

function Install-Source {
  if (Test-Path (Join-Path $Dest '.git')) {
    Write-Host "  [..] Updating existing install at $Dest"
    # --ff-only avoids the "divergent branches" warning that plain
    # `git pull` emits when local and remote have any commit difference.
    Push-Location $Dest
    try {
      & git pull --ff-only --depth 1 origin main 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Host '  [ok] Updated to latest'
        return
      }
    } finally {
      Pop-Location
    }
    # Fast-forward failed: local history diverged (e.g. an old install with
    # commits that no longer exist on origin). Re-clone cleanly.
    Write-Host '  [..] Local state diverged from origin; re-cloning cleanly...'
    Remove-Item -Recurse -Force $Dest
  } elseif (Test-Path $Dest) {
    Write-Host "  [fail] $Dest exists but is not a git repo. Remove it and re-run." -ForegroundColor Red
    exit 1
  }
  Write-Host "  [..] Cloning $RepoUrl -> $Dest"
  New-Item -ItemType Directory -Force -Path (Split-Path $Dest) | Out-Null
  & git clone --depth 1 -b $Branch $RepoUrl $Dest
  if ($LASTEXITCODE -ne 0) {
    Write-Host '  [fail] git clone failed. Check the repo URL and your network.' -ForegroundColor Red
    exit 1
  }
}

function Build-Source {
  Push-Location $Dest
  try {
    Write-Host '  [..] pnpm install --frozen-lockfile (this can take a minute on first run)'
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed' }

    Write-Host '  [..] pnpm build'
    & pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'pnpm build failed' }
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
