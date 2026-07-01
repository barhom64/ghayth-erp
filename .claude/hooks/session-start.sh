#!/bin/bash
# SessionStart hook for Claude Code on the web — installs dependencies so tests,
# linters, and guard scripts work. This repo is a pnpm monorepo and REJECTS npm
# (root package.json `preinstall`). The hook runs from the repo root and uses
# pnpm, avoiding the "[ERR_PNPM_NO_PKG_MANIFEST] No package.json in /home/user"
# failure that happens when install runs in the home dir with the wrong manager.
set -euo pipefail

# Web (remote) sessions only — local sessions already have their toolchain.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Always operate from the repo root, never the home dir.
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# Ensure pnpm is on PATH even if the base image only ships npm. corepack is
# bundled with Node. (No `packageManager` pin in package.json — it conflicts
# with the CI pnpm/action-setup version; corepack's default pnpm is fine here.)
corepack enable pnpm 2>/dev/null || true

# Idempotent: safe to re-run; reuses the cached store on warm containers.
pnpm install --frozen-lockfile
