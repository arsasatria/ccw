#!/usr/bin/env bash
# Test install.sh's concurrency lock. A second install started while
# the first holds the lock must fail with a clear message. Stale
# locks (process gone) must be removed automatically.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_SH="$PROJ_DIR/install.sh"

FUNC_FILE="$(mktemp -t install-sh-funcs.XXXXXX.sh)"
trap 'rm -f "$FUNC_FILE"' EXIT
awk '/^banner$/{exit} {print}' "$INSTALL_SH" > "$FUNC_FILE"

for fn in acquire_lock release_lock; do
  if ! grep -q "^${fn}() {" "$FUNC_FILE"; then
    echo "INTERNAL: FUNC_FILE missing function $fn" >&2
    exit 1
  fi
done

# Use a dedicated lock file path so we don't conflict with anything
# real. acquire_lock reads/writes $LOCK_FILE directly; we set it
# before sourcing.
TEST_LOCK="$(mktemp -t ccw-lock-test.XXXXXX.lock)"

# Source function definitions in the MAIN shell (not a subshell) so
# LOCK_FILE/ACQUIRED_LOCK state is consistent across the test.
# shellcheck disable=SC1090
source "$FUNC_FILE"

LOCK_FILE="$TEST_LOCK"
ACQUIRED_LOCK=0

echo "TEST 1: acquire lock, second acquire must fail"
acquire_lock
if [ -f "$TEST_LOCK" ] && [ "$(cat "$TEST_LOCK")" = "$$" ]; then
  echo "  [ok] First acquire wrote PID $$ to $TEST_LOCK"
else
  echo "  [fail] First acquire did not write PID" >&2
  exit 1
fi

# Second acquire in a subshell must exit non-zero. We redirect both
# stdout and stderr so install.sh's "Another ccw install is in
# progress" message doesn't pollute the test output, then check the
# subshell's exit code with if/else in the parent (which catches the
# non-zero exit even with `set -e`).
if (
  LOCK_FILE="$TEST_LOCK"
  ACQUIRED_LOCK=0
  acquire_lock
) >/dev/null 2>&1; then
  echo "  [fail] Second acquire unexpectedly succeeded" >&2
  exit 1
else
  echo "  [ok] Second acquire was rejected (lock held by us)"
fi

# Release and verify the lock file is gone.
release_lock
if [ ! -f "$TEST_LOCK" ]; then
  echo "  [ok] release_lock removed the lock file"
else
  echo "  [fail] release_lock did not remove the lock file" >&2
  exit 1
fi

echo ""
echo "TEST 2: stale lock is auto-removed on next acquire"
# Write a fake PID that is NOT running, then acquire.
echo "999999" > "$TEST_LOCK"
# Make sure 999999 is not a running process (sanity).
if kill -0 999999 2>/dev/null; then
  echo "  [skip] pid 999999 is somehow running; skipping stale-lock test"
else
  ACQUIRED_LOCK=0
  acquire_lock 2>&1 | head -3
  if [ "$(cat "$TEST_LOCK")" = "$$" ]; then
    echo "  [ok] Stale lock from pid 999999 was replaced with $$"
  else
    echo "  [fail] Stale lock was not replaced" >&2
    exit 1
  fi
  release_lock
fi

rm -f "$TEST_LOCK" 2>/dev/null || true

echo ""
echo "TEST PASSED"
