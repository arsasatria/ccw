# ccw installer for Windows (PowerShell)
#
# One-line install:
#   irm https://raw.githubusercontent.com/arsasatria/ccw/main/install.ps1 | iex
#
# What it does:
#   1. Verifies Node.js >= 20
#   2. Ensures pnpm (via corepack)
#   3. Clones (or updates) the source repo
#   4. Runs pnpm install + pnpm build
#   5. Drops a ccw.cmd shim that invokes the built binary
#   6. Adds the install dir to the user PATH if it isn't already
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
  if (Test-Path $winApps) { $candidates += @{ Dir = $winApps; Reason = 'WindowsApps' } }

  foreach ($c in $candidates) {
    $probe = Join-Path $c.Dir 'ccw-shim-probe.tmp'
    try {
      '' | Set-Content -Path $probe -ErrorAction Stop
      Remove-Item $probe -Force -ErrorAction SilentlyContinue
      $target = Join-Path $c.Dir $ShimName
      Set-Content -Path $target -Value $globalShim -Encoding ASCII
      Write-Host "  [ok] Global shim at $target ($($c.Reason), already on PATH)"
      return
    } catch {
      # not writable, try next
    }
  }
  Write-Host "  [skip] No writable PATH dir found; rely on Add-To-Path below."
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
Add-To-Path
Write-Host ''
Write-Host 'ccw installed.' -ForegroundColor Green
Write-Host "  Source: $Dest"
Write-Host "  Binary: $Dest\packages\cli\dist\cli.js"
Write-Host "  Local shim:   $Dest\$ShimName"
Write-Host ''
Write-Host 'Open a NEW terminal and run:' -ForegroundColor Cyan
Write-Host '  ccw --version'
Write-Host '  ccw code'
Write-Host ''
Write-Host 'Or, in the CURRENT terminal, refresh PATH with:' -ForegroundColor DarkGray
Write-Host "  `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')" -ForegroundColor DarkGray
