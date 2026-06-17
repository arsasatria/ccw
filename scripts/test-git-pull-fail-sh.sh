#!/usr/bin/env bash
# Test install.sh's install_source against a $DEST that is a git repo
# but has no 'origin' remote (or any other reason git pull --ff-only
# would fail). Expected: warn, backup, re-clone. Regression test for
# the previous behavior of `rm -rf "$DEST"` which silently destroyed
# the user's local data.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_SH="$PROJ_DIR/install.sh"

# Source only the function definitions from install.sh.
FUNC_FILE="$(mktemp -t install-sh-funcs.XXXXXX.sh)"
trap 'rm -f "$FUNC_FILE"' EXIT
awk '/^banner$/{exit} {print}' "$INSTALL_SH" > "$FUNC_FILE"

for fn in install_source build_source check_node acquire_lock get_installed_version; do
  if ! grep -q "^${fn}() {" "$FUNC_FILE"; then
    echo "INTERNAL: FUNC_FILE missing function $fn (functions may not have loaded)" >&2
    exit 1
  fi
done

TEST_DEST="$(mktemp -d -t ccw-pull-fail-test.XXXXXX)"
BIN_DIR="$(mktemp -d -t ccw-pull-fail-bin.XXXXXX)"

# Set up: a git repo with no 'origin' remote and a stray user file.
(
  set -euo pipefail
  cd "$TEST_DEST"
  git init -q
  git -c user.email=t@t -c user.name=t commit -q --allow-empty -m "initial"
  echo "user's own file" > "$TEST_DEST/local-changes.txt"
  git add .
  git -c user.email=t@t -c user.name=t commit -q -m "local-only"
  REMOTE_LIST="$(git remote | tr '\n' ' ')"
  echo "TEST SETUP: $TEST_DEST is a git repo with NO origin remote"
  echo "  remotes: '$REMOTE_LIST'"
  echo ""
)

# Run install_source
(
  set -euo pipefail
  # shellcheck disable=SC1090
  source "$FUNC_FILE"
  DEST="$TEST_DEST"
  BIN_DIR="$BIN_DIR"

  echo "RUNNING: install_source (expect: warn, backup, clone, no exit)"
  echo "=========================================="
  install_source
  echo "=========================================="
  echo ""

  echo "POST-RUN STATE:"
  if [ -d "$TEST_DEST/.git" ]; then
    REMOTE="$(cd "$TEST_DEST" && git remote | tr '\n' ' ')"
    if [[ "$REMOTE" == *origin* ]]; then
      echo "  [ok] $TEST_DEST has 'origin' remote (clone succeeded)"
    else
      echo "  [fail] $TEST_DEST has no 'origin' remote (clone didn't replace it)" >&2
      exit 1
    fi
  else
    echo "  [fail] $TEST_DEST/.git missing" >&2
    exit 1
  fi

  BACKUPS="$(ls -d "$TEST_DEST".bak.* 2>/dev/null || true)"
  if [ -n "$BACKUPS" ]; then
    echo "  [ok] Backup directory created: $(basename "$BACKUPS")"
    if [ -d "$BACKUPS/.git" ]; then
      echo "  [ok] Backup contains the original .git"
    else
      echo "  [fail] Backup does not contain .git" >&2
      exit 1
    fi
    if [ -f "$BACKUPS/local-changes.txt" ]; then
      echo "  [ok] Backup contains local-changes.txt (user data preserved)"
    else
      echo "  [fail] Backup missing local-changes.txt (rm -rf destroyed it)" >&2
      exit 1
    fi
  else
    echo "  [fail] No backup directory (rm -rf would have destroyed user data)" >&2
    exit 1
  fi
)

RC=$?

# Cleanup
rm -rf "$TEST_DEST" "$TEST_DEST".bak.* "$BIN_DIR" 2>/dev/null || true

if [ "$RC" -ne 0 ]; then
  echo "TEST FAILED" >&2
  exit 1
fi
echo ""
echo "TEST PASSED"
