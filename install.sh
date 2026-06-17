#!/usr/bin/env bash
#
# ccw installer for macOS / Linux
#
# One-line install:
#   curl -fsSL https://raw.githubusercontent.com/arsasatria/ccw/main/install.sh | bash
#
# What it does:
#   1. Verifies Node.js >= 20
#   2. Ensures pnpm (via corepack)
#   3. Clones (or updates) the source repo
#   4. Runs pnpm install (with fallback if lockfile drifted) + pnpm rebuild
#   5. Runs pnpm build
#   6. Drops a `ccw` shim in $BIN_DIR that invokes the built binary
#   7. Tries to drop a global shim in a PATH-on dir (/usr/local/bin, ~/.local/bin)
#   8. Verifies the shim works by running `ccw --version`
#   9. Adds $BIN_DIR to PATH if it isn't already
#  10. Auto-spawns the ccw gateway service and verifies the port is listening
#  11. Tries to open the UI in the user's browser
#
# Re-running is safe and acts as an updater. Any pre-existing $DEST is
# moved to $DEST.bak.<timestamp> rather than destroyed, so a re-run after
# a failed install, partial clone, or a divergent local checkout never
# destroys the user's data.

set -euo pipefail

REPO_OWNER="arsasatria"
REPO_NAME="ccw"
BRANCH="main"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}"
# Resolve $HOME defensively: it should always be set, but a missing
# $HOME would make ${CCW_HOME:-$HOME/...} expand to "/.local/share/ccw"
# and silently install into /. We require it explicitly so the user
# gets a clear error.
: "${HOME:?HOME is not set. Refusing to install into an unknown path.}"
DEST="${CCW_HOME:-$HOME/.local/share/ccw}"
BIN_DIR="${CCW_BIN_DIR:-$HOME/.local/bin}"
CMD_NAME="ccw"
DEFAULT_PORT=3456

say()  { printf '%s\n' "$*"; }
ok()   { say "  [ok]   $*"; }
step() { say "  [..]   $*"; }
fail() { say "  [fail] $*" >&2; exit 1; }

banner() {
  say ""
  say "+---------------------------------------------------+"
  say "|         ccw installer (macOS / Linux)             |"
  say "+---------------------------------------------------+"
  say ""
}

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    fail "node not found. Install Node.js >= 20 from https://nodejs.org"
  fi
  local v
  v=$(node -v)
  local major="${v#v}"
  major="${major%%.*}"
  if ! [[ "$major" =~ ^[0-9]+$ ]] || [ "$major" -lt 20 ]; then
    fail "Node.js >= 20 required (found $v)"
  fi
  ok "node $v"
}

check_git() {
  if ! command -v git >/dev/null 2>&1; then
    fail "git not found. Install git (https://git-scm.com/download/mac or 'apt install git' / 'brew install git')"
  fi
  ok "git $(git --version | awk '{print $3}')"
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    ok "pnpm $(pnpm --version)"
    return
  fi
  step "pnpm not found, enabling via corepack"
  if ! command -v corepack >/dev/null 2>&1; then
    fail "corepack not available. Install Node.js >= 20 or pnpm manually: npm i -g pnpm"
  fi
  if ! corepack enable >/dev/null 2>&1; then
    fail "corepack enable failed. Install pnpm manually: npm i -g pnpm"
  fi
  if ! corepack prepare pnpm@9.15.0 --activate >/dev/null 2>&1; then
    fail "pnpm setup via corepack failed"
  fi
  ok "pnpm $(pnpm --version) (via corepack)"
}

# Move an existing $DEST to a timestamped backup. Used whenever we are
# about to replace $DEST (non-git directory, diverged git state, failed
# clone, etc.) so the user can recover their data if the new install is
# broken. The backup is left in place after install — the user can
# delete it once they confirm the new install works.
backup_dest() {
  local ts
  ts=$(date +%Y%m%d-%H%M%S)
  local backup="${DEST}.bak.${ts}"
  step "Moving existing $DEST to $backup"
  if ! rm -rf "$backup" 2>/dev/null; then :; fi
  if ! mv "$DEST" "$backup" 2>/dev/null; then
    fail "Could not move $DEST to ${backup}. Stop any running ccw service (ccw stop) and remove $DEST manually, then re-run."
  fi
  ok "Backed up to $backup (safe to delete after you confirm the new install works)"
}

