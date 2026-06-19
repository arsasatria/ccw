#!/usr/bin/env bash
#
# CCW installer (Claude Code Wrapper) for macOS / Linux
#
# One-line install:
#   curl -fsSL https://raw.githubusercontent.com/arsasatria/ccw/main/install.sh | bash
#
# Re-running is safe and acts as an updater:
#   - If an install already exists at the same commit, the installer
#     skips the build (idempotent no-op).
#   - If a newer commit is on origin, it pulls + rebuilds.
#   - If --reinstall is passed, the existing tree is backed up and
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
#   6. Drops a `ccw` shim in $BIN_DIR that invokes the built binary
#   7. Tries to drop a global shim in a PATH-on dir (/usr/local/bin, ~/.local/bin)
#   8. Verifies the shim works by running `ccw --version`
#   9. Adds $BIN_DIR to PATH if it isn't already
#  10. Auto-spawns the ccw gateway service and verifies the port is listening
#  11. Tries to open the UI in the user's browser

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
# Lock file: prevents two installers (or `ccw update` + installer)
# from racing on the same $DEST. The file holds the PID of the
# running install; a stale lock (process gone) is removed on next run.
LOCK_FILE="${TMPDIR:-/tmp}/ccw-install.lock"
ACQUIRED_LOCK=0
FORCE_REINSTALL=0
REBUILD_NEEDED=1
# Per-run install log. Every wrapped command's combined output is written
# here so a failure can be diagnosed without re-running anything.
LOG_FILE="$HOME/.ccw/logs/install-$(date +%Y%m%d-%H%M%S)-$$.log"
# Working directory hint for ui_run (cleared after use).
UI_CWD=""

# --- terminal capability detection -------------------------------------
# Only animate the spinner and emit ANSI colors when stderr is a real
# terminal. When output is redirected to a file or pipe (e.g. the
# regression tests capture `2>&1`), we print plain progress lines and
# skip animation so logs stay readable and grep-stable.
if [ -t 2 ]; then
  C_RESET='\033[0m'
  C_GREEN='\033[32m'
  C_RED='\033[31m'
  C_CYAN='\033[36m'
  C_DIM='\033[2m'
  C_BOLD='\033[1m'
else
  C_RESET=''
  C_GREEN=''
  C_RED=''
  C_CYAN=''
  C_DIM=''
  C_BOLD=''
fi

# --- output helpers (single definition) --------------------------------
# NOTE: previously these four helpers were defined twice (once before
# usage() at the top, once again right after usage()). The second set
# silently shadowed the first with identical bodies — harmless but
# confusing. There is now exactly one definition.
say()  { printf '%s\n' "$*"; }
ok()   { printf '  %b✓%b %s\n' "$C_GREEN" "$C_RESET" "$*"; }
step() { printf '  %b..%b %s\n' "$C_DIM" "$C_RESET" "$*"; }
warn() { printf '  %b!%b %s\n' "$C_CYAN" "$C_RESET" "$*" >&2; }
fail() { printf '  %b✗ %s%b\n' "$C_RED" "$*" "$C_RESET" >&2; exit 1; }

