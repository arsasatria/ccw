#!/usr/bin/env bash
# Test install.sh's "already up to date" skip path. After a fresh
# install, running install_source again should:
#   - detect the installed version (e.g. v2.1.0)
#   - detect that local commit == remote commit
#   - set REBUILD_NEEDED=0
#   - return without cloning or rebuilding
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_SH="$PROJ_DIR/install.sh"

# Source only the function definitions from install.sh.
FUNC_FILE="$(mktemp -t install-sh-funcs.XXXXXX.sh)"
trap 'rm -f "$FUNC_FILE"' EXIT
awk '/^banner$/{exit} {print}' "$INSTALL_SH" > "$FUNC_FILE"

# Sanity: required functions must be present.
for fn in install_source build_source get_installed_version get_local_commit get_remote_commit acquire_lock release_lock; do
  if ! grep -q "^${fn}() {" "$FUNC_FILE"; then
    echo "INTERNAL: FUNC_FILE missing function $fn" >&2
    exit 1
  fi
done

# Make a $DEST that looks like a freshly-cloned ccw install at the
# latest commit, so get_local_commit == get_remote_commit. We do a
# real local clone (not a fake `git init`) because the installer's
# "Already up to date" check compares the local short HEAD to
# `git ls-remote --heads origin main`. A fake empty commit would
# have a different hash and trigger the diverged-branches path,
# not the up-to-date path.
TEST_DEST="$(mktemp -d -t ccw-up-to-date-test.XXXXXX)"
mkdir -p "$TEST_DEST/packages/cli"
cat > "$TEST_DEST/packages/cli/package.json" <<'JSON'
{ "name": "@ccw/cli", "version": "2.1.0" }
JSON

# Clone the project locally (fast, no network). Use a separate temp
# dir for the clone so we can move just the .git into $TEST_DEST
# without overwriting the fake package.json we just wrote.
TMP_CLONE="$(mktemp -d -t ccw-up-to-date-clone.XXXXXX)"
if ! git clone --depth 1 -b main --no-checkout "$PROJ_DIR" "$TMP_CLONE" >/dev/null 2>&1; then
  echo "  [skip] local clone of $PROJ_DIR failed; cannot test up-to-date path"
  rm -rf "$TEST_DEST" "$TMP_CLONE"
  exit 0
fi
mv "$TMP_CLONE/.git" "$TEST_DEST/.git"
rm -rf "$TMP_CLONE"

# Sanity: confirm the local HEAD we just cloned matches the remote
# HEAD the installer will compare against. If not, the test isn't
# actually exercising the up-to-date path.
LOCAL_HEAD="$(cd "$TEST_DEST" && git rev-parse --short HEAD 2>/dev/null || echo "")"
REMOTE_HEAD="$(git ls-remote --heads origin main 2>/dev/null | awk '{print substr($1, 1, 7)}' | head -n 1)"
if [ -z "$LOCAL_HEAD" ] || [ -z "$REMOTE_HEAD" ] || [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
  echo "  [skip] local HEAD ($LOCAL_HEAD) != origin/main ($REMOTE_HEAD); not actually up-to-date"
  rm -rf "$TEST_DEST"
  exit 0
fi

# Source the function definitions in the main shell (NOT a subshell)
# so REBUILD_NEEDED changes inside install_source are visible to the
# checks below. Subshells inherit variables but don't propagate
# assignments back to the parent, so a `( ... )` wrapper would always
# see REBUILD_NEEDED=1 no matter what install_source did.
# shellcheck disable=SC1090
source "$FUNC_FILE"

DEST="$TEST_DEST"
BIN_DIR="$(mktemp -d -t ccw-up-to-date-bin.XXXXXX)"
FORCE_REINSTALL=0
REBUILD_NEEDED=1

echo "TEST: install_source on an up-to-date install"
echo "  DEST=$TEST_DEST"
# Capture to file (NOT `... | tee`) so install_source runs in the
# current shell and REBUILD_NEEDED changes are visible to the
# checks below. A pipeline forks a subshell for the LHS, which
# would isolate the variable write.
install_source > /tmp/install-output.txt 2>&1
cat /tmp/install-output.txt
echo ""

echo "POST-RUN STATE:"

# install_source should NOT have triggered a clone (no .git clone
# line should appear, but the [ok] "Already up to date" line should).
if grep -q "Already up to date" /tmp/install-output.txt; then
  echo "  [ok] install_source reported already up to date"
else
  echo "  [fail] install_source did not report 'Already up to date'" >&2
  exit 1
fi

if grep -q "Cloning" /tmp/install-output.txt; then
  echo "  [fail] install_source unexpectedly cloned (should be a no-op)" >&2
  exit 1
else
  echo "  [ok] install_source did not clone (no-op)"
fi

if [ "${REBUILD_NEEDED:-1}" -eq 0 ]; then
  echo "  [ok] REBUILD_NEEDED=0 (caller can skip build_source)"
else
  echo "  [fail] REBUILD_NEEDED=$REBUILD_NEEDED (expected 0)" >&2
  exit 1
fi

# build_source should be a no-op when REBUILD_NEEDED=0.
if build_source 2>&1 | grep -q "Skipping pnpm install"; then
  echo "  [ok] build_source skipped pnpm install + build"
else
  echo "  [fail] build_source did not skip pnpm install" >&2
  exit 1
fi

rm -rf "$TEST_DEST" "$BIN_DIR" /tmp/install-output.txt 2>/dev/null || true

echo ""
echo "TEST PASSED"
