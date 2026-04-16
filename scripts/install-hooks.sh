#!/usr/bin/env bash
#
# scripts/install-hooks.sh — idempotent git hooks setup.
#
# Points git at .githooks/ so the pre-commit guard runs on every
# local commit. Safe to re-run; no external dependencies.
#
# Called automatically from the root package.json `postinstall`
# script. Run manually the first time you clone:
#
#   bash scripts/install-hooks.sh
#

set -e

# Skip entirely when not inside a git working tree (e.g. CI tarball).
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

CURRENT=$(git config --get core.hooksPath || echo "")

if [ "$CURRENT" != ".githooks" ]; then
  git config core.hooksPath .githooks
  echo "[install-hooks] git core.hooksPath → .githooks"
else
  echo "[install-hooks] core.hooksPath already set to .githooks — skipping"
fi