# --- animated step runner ----------------------------------------------
# ui_run <label> <command> [args...]
#
# Runs a (potentially long) command with its combined stdout+stderr
# captured to $LOG_FILE. In a real terminal it shows an animated
# spinner + label on a single line, updated in place; when the command
# finishes the line is replaced with either:
#     ✓ <label> — <elapsed>
# or, on failure, the caller is expected to call print_diagnostic.
#
# When stderr is not a terminal (piped to a file, e.g. tests), no
# animation happens — a plain `[..] <label>` line is printed first so
# logs/tests stay readable and the label string is still greppable.
#
# Honors $UI_CWD: if set, the command runs inside that directory
# (inside a subshell, so the caller's CWD is untouched).
ui_run() {
  local label="$1"; shift
  local start elapsed tstr pid rc
  start=$(date +%s)
  rc=0
  # Ensure the log directory exists before redirecting into it.
  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

  if [ -t 2 ]; then
    # Animated path: background the command, spin until it exits.
    if [ -n "$UI_CWD" ]; then
      ( cd "$UI_CWD" && "$@" ) >"$LOG_FILE" 2>&1 &
    else
      ( "$@" ) >"$LOG_FILE" 2>&1 &
    fi
    pid=$!
    local frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
      printf '\r  %b%s%b %s' "$C_CYAN" "${frames:$((i % 10)):1}" "$C_RESET" "$label" >&2
      i=$((i + 1))
      sleep 0.1
    done
    wait "$pid" || rc=$?
    printf '\r\033[K' >&2  # clear the spinner line
  else
    # Non-interactive path: one plain line, command silent to the log.
    printf '  [..] %s\n' "$label"
    if [ -n "$UI_CWD" ]; then
      ( cd "$UI_CWD" && "$@" ) >"$LOG_FILE" 2>&1 || rc=$?
    else
      "$@" >"$LOG_FILE" 2>&1 || rc=$?
    fi
  fi

  elapsed=$(( $(date +%s) - start ))
  if [ "$elapsed" -le 0 ]; then tstr="<1s"; else tstr="${elapsed}s"; fi
  if [ "$rc" -eq 0 ]; then
    printf '  %b✓%b %s — %s\n' "$C_GREEN" "$C_RESET" "$label" "$tstr"
  else
    printf '  %b✗%b %s\n' "$C_RED" "$C_RESET" "$label" >&2
  fi
  return "$rc"
}

