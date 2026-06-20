#!/usr/bin/env bash
# Ghayth ERP — Docker auto-deploy from GitHub.
# Pulls the tracked branch, and if the remote moved, rebuilds + restarts the
# docker compose production stack. Safe to run from a systemd timer.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ghayth-erp}"
BRANCH="${BRANCH:-main}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
LOCK_FILE="${LOCK_FILE:-/tmp/ghayth-auto-deploy.lock}"
LOG_FILE="${LOG_FILE:-/var/log/ghayth-auto-deploy.log}"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$(date -Is) deploy already running, skip" >> "$LOG_FILE"
  exit 0
fi

cd "$APP_DIR"

git fetch origin "$BRANCH" >> "$LOG_FILE" 2>&1

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "$(date -Is) no changes: ${LOCAL:0:8}" >> "$LOG_FILE"
  exit 0
fi

echo "$(date -Is) new commit detected: ${LOCAL:0:8} -> ${REMOTE:0:8}" >> "$LOG_FILE"

git reset --hard "origin/$BRANCH" >> "$LOG_FILE" 2>&1

# Bake the deployed revision into the api image (GET /api/version reports it).
export APP_COMMIT="$REMOTE"
docker compose -f "$COMPOSE_FILE" up -d --build >> "$LOG_FILE" 2>&1

sleep 20

curl -fsS http://127.0.0.1:8088/api/healthz >> "$LOG_FILE" 2>&1 || true
curl -fsS http://127.0.0.1:8088/healthz >> "$LOG_FILE" 2>&1 || true

echo "$(date -Is) deploy complete: ${REMOTE:0:8}" >> "$LOG_FILE"
