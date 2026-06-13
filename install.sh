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
    git -C "$DEST" pull --depth 1 || fail "git pull failed"
  else
    if [ -e "$DEST" ]; then
      fail "$DEST exists but is not a git repo. Remove it and re-run."
    fi
    step "Cloning $REPO_URL -> $DEST"
    mkdir -p "$(dirname "$DEST")"
    git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$DEST" || fail "git clone failed"
  fi
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

check_path() {
  case ":$PATH:" in
    *":$BIN_DIR:"*)
      say ""
      say "ccw installed. Open a NEW terminal and run:" >&2
      say "  $CMD_NAME --version" >&2
      say "  $CMD_NAME code" >&2
      ;;
    *)
      say ""
      say "NOTE: $BIN_DIR is not on your PATH." >&2
      say "Add this to your shell profile (~/.zshrc, ~/.bashrc, or ~/.profile):" >&2
      say "  export PATH=\"\$PATH:$BIN_DIR\"" >&2
      say "Then open a new terminal and run:" >&2
      say "  $CMD_NAME --version" >&2
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
ok "Installed: $BIN_DIR/$CMD_NAME (source: $DEST)"
check_path
