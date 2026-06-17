#!/usr/bin/env bash
# Verify install.sh parses cleanly. Optional: run shellcheck if available
# for deeper static analysis. Exit non-zero on any error.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SH="$SCRIPT_DIR/../install.sh"

if [ ! -f "$INSTALL_SH" ]; then
  echo "FAIL: $INSTALL_SH not found" >&2
  exit 1
fi

if ! bash -n "$INSTALL_SH"; then
  echo "FAIL: install.sh has a bash syntax error" >&2
  exit 1
fi
echo "install.sh: bash -n OK"

# shellcheck is the de-facto linter. We only fail the script if shellcheck
# IS installed AND reports errors — if it's not installed we just note it
# and continue, because installing shellcheck is out of scope for an
# installer-repo test harness.
if command -v shellcheck >/dev/null 2>&1; then
  echo "shellcheck: found, running..."
  # -x follows source, -e stops at first error, SC1091 is "Can't follow
  # non-constant source" which is irrelevant for our top-level test.
  if ! shellcheck -x -e SC1091 "$INSTALL_SH"; then
    echo "FAIL: shellcheck reported errors" >&2
    exit 1
  fi
  echo "install.sh: shellcheck OK"
else
  echo "shellcheck: not installed (skipping; install via 'apt install shellcheck' or 'brew install shellcheck')"
fi