# --- error diagnostics -------------------------------------------------
# print_diagnostic <step-label> <exit-code> <log-file>
#
# Inspects the tail of the captured log, matches it against a catalog of
# known failure patterns, and prints a human-readable diagnostic block:
# what happened, the likely cause, and concrete steps to fix it.
print_diagnostic() {
  local label="$1" rc="$2" log="$3"
  local snippet=""
  [ -f "$log" ] && snippet=$(tail -60 "$log" 2>/dev/null || true)

  local cause="" fix=""
  if printf '%s' "$snippet" | grep -qiE "cannot find module[^@]*@?esbuild|installed esbuild for another platform|esbuild's binary|You installed esbuild"; then
    cause="esbuild's native platform binary is missing. pnpm 8+ skips dependency postinstall scripts by default, so the @esbuild/<os>-<arch> binary was never downloaded and the first esbuild call fails."
    fix="cd \"$DEST\" && pnpm rebuild
  (this re-runs the skipped postinstall scripts)
Then re-run this installer. If it still fails, install the platform
package directly, e.g.:
  npm i -g @esbuild/linux-x64   # or darwin-arm64 / win32-x64"
  elif printf '%s' "$snippet" | grep -qiE "ERR_PNPM_OUTDATED_LOCKFILE|lockfile.*(out of sync|not up to date)|imported from a (newer|different)"; then
    cause="The pnpm lockfile is out of sync with package.json (common right after a release that bumped dependencies)."
    fix="The installer already retries without --frozen-lockfile. If that also
failed, regenerate the lockfile manually:
  cd \"$DEST\" && rm -f pnpm-lock.yaml && pnpm install
Then re-run this installer."
  elif printf '%s' "$snippet" | grep -qiE "EACCES|permission denied|EPERM|operation not permitted"; then
    cause="A file or directory could not be written (permission denied)."
    fix="Check write permissions on \"$DEST\" and \"$HOME/.ccw\".
On macOS/Linux you may need to claim ownership:
  sudo chown -R \"\$USER\" \"$DEST\""
  elif printf '%s' "$snippet" | grep -qiE "ENOSPC|no space left on|disk full"; then
    cause="The disk is full."
    fix="Free up space on the volume holding \"$DEST\" and re-run."
  elif printf '%s' "$snippet" | grep -qiE "ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|Could not resolve host|getaddrinfo|Network is unreachable"; then
    cause="A network request failed (DNS lookup failed, host unreachable, or connection timed out) while fetching packages."
    fix="Check your internet connection, proxy, or VPN settings, then re-run.
If behind a corporate proxy, set:
  export HTTPS_PROXY=http://your-proxy:port"
  elif printf '%s' "$snippet" | grep -qiE "error TS[0-9]+"; then
    cause="A TypeScript type error occurred during the build (tsc). This is usually a code defect in the repo at this commit, not an environment issue."
    fix="See the 'error TSxxxx' lines in the full log below. If this is the
latest commit, please report it. To inspect locally:
  cd \"$DEST\" && pnpm build"
  elif printf '%s' "$snippet" | grep -qiE "ERR_PNPM_PEER_DEP_ISSUES|peer dep"; then
    cause="A peer dependency conflict was detected during install."
    fix="Try a clean dependency install:
  cd \"$DEST\" && rm -rf node_modules && pnpm install"
  elif printf '%s' "$snippet" | grep -qiE "'(pnpm|node|git)' is not recognized|command not found|executable file not found|No such file or directory|ENOENT.*spawn"; then
    # Covers Windows: \"'pnpm' is not recognized as an internal or external command\"
    # and POSIX: \"pnpm: command not found\", \"env: 'pnpm': No such file or directory\".
    if printf '%s' "$snippet" | grep -qiE "pnpm"; then
      cause="The pnpm executable could not be found on PATH. Either pnpm is not installed, or your installer run is using a PATH that doesn't include the directory pnpm is installed in."
      fix="Install pnpm globally: npm install -g pnpm@9
Then re-run this installer. If pnpm IS installed but the error
persists, open a NEW terminal so the updated PATH is loaded, or run:
  $ "$CCW_BIN_DIR/ccw env"  # shows the path the installer is using"
    elif printf '%s' "$snippet" | grep -qiE "git"; then
      cause="The git executable could not be found on PATH."
      fix="Install Git for Windows from https://git-scm.com/download/win,
or on macOS: xcode-select --install,
or on Linux: apt install git / dnf install git / apk add git"
    else
      cause="A required executable (node, pnpm, or git) could not be found on PATH."
      fix="Install Node.js >= 20 from https://nodejs.org, then:
  npm install -g pnpm@9
Then re-run this installer."
    fi
  else
    cause="The command exited non-zero and no specific known pattern matched."
    fix="Open the full log below and search for the first 'error' / 'Error'
line. If unsure, re-run with a clean slate:
  bash install.sh --reinstall"
  fi

  cat >&2 <<EOF

$(printf '  %b✗ %s — exit %s%b' "$C_RED" "$label" "$rc" "$C_RESET")

  ── Diagnostic ────────────────────────────────────────────
  Step:          $label
  Likely cause:  $cause

  How to fix:
$(printf '%s\n' "$fix" | sed 's/^/    /')

  Full log:
    $log
  ──────────────────────────────────────────────────────────
EOF
}

# diagnose_and_fail <step-label> <exit-code>
# Convenience: diagnose from $LOG_FILE then abort.
diagnose_and_fail() {
  print_diagnostic "$1" "$2" "$LOG_FILE"
  fail "Installation failed at step: $1"
}

usage() {
  cat <<EOF
Usage: bash install.sh [options]

Options:
  --reinstall, -r   Force a clean reinstall. The existing \$DEST is
                    backed up to \$DEST.bak.<timestamp> and replaced
                    with a fresh clone. Use this if your install is
                    in a bad state (broken build, wrong files) or to
                    discard local source changes.
  --help, -h        Show this help.

Environment:
  CCW_HOME          Override install location (default: \$HOME/.local/share/ccw)
  CCW_BIN_DIR       Override shim directory (default: \$HOME/.local/bin)

Examples:
  curl -fsSL https://raw.githubusercontent.com/arsasatria/ccw/main/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/arsasatria/ccw/main/install.sh | bash -s -- --reinstall
EOF
}

