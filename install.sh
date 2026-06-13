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
#   4. Runs pnpm install + pnpm build
#   5. Drops a `ccw` shim in ~/.local/bin that invokes the built binary
#   6. Adds ~/.local/bin to PATH if it isn't already
#
# Re-running is safe and acts as an updater.

set -euo pipefail

REPO_OWNER="arsasatria"
REPO_NAME="ccw"
BRANCH="main"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}"
DEST="${CCW_HOME:-$HOME/.local/share/ccw}"
BIN_DIR="${CCW_BIN_DIR:-$HOME/.local/bin}"
CMD_NAME="ccw"

say()  { printf '%s\n' "$*" >&2; }
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
  if [ "$major" -lt 20 ]; then
    fail "Node.js >= 20 required (found $v)"
  fi
  ok "node $v"
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
  corepack enable >/dev/null
  corepack prepare pnpm@9.15.0 --activate >/dev/null
  ok "pnpm $(pnpm --version) (via corepack)"
}

install_source() {
  if [ -d "$DEST/.git" ]; then
    step "Updating existing install at $DEST"
    # --ff-only avoids the "divergent branches" warning that plain `git pull`
    # emits when local and remote have any commit difference.
    if ( cd "$DEST" && git pull --ff-only --depth 1 origin main ) >/dev/null 2>&1; then
      ok "Updated to latest"
      return
    fi
    # Fast-forward failed: local history diverged (e.g. an old install with
    # commits that no longer exist on origin). Re-clone cleanly.
    step "Local state diverged from origin; re-cloning cleanly..."
    rm -rf "$DEST"
  elif [ -e "$DEST" ]; then
    fail "$DEST exists but is not a git repo. Remove it and re-run."
  fi
  step "Cloning $REPO_URL -> $DEST"
  mkdir -p "$(dirname "$DEST")"
  git clone --depth 1 -b main "$REPO_URL" "$DEST" || fail "git clone failed"
}

build_source() {
  step "pnpm install --frozen-lockfile (this can take a minute on first run)"
  ( cd "$DEST" && pnpm install --frozen-lockfile ) || fail "pnpm install failed"
  step "pnpm build"
  ( cd "$DEST" && pnpm build ) || fail "pnpm build failed"
}

install_shim() {
  mkdir -p "$BIN_DIR"
  cat > "$BIN_DIR/$CMD_NAME" <<EOF
#!/usr/bin/env bash
exec node "$DEST/packages/cli/dist/cli.js" "\$@"
EOF
  chmod +x "$BIN_DIR/$CMD_NAME"
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
      printf '%s\n' "$global_shim" > "/usr/local/bin/$CMD_NAME"
      chmod +x "/usr/local/bin/$CMD_NAME"
      ok "Global shim at /usr/local/bin/$CMD_NAME (no sudo, already on PATH)"
      return
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
    printf '%s\n' "$global_shim" > "$HOME/.local/bin/$CMD_NAME"
    chmod +x "$HOME/.local/bin/$CMD_NAME"
    ok "Global shim at $HOME/.local/bin/$CMD_NAME (already on PATH)"
    return
  fi

  say "  [skip] No writable PATH dir found; rely on the user-profile edit below."
}

check_path() {
  case ":$PATH:" in
    *":$BIN_DIR:"*)
      say ""
      say "ccw installed. Open a NEW terminal and run:" >&2
      say "  $CMD_NAME --version" >&2
      say "  $CMD_NAME code" >&2
      say "" >&2
      say "Or, in the CURRENT terminal:" >&2
      say "  export PATH=\"\$PATH:$BIN_DIR\"" >&2
      ;;
    *)
      say ""
      say "NOTE: $BIN_DIR is not on your PATH." >&2
      say "Add this to your shell profile (~/.zshrc, ~/.bashrc, or ~/.profile):" >&2
      say "  export PATH=\"\$PATH:$BIN_DIR\"" >&2
      say "Then open a new terminal and run:" >&2
      say "  $CMD_NAME --version" >&2
      say "" >&2
      say "Or, in the CURRENT terminal:" >&2
      say "  export PATH=\"\$PATH:$BIN_DIR\"" >&2
      ;;
  esac
}

banner
say "Checking prerequisites:"
check_node
ensure_pnpm
say ""
say "Installing:"
install_source
build_source
install_shim
install_global_shim
ok "Local shim: $BIN_DIR/$CMD_NAME (source: $DEST)"
check_path
