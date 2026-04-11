#!/bin/bash
set -e
pnpm install --frozen-lockfile

echo "[post-merge] Syncing to GitHub..."
node scripts/github-sync.mjs &
SYNC_PID=$!
wait $SYNC_PID 2>/dev/null || echo "[post-merge] GitHub sync finished with warnings (non-blocking)"