install_source() {
  if [ -d "$DEST/.git" ]; then
    step "Updating existing install at $DEST"
    # --ff-only avoids the "divergent branches" warning that plain `git pull`
    # emits when local and remote have any commit difference.
    if ( cd "$DEST" && git pull --ff-only --depth 1 origin "$BRANCH" ) >/dev/null 2>&1; then
      ok "Updated to latest"
      return
    fi
    # Pull failed for any reason (no origin, divergent history, no network).
    # Back up the user's existing tree so they can recover from it, then
    # remove it so the fresh clone has a clean target.
    local pull_output
    pull_output=$( ( cd "$DEST" && git pull --ff-only --depth 1 origin "$BRANCH" ) 2>&1 || true )
    if [ -n "$pull_output" ]; then
      say "  [warn] git pull failed; will back up and re-clone" >&2
      say "$pull_output" | sed 's/^/         /' >&2
    else
      say "  [warn] git pull failed; will back up and re-clone" >&2
    fi
    backup_dest
  elif [ -e "$DEST" ]; then
    # $DEST exists but is not a git repo (e.g. leftover from a partial
    # install, a renamed/moved directory, or a user-managed file at this
    # path). Back it up and clone fresh.
    step "$DEST exists but is not a git repo; backing it up and re-cloning"
    backup_dest
  fi
  step "Cloning $REPO_URL -> $DEST"
  mkdir -p "$(dirname "$DEST")"
  if ! git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$DEST" 2>&1 | sed 's/^/         /' >&2; then
    fail "git clone failed. Check the repo URL and your network."
  fi
}

build_source() {
  step "pnpm install --frozen-lockfile (this can take a minute on first run)"
  local install_ok=0
  if ( cd "$DEST" && pnpm install --frozen-lockfile ) >/dev/null 2>&1; then
    install_ok=1
    ok "pnpm install (frozen)"
  else
    # The frozen lockfile is out of sync with package.json (common after
    # a new release that updated dependencies but kept the lockfile
    # pinned). Retry without --frozen-lockfile so pnpm can regenerate
    # the lockfile.
    say "  [warn] pnpm install --frozen-lockfile failed (lockfile may be out of sync with package.json)" >&2
    say "  [..] Retrying without --frozen-lockfile to update the lockfile..." >&2
    if ( cd "$DEST" && pnpm install ) >/dev/null 2>&1; then
      install_ok=1
      ok "pnpm install (lockfile updated)"
    fi
  fi
  if [ "$install_ok" -ne 1 ]; then
    fail "pnpm install failed (both frozen and non-frozen). Check your network and pnpm version."
  fi

  # pnpm 8+ ignores postinstall scripts by default for security.
  # esbuild, core-js, and other native-binary packages need their
  # postinstall to run, otherwise the build will fail later with
  # "Cannot find module" errors. `pnpm rebuild` re-runs the skipped
  # scripts for already-installed deps.
  step "pnpm rebuild (run postinstall scripts pnpm skipped for safety, e.g. esbuild)"
  ( cd "$DEST" && pnpm rebuild ) >/dev/null 2>&1 || true

  step "pnpm build"
  if ! ( cd "$DEST" && pnpm build ) >/dev/null 2>&1; then
    say "  [warn] pnpm build emitted output (likely warnings). Re-running with full output..." >&2
    if ! ( cd "$DEST" && pnpm build ) 2>&1 | sed 's/^/         /' >&2; then
      fail "pnpm build failed"
    fi
  fi
  ok "pnpm build"
}

install_shim() {
  mkdir -p "$BIN_DIR"
  cat > "$BIN_DIR/$CMD_NAME" <<EOF
#!/usr/bin/env bash
exec node "$DEST/packages/cli/dist/cli.js" "\$@"
EOF
  chmod +x "$BIN_DIR/$CMD_NAME"
  ok "Local shim: $BIN_DIR/$CMD_NAME"
}

