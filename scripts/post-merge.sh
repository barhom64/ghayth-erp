#!/bin/bash
set -e
pnpm install --frozen-lockfile

echo "[post-merge] GitHub sync queued in background..."
nohup node scripts/github-sync.mjs >> /tmp/github-sync.log 2>&1 &