banner() {
  say ""
  printf '  %bCCW%b · Claude Code Wrapper\n' "$C_BOLD" "$C_RESET"
  printf '  %binstaller · github.com/%s/%s%b\n' "$C_DIM" "$REPO_OWNER" "$REPO_NAME" "$C_RESET"
  say ""
}

# Parse argv. We only accept the flags documented in usage(); anything
# else is treated as "no argument" so a stray word doesn't accidentally
# change behavior. Args after `--` are common in `curl ... | bash -s --`
# invocations.
parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --reinstall|-r) FORCE_REINSTALL=1 ;;
      --help|-h)      usage; exit 0 ;;
      --)             shift; break ;;
      *)              warn "Unknown argument: $1 (ignored)" ;;
    esac
    shift
  done
}

# Acquire a PID-based lock so two installers don't race on $DEST. A
# stale lock (process gone) is removed so a real failure doesn't
# permanently block the next install.
acquire_lock() {
  if [ -f "$LOCK_FILE" ]; then
    local other_pid
    other_pid=$(cat "$LOCK_FILE" 2>/dev/null || true)
    if [ -n "$other_pid" ] && kill -0 "$other_pid" 2>/dev/null; then
      fail "Another CCW install is in progress (pid $other_pid). If this is wrong, delete $LOCK_FILE and re-run."
    fi
    warn "Removing stale lock from pid $other_pid"
    rm -f "$LOCK_FILE"
  fi
  echo "$$" > "$LOCK_FILE"
  ACQUIRED_LOCK=1
}

release_lock() {
  if [ "$ACQUIRED_LOCK" -eq 1 ]; then
    rm -f "$LOCK_FILE"
    ACQUIRED_LOCK=0
  fi
}