# Drop a second copy of the shim in a directory that is ALREADY on PATH.
# Makes `ccw` callable from any new terminal with no PATH refresh.
install_global_shim() {
  local global_shim
  global_shim=$(cat <<EOF
#!/usr/bin/env bash
exec node "$DEST/packages/cli/dist/cli.js" "\$@"
EOF
)

  # /usr/local/bin first (system-wide, no PATH edit needed). Try no-sudo,
  # then sudo non-interactively.
  if [ -d "/usr/local/bin" ]; then
    if [ -w "/usr/local/bin" ]; then
      if printf '%s\n' "$global_shim" > "/usr/local/bin/$CMD_NAME" 2>/dev/null && chmod +x "/usr/local/bin/$CMD_NAME" 2>/dev/null; then
        ok "Global shim at /usr/local/bin/$CMD_NAME (no sudo, already on PATH)"
        return
      fi
    fi
    if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
      if printf '%s\n' "$global_shim" | sudo tee "/usr/local/bin/$CMD_NAME" >/dev/null 2>&1; then
        sudo chmod +x "/usr/local/bin/$CMD_NAME" 2>/dev/null
        ok "Global shim at /usr/local/bin/$CMD_NAME (sudo -n, already on PATH)"
        return
      fi
    fi
  fi

  # ~/.local/bin (XDG, user-local). Most modern distros have this on PATH.
  if [ -d "$HOME/.local/bin" ] && [ -w "$HOME/.local/bin" ]; then
    if printf '%s\n' "$global_shim" > "$HOME/.local/bin/$CMD_NAME" 2>/dev/null && chmod +x "$HOME/.local/bin/$CMD_NAME" 2>/dev/null; then
      ok "Global shim at $HOME/.local/bin/$CMD_NAME (already on PATH)"
      return
    fi
  fi

  say "  [skip] No writable PATH dir found; rely on the PATH-add step below (open a new terminal)."
}

# Verifies the shim actually works by running `ccw --version`. We use the
# full path to the shim so this works even if $BIN_DIR is not yet on PATH
# for the current shell. A broken shim here means a user who runs
# `ccw --version` from a new terminal will see the same failure.
verify_shim() {
  local shim_path="$BIN_DIR/$CMD_NAME"
  if [ ! -x "$shim_path" ]; then
    fail "shim not executable at $shim_path"
  fi
  local cli_dist="$DEST/packages/cli/dist/cli.js"
  if [ ! -f "$cli_dist" ]; then
    fail "Built binary not found at $cli_dist. Run pnpm build manually in $DEST."
  fi
  local out
  if ! out=$("$shim_path" --version 2>&1); then
    fail "shim exited non-zero. Check that Node 20+ is on PATH and $cli_dist exists."
  fi
  ok "shim works: ccw --version -> $out"
}

# Detect the user's shell and add $BIN_DIR to the matching profile. We
# don't rely on a single rc file because users differ — and silently
# editing a file the user doesn't read defeats the purpose. The
# instructions at the end of the script tell the user what to do.
add_to_path() {
  local rc_file=""
  case "${SHELL:-}" in
    */zsh)  rc_file="$HOME/.zshrc" ;;
    */bash) rc_file="$HOME/.bashrc" ;;
    */fish) rc_file="$HOME/.config/fish/config.fish" ;;
    *)      rc_file="$HOME/.profile" ;;
  esac
  # Match whole PATH entry, not substring (e.g. .local/bin must not
  # match .local/bin-other).
  local p found=0
  local IFS=':'
  for p in ${PATH:-}; do
    if [ "$p" = "$BIN_DIR" ]; then
      found=1
      break
    fi
  done
  if [ "$found" -eq 1 ]; then
    ok "$BIN_DIR is on PATH for this shell"
    return
  fi
  # Don't auto-edit the rc file: a wrong edit can break the user's
  # shell. Just print a clear instruction. (The Windows installer
  # edits the user PATH via setx, but rc files on macOS/Linux are
  # shell-specific and have no equivalent API.)
  say "  [..] $BIN_DIR is not on PATH for this shell"
  say "         Add this to $rc_file (or the rc file for $SHELL):"
  say "           export PATH=\"\$PATH:$BIN_DIR\""
  say "         Then open a new terminal."
}

# Parse the port from ~/.ccw/config.json, falling back to the default.
# Returns the port number on stdout. Empty/non-numeric PORT is treated
# as the default.
detect_port() {
  local config_path="$HOME/.ccw/config.json"
  if [ ! -f "$config_path" ]; then
    echo "$DEFAULT_PORT"
    return
  fi
  local port
  port=$(grep -oE '"PORT"[[:space:]]*:[[:space:]]*[0-9]+' "$config_path" 2>/dev/null | grep -oE '[0-9]+' | head -n 1 || true)
  if [ -z "$port" ]; then
    echo "$DEFAULT_PORT"
  else
    echo "$port"
  fi
}

