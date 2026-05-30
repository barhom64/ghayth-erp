#!/usr/bin/env bash
# ===========================================================================
# auto-deploy.sh — النشر التلقائي عند تغيّر main (يُشغَّل عبر systemd timer)
# ---------------------------------------------------------------------------
# Polls the public GitHub repo for new commits on `main` and runs deploy.sh
# only when the remote has actually moved. Installed and enabled by
# bootstrap-vps.sh as a systemd timer (every 2 min). Self-contained: needs no
# secrets and no inbound connection — the server pulls, nobody pushes to it.
#
# Manual run / debug:
#   sudo -u ghayth bash /home/ghayth/ghayth-erp/deploy/auto-deploy.sh
#   tail -f /home/ghayth/ghayth-erp/auto-deploy.log
# ===========================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="${APP_DIR}/auto-deploy.log"
LOCK="/tmp/ghayth-auto-deploy.lock"

# Prevent overlapping runs: a build can take longer than the 2-min timer tick.
exec 9>"${LOCK}"
if ! flock -n 9; then
  echo "$(date -Is) another deploy already running — skip" >>"${LOG}"
  exit 0
fi

cd "${APP_DIR}"
git fetch --quiet origin main || { echo "$(date -Is) git fetch failed — skip" >>"${LOG}"; exit 0; }

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"

if [[ "${LOCAL}" == "${REMOTE}" ]]; then
  exit 0  # already up to date — stay quiet
fi

echo "$(date -Is) main moved ${LOCAL:0:8} -> ${REMOTE:0:8}; deploying…" >>"${LOG}"
if bash "${APP_DIR}/deploy/deploy.sh" >>"${LOG}" 2>&1; then
  echo "$(date -Is) ✓ deploy finished (${REMOTE:0:8})" >>"${LOG}"
else
  echo "$(date -Is) ✗ deploy FAILED (see log above)" >>"${LOG}"
  exit 1
fi