# Read the installed CLI version from $DEST/packages/cli/package.json.
# Returns "2.1.0" or empty if the file doesn't exist (fresh install
# or unknown source layout).
get_installed_version() {
  local pkg="$DEST/packages/cli/package.json"
  [ -f "$pkg" ] || return 0
  grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$pkg" 2>/dev/null \
    | head -n 1 \
    | sed -E 's/.*"([^"]+)".*/\1/'
}

# Local short commit (7 chars). Empty if $DEST is not a git checkout.
get_local_commit() {
  [ -d "$DEST/.git" ] || return 0
  ( cd "$DEST" && git rev-parse --short HEAD 2>/dev/null ) || true
}

# Remote short commit on origin/$BRANCH. Empty if `git ls-remote`
# fails (no network, or repo moved).
get_remote_commit() {
  git ls-remote --heads origin "$BRANCH" 2>/dev/null \
    | awk '{print substr($1, 1, 7)}' \
    | head -n 1
}

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js not found. Install Node.js >= 20 from https://nodejs.org"
  fi
  local v major
  v=$(node -v)
  major="${v#v}"
  major="${major%%.*}"
  if ! [[ "$major" =~ ^[0-9]+$ ]] || [ "$major" -lt 20 ]; then
    fail "Node.js >= 20 required (found $v). Upgrade at https://nodejs.org"
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
  local ts backup
  ts=$(date +%Y%m%d-%H%M%S)
  backup="${DEST}.bak.${ts}"
  step "Moving existing $DEST to $backup"
  rm -rf "$backup" 2>/dev/null || true
  if ! mv "$DEST" "$backup" 2>/dev/null; then
    fail "Could not move $DEST to ${backup}. Stop any running CCW service (ccw stop) and remove $DEST manually, then re-run."
  fi
  ok "Backed up to $backup (safe to delete after you confirm the new install works)"
}

install_source() {
  # Detect what is already on disk before we do anything. The user
  # re-running the installer should see exactly what changed (or
  # nothing, if already up to date).
  local installed_version local_commit remote_commit
  installed_version=$(get_installed_version)
  local_commit=$(get_local_commit)
  remote_commit=$(get_remote_commit)

  say ""
  step "Source: $DEST"
  if [ -n "$installed_version" ]; then
    step "Installed version: v$installed_version"
  else
    step "Installed version: (none — fresh install)"
  fi
  if [ -n "$local_commit" ]; then
    step "Local commit:      $local_commit"
  fi
  if [ -n "$remote_commit" ]; then
    step "Remote commit:     $remote_commit (origin/$BRANCH)"
  else
    step "Remote commit:     (no network or repo moved)"
  fi

  # --reinstall: always back up and re-clone, even when up to date.
  if [ "$FORCE_REINSTALL" -eq 1 ] && [ -e "$DEST" ]; then
    if [ -n "$installed_version" ]; then
      step "--reinstall: backing up v$installed_version and re-cloning"
    else
      step "--reinstall: backing up existing $DEST and re-cloning"
    fi
    backup_dest
    REBUILD_NEEDED=1
  elif [ -d "$DEST/.git" ]; then
    # Already a git checkout. Try the cheapest path first: fast-forward.
    if [ -n "$local_commit" ] && [ -n "$remote_commit" ] && [ "$local_commit" = "$remote_commit" ]; then
      if [ -n "$installed_version" ]; then
        ok "Already up to date (v$installed_version, commit $local_commit)"
      else
        ok "Already up to date (commit $local_commit)"
      fi
      REBUILD_NEEDED=0
      return 0
    fi
    step "Updating existing install at $DEST"
    # --ff-only avoids the "divergent branches" warning that plain `git pull`
    # emits when local and remote have any commit difference.
    local pull_output after_commit
    pull_output=$( ( cd "$DEST" && git pull --ff-only --depth 1 origin "$BRANCH" ) 2>&1 ) && {
      after_commit=$(get_local_commit)
      if [ "$local_commit" = "$after_commit" ]; then
        if [ -n "$installed_version" ]; then
          ok "Already up to date (v$installed_version, commit $after_commit)"
        else
          ok "Already up to date (commit $after_commit)"
        fi
        REBUILD_NEEDED=0
      else
        ok "Updated: $local_commit -> $after_commit"
        REBUILD_NEEDED=1
      fi
      return 0
    }
    # Pull failed for any reason (no origin, divergent history, no network).
    warn "git pull failed; will back up and re-clone"
    [ -n "$pull_output" ] && printf '%s\n' "$pull_output" | sed 's/^/         /' >&2
    backup_dest
    REBUILD_NEEDED=1
  elif [ -e "$DEST" ]; then
    # $DEST exists but is not a git repo (leftover from a partial install,
    # a renamed/moved directory, or a user-managed file at this path).
    step "$DEST exists but is not a git repo; backing it up and re-cloning"
    backup_dest
    REBUILD_NEEDED=1
  else
    REBUILD_NEEDED=1
  fi

  # Pre-check: parent dir must be writable. mkdir -p on an unwritable
  # parent would fail late (during clone) with a confusing ENOENT/
  # permission error. Surface a clear diagnostic upfront instead.
  local dest_parent
  dest_parent=$(dirname "$DEST")
  if [ ! -d "$dest_parent" ] && ! mkdir -p "$dest_parent" 2>/dev/null; then
    fail "Cannot create install parent directory: $dest_parent
  Reason: not writable by the current user.
  Fix:    set CCW_HOME to a directory you can write to, e.g.
          export CCW_HOME=\"\$HOME/.local/share/ccw\"
          then re-run this installer."
  fi
  if [ -d "$dest_parent" ] && [ ! -w "$dest_parent" ]; then
    fail "Install parent directory is not writable: $dest_parent
  Reason: $dest_parent exists but the current user has no write permission.
  Fix:    pick a different install location via:
          export CCW_HOME=\"\$HOME/.local/share/ccw\"
          then re-run this installer."
  fi

  mkdir -p "$dest_parent"
  # The label below intentionally contains the word "Cloning" — the
  # regression tests grep for it, and ui_run echoes the label to stdout.
  if ! ui_run "Cloning $REPO_URL" git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$DEST"; then
    diagnose_and_fail "git clone" "$?"
  fi
  local new_version
  new_version=$(get_installed_version)
  if [ -n "$new_version" ]; then
    step "Installed version: v$new_version (just cloned)"
  fi
}

build_source() {
  # install_source sets REBUILD_NEEDED=0 when the source is already
  # up to date. In that case we skip pnpm install + pnpm build
  # entirely — the existing build artifacts and node_modules are still
  # valid. (This exact message is asserted by the regression tests.)
  if [ "${REBUILD_NEEDED:-1}" -eq 0 ]; then
    say "  [..]   Skipping pnpm install + build (no source change)"
    return 0
  fi

  UI_CWD="$DEST"
  # pnpm install. Try --frozen-lockfile first (reproducible, matches CI);
  # fall back to a regenerating install if the lockfile drifted. Each
  # attempt runs exactly once via ui_run so its output is captured to
  # $LOG_FILE for diagnostics (no more silent /dev/null swallowing).
  if ! ui_run "Installing dependencies (frozen lockfile)" pnpm install --frozen-lockfile; then
    warn "frozen lockfile install failed; retrying without --frozen-lockfile"
    if ! ui_run "Installing dependencies (lockfile update)" pnpm install; then
      UI_CWD=""
      diagnose_and_fail "pnpm install" "$?"
    fi
  fi

  # pnpm 8+ ignores postinstall scripts by default for security.
  # esbuild and other native-binary packages need their postinstall to
  # run, otherwise the build fails later with "Cannot find module".
  # `pnpm rebuild` re-runs the skipped scripts for already-installed
  # deps. Non-fatal: some deps legitimately have nothing to rebuild.
  ui_run "Running postinstall scripts (pnpm rebuild)" pnpm rebuild || warn "pnpm rebuild reported an issue (continuing)"

  if ! ui_run "Building packages (pnpm build)" pnpm build; then
    UI_CWD=""
    diagnose_and_fail "pnpm build" "$?"
  fi
  UI_CWD=""
}

install_shim() {
  mkdir -p "$BIN_DIR"
  cat > "$BIN_DIR/$CMD_NAME" <<EOF
#!/usr/bin/env bash
# CCW (Claude Code Wrapper) shim — forwards to the built CLI bundle.
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

  warn "No writable PATH dir found; rely on the PATH-add step below (open a new terminal)."
}

# Verifies the shim actually works by running `ccw --version`. We use the
# full path to the shim so this works even if $BIN_DIR is not yet on PATH
# for the current shell.
verify_shim() {
  local shim_path="$BIN_DIR/$CMD_NAME"
  local cli_dist="$DEST/packages/cli/dist/cli.js"
  if [ ! -x "$shim_path" ]; then
    fail "shim not executable at $shim_path"
  fi
  if [ ! -f "$cli_dist" ]; then
    fail "Built binary not found at $cli_dist. Run pnpm build manually in $DEST."
  fi
  local out
  if ! out=$("$shim_path" --version 2>&1); then
    fail "shim exited non-zero. Check that Node 20+ is on PATH and $cli_dist exists."
  fi
  ok "shim works: ccw --version -> $out"
}

# Detect the user's shell and report which profile $BIN_DIR should be
# added to. We don't auto-edit the rc file (a wrong edit can break the
# user's shell); we just print a clear instruction.
add_to_path() {
  local rc_file=""
  case "${SHELL:-}" in
    */zsh)  rc_file="$HOME/.zshrc" ;;
    */bash) rc_file="$HOME/.bashrc" ;;
    */fish) rc_file="$HOME/.config/fish/config.fish" ;;
    *)      rc_file="$HOME/.profile" ;;
  esac
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
  warn "$BIN_DIR is not on PATH for this shell"
  say "         Add this to $rc_file (or the rc file for ${SHELL:-your shell}):"
  say "           export PATH=\"\$PATH:$BIN_DIR\""
  say "         Then open a new terminal."
}