# Polls the ccw port for up to 15 seconds. Returns 0 if the port is
# listening, 1 otherwise. Used to verify the service actually started,
# not just that the spawn command returned.
is_port_listening() {
  local port="$1"
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    return $?
  fi
  # Fallback: try Python (almost always available on macOS/Linux).
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(0.5)
try:
    s.connect(('127.0.0.1', $port))
    s.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
" >/dev/null 2>&1
    return $?
  fi
  return 1
}

start_service_async() {
  local cli_path="$DEST/packages/cli/dist/cli.js"
  if [ ! -f "$cli_path" ]; then
    say "  [skip] $cli_path not found, cannot start service" >&2
    return 1
  fi

  step "Starting ccw service..."
  # Detach so this installer can exit. stdout/stderr go to a per-spawn
  # log so a startup failure is debuggable.
  local log_dir="$HOME/.ccw/logs"
  mkdir -p "$log_dir" 2>/dev/null || true
  local log_path="$log_dir/ccw-startup-$(date +%Y%m%d-%H%M%S)-$$.log"
  if command -v nohup >/dev/null 2>&1; then
    nohup node "$cli_path" start >"$log_path" 2>&1 &
  else
    ( node "$cli_path" start >"$log_path" 2>&1 & )
  fi
  disown 2>/dev/null || true
  say "         startup log: $log_path" >&2

  local port
  port=$(detect_port)
  local max_wait=15
  local elapsed=0
  while [ "$elapsed" -lt "$max_wait" ]; do
    sleep 1
    elapsed=$((elapsed + 1))
    if is_port_listening "$port"; then
      ok "Service running on port $port"
      return 0
    fi
  done
  say "  [fail] Service did not start within ${max_wait}s. Check $log_dir/ for details." >&2
  return 1
}

open_ui() {
  local port
  port=$(detect_port)
  local ui_url="http://127.0.0.1:${port}/ui/"
  say "  [..] Opening UI at $ui_url"
  case "$(uname -s)" in
    Darwin)  open "$ui_url" >/dev/null 2>&1 || true ;;
    Linux)
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$ui_url" >/dev/null 2>&1 || true
      elif command -v sensible-browser >/dev/null 2>&1; then
        sensible-browser "$ui_url" >/dev/null 2>&1 || true
      else
        say "         No xdg-open / sensible-browser; open $ui_url manually." >&2
      fi
      ;;
    *)       say "         Unknown platform; open $ui_url manually." >&2 ;;
  esac
}

check_path() {
  # Match `$BIN_DIR` as a PATH entry, not as a substring. The previous
  # pattern `*":$BIN_DIR:"*` would falsely match `/home/u/.local/bin-other`
  # for `$BIN_DIR=/home/u/.local/bin`. Pure-bash whole-segment comparison
  # (no awk/tr) so this works on minimal systems.
  local p found=0
  local IFS=':'
  for p in $PATH; do
    if [ "$p" = "$BIN_DIR" ]; then
      found=1
      break
    fi
  done
  if [ "$found" -eq 1 ]; then
    say ""
    say "ccw installed. Open a NEW terminal and run:" >&2
    say "  $CMD_NAME --version" >&2
    say "  $CMD_NAME code" >&2
    say "" >&2
    say "Or, in the CURRENT terminal:" >&2
    say "  export PATH=\"\$PATH:$BIN_DIR\"" >&2
  else
    say ""
    say "NOTE: $BIN_DIR is not on your PATH." >&2
    say "Add this to your shell profile (~/.zshrc, ~/.bashrc, or ~/.profile):" >&2
    say "  export PATH=\"\$PATH:$BIN_DIR\"" >&2
    say "Then open a new terminal and run:" >&2
    say "  $CMD_NAME --version" >&2
    say "" >&2
    say "Or, in the CURRENT terminal:" >&2
    say "  export PATH=\"\$PATH:$BIN_DIR\"" >&2
  fi
}

banner
say "Checking prerequisites:"
check_node
check_git
ensure_pnpm
say ""
say "Installing:"
install_source
build_source
install_shim
install_global_shim
verify_shim
add_to_path
start_service_async || true
open_ui || true
check_path
