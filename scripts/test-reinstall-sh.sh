#!/usr/bin/env bash
# Test install.sh's --reinstall flag. When set, an existing install
# must be backed up and replaced with a fresh clone, even if the
# existing install is at the latest commit.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_SH="$PROJ_DIR/install.sh"

FUNC_FILE="$(mktemp -t install-sh-funcs.XXXXXX.sh)"
trap 'rm -f "$FUNC_FILE"' EXIT
awk '/^banner$/{exit} {print}' "$INSTALL_SH" > "$FUNC_FILE"

# Sanity.
for fn in install_source parse_args; do
  if ! grep -q "^${fn}() {" "$FUNC_FILE"; then
    echo "INTERNAL: FUNC_FILE missing function $fn" >&2
    exit 1
  fi
done

# Make a $DEST that looks like a freshly-cloned ccw install at the
# latest commit. We'll pass FORCE_REINSTALL=1 and verify it gets
# replaced with a fresh clone.
TEST_DEST="$(mktemp -d -t ccw-reinstall-test.XXXXXX)"
mkdir -p "$TEST_DEST/packages/cli"
cat > "$TEST_DEST/packages/cli/package.json" <<'JSON'
{ "name": "@ccw/cli", "version": "2.1.0" }
JSON
(
  cd "$TEST_DEST"
  rm -rf .git
  git init -q
  git remote add origin "$PROJ_DIR/.git" 2>/dev/null || true
  git -c user.email=t@t -c user.name=t commit -q --allow-empty -m "fake"
)

# Source function definitions in the MAIN shell (not a subshell) so
# REBUILD_NEEDED changes inside install_source are visible to the
# checks below. A `( ... )` wrapper would isolate variable writes.
# shellcheck disable=SC1090
source "$FUNC_FILE"

DEST="$TEST_DEST"
BIN_DIR="$(mktemp -d -t ccw-reinstall-bin.XXXXXX)"
FORCE_REINSTALL=1
REBUILD_NEEDED=1
# Don't acquire the lock (it would race with a real install in /tmp).
# The unit test exercises only install_source.

echo "TEST: install_source with FORCE_REINSTALL=1"
echo "  DEST=$TEST_DEST"
# Capture to file (NOT `... | tee`) so install_source runs in the
# current shell and REBUILD_NEEDED changes are visible to the checks.
install_source > /tmp/install-output.txt 2>&1
cat /tmp/install-output.txt
echo ""

echo "POST-RUN STATE:"

# The pre-existing dest should have been backed up.
BACKUPS="$(ls -d "$TEST_DEST".bak.* 2>/dev/null || true)"
if [ -n "$BACKUPS" ]; then
  echo "  [ok] Pre-existing $TEST_DEST was backed up:"
  echo "$BACKUPS" | sed 's/^/         /'
else
  echo "  [fail] No backup created" >&2
  exit 1
fi

# install_source should have triggered a fresh clone.
if grep -q "Cloning" /tmp/install-output.txt; then
  echo "  [ok] install_source triggered a fresh clone"
else
  echo "  [fail] install_source did not clone" >&2
  exit 1
fi

# The clone should now have a real origin remote.
if [ -d "$TEST_DEST/.git" ]; then
  REMOTE="$(cd "$TEST_DEST" && git remote | tr '\n' ' ')"
  if [[ "$REMOTE" == *origin* ]]; then
    echo "  [ok] $TEST_DEST has 'origin' remote (real clone)"
  else
    echo "  [fail] $TEST_DEST has no 'origin' remote" >&2
    exit 1
  fi
else
  echo "  [fail] $TEST_DEST/.git missing" >&2
  exit 1
fi

# REBUILD_NEEDED must be 1 (we did a fresh clone).
if [ "${REBUILD_NEEDED:-1}" -eq 1 ]; then
  echo "  [ok] REBUILD_NEEDED=1 (caller should rebuild)"
else
  echo "  [fail] REBUILD_NEEDED=$REBUILD_NEEDED (expected 1)" >&2
  exit 1
fi

rm -rf "$TEST_DEST" "$TEST_DEST".bak.* "$BIN_DIR" /tmp/install-output.txt 2>/dev/null || true
echo ""
echo "TEST PASSED"