# Parse the port from ~/.ccw/config.json, falling back to the default.
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

# Polls the ccw port. Returns 0 if listening, 1 otherwise.
is_port_listening() {
  local port="$1"
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    return $?
  fi
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
    warn "$cli_path not found, cannot start service"
    return 1
  fi

  step "Starting CCW service..."
  local log_dir="$HOME/.ccw/logs"
  mkdir -p "$log_dir" 2>/dev/null || true
  local log_path="$log_dir/ccw-startup-$(date +%Y%m%d-%H%M%S)-$$.log"
  # Detach so this installer can exit. stdout/stderr go to a per-spawn
  # log so a startup failure is debuggable. disown defensively so the
  # background process survives the shell exit under `set -e`.
  if command -v nohup >/dev/null 2>&1; then
    nohup node "$cli_path" start >"$log_path" 2>&1 &
  else
    ( node "$cli_path" start >"$log_path" 2>&1 & )
  fi
  disown 2>/dev/null || true
  say "         startup log: $log_path"

  local port max_wait elapsed
  port=$(detect_port)
  max_wait=15
  elapsed=0
  while [ "$elapsed" -lt "$max_wait" ]; do
    sleep 1
    elapsed=$((elapsed + 1))
    if is_port_listening "$port"; then
      ok "Service running on port $port"
      return 0
    fi
  done
  warn "Service did not start within ${max_wait}s. Check $log_dir/ for details."
  return 1
}

