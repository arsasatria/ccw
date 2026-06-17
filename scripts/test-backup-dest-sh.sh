#!/usr/bin/env bash
# Test install.sh's install_source against a $DEST that exists but is
# NOT a git repo. Expected: backup created, clone succeeds, user's
# stray files preserved in the backup. Regression test for the
# "exists but is not a git repo. Remove it and re-run" hard-fail that
# shipped in the original install.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_SH="$PROJ_DIR/install.sh"

# Source only the function definitions from install.sh — not the main
# flow at the bottom. The main flow starts with a bare `banner` call
# (no parens), which we use as a stop marker.
FUNC_FILE="$(mktemp -t install-sh-funcs.XXXXXX.sh)"
trap 'rm -f "$FUNC_FILE"' EXIT
awk '/^banner$/{exit} {print}' "$INSTALL_SH" > "$FUNC_FILE"

# Sanity check: FUNC_FILE should contain the last function's closing
# brace. awk produces a trailing blank line, so we use grep to find
# the last non-blank line.
LAST="$(grep -v '^[[:space:]]*$' "$FUNC_FILE" | tail -n 1 | tr -d '[:space:]')"
if [[ "$LAST" != "}" ]]; then
  echo "INTERNAL: FUNC_FILE last non-blank line is not '}', got: '$LAST' (functions may not have loaded)" >&2
  exit 1
fi

# Test target: simulate a $DEST with stray files (no .git)
TEST_DEST="$(mktemp -d -t ccw-backup-dest-test.XXXXXX)"
echo "stray data from previous install" > "$TEST_DEST/stray-file.txt"
echo '{"port": 9999}' > "$TEST_DEST/config.json"
# Override DEST and BIN_DIR for the sourced installer
# shellcheck disable=SC1090
BIN_DIR="$(mktemp -d -t ccw-backup-dest-bin.XXXXXX)"
# We can't override DEST inside the sourced file because it's a
# top-level assignment, not an environment variable. Re-source with a
# re-assignment:
(
  set -euo pipefail
  source "$FUNC_FILE"
  DEST="$TEST_DEST"
  BIN_DIR="$BIN_DIR"

  echo "TEST SETUP: $TEST_DEST is a non-git directory with 2 stray files"
  ls -1 "$TEST_DEST"
  echo ""

  echo "RUNNING: install_source (expect: backup then clone, no exit)"
  echo "=========================================="
  install_source
  echo "=========================================="
  echo ""

  echo "POST-RUN STATE:"
  if [ -d "$TEST_DEST/.git" ]; then
    echo "  [ok] $TEST_DEST/.git exists (it's a git repo now)"
  else
    echo "  [fail] $TEST_DEST/.git missing" >&2
    exit 1
  fi

  # Look for backup dirs in the parent
  BACKUPS="$(ls -d "$TEST_DEST".bak.* 2>/dev/null || true)"
  if [ -n "$BACKUPS" ]; then
    echo "  [ok] Backup directory(ies) created:"
    echo "$BACKUPS" | sed 's/^/         /'
    if [ -f "$BACKUPS/stray-file.txt" ] && [ -f "$BACKUPS/config.json" ]; then
      echo "  [ok] Backup contains the original stray files"
    else
      echo "  [fail] Backup does not contain the original stray files" >&2
      exit 1
    fi
  else
    echo "  [fail] No backup directory created (user's data would be lost)" >&2
    exit 1
  fi
)

CLEANUP_RC=$?
# Cleanup
rm -rf "$TEST_DEST" "$TEST_DEST".bak.* "$BIN_DIR" 2>/dev/null || true

if [ "$CLEANUP_RC" -ne 0 ]; then
  echo "TEST FAILED" >&2
  exit 1
fi
echo ""
echo "TEST PASSED"