open_ui() {
  local port ui_url
  port=$(detect_port)
  ui_url="http://127.0.0.1:${port}/ui/"
  step "Opening UI at $ui_url"
  case "$(uname -s)" in
    Darwin)  open "$ui_url" >/dev/null 2>&1 || true ;;
    Linux)
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$ui_url" >/dev/null 2>&1 || true
      elif command -v sensible-browser >/dev/null 2>&1; then
        sensible-browser "$ui_url" >/dev/null 2>&1 || true
      else
        warn "No xdg-open / sensible-browser; open $ui_url manually."
      fi
      ;;
    *)       warn "Unknown platform; open $ui_url manually." ;;
  esac
}

check_path() {
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
    say "CCW installed. Open a NEW terminal and run:"
    say "  $CMD_NAME --version"
    say "  $CMD_NAME code"
    say ""
    say "Or, in the CURRENT terminal:"
    say "  export PATH=\"\$PATH:$BIN_DIR\""
  else
    say ""
    say "NOTE: $BIN_DIR is not on your PATH."
    say "Add this to your shell profile (~/.zshrc, ~/.bashrc, or ~/.profile):"
    say "  export PATH=\"\$PATH:$BIN_DIR\""
    say "Then open a new terminal and run:"
    say "  $CMD_NAME --version"
    say ""
    say "Or, in the CURRENT terminal:"
    say "  export PATH=\"\$PATH:$BIN_DIR\""
  fi
}

# Acquire the lock BEFORE prereq checks. If two installers race
# (e.g. a user opens two terminals and runs the install in both),
# the second one fails fast with a clear message rather than
# corrupting $DEST. The trap releases the lock on any exit, including
# Ctrl+C and prereq failures.
parse_args "$@"
trap release_lock EXIT INT TERM
acquire_lock

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

# Print a final summary line so the user can see at a glance what
# the install did (update vs fresh install vs no-op).
final_version=$(get_installed_version)
final_commit=$(get_local_commit)
if [ -n "$final_version" ] && [ -n "$final_commit" ]; then
  say ""
  printf '  %bCCW v%s%b (commit %s) ready at %s\n' "$C_GREEN" "$final_version" "$C_RESET" "$final_commit" "$DEST"
  if [ "${REBUILD_NEEDED:-1}" -eq 0 ]; then
    say "  (no source change since last install; build was skipped)"
  fi
fi
