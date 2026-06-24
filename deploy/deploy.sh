#!/usr/bin/env bash
# ===========================================================================
# deploy.sh — تحديث ونشر الإنتاج (يُشغَّل كمستخدم ghayth)
# ---------------------------------------------------------------------------
# Pull the latest code, install deps, build API + frontend, publish the SPA
# to the nginx web root, and reload the API under PM2. Idempotent — run it on
# every release after merging to main:
#
#   sudo -u ghayth bash /home/ghayth/ghayth-erp/deploy/deploy.sh
#
# DB migrations run automatically when the api-server boots, so no manual
# migration step is needed here.
# ===========================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/ghayth}"
PM2_APP="ghayth-api"
FIRST_RUN="${1:-}"

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

cd "${APP_DIR}"

# --- 1. Latest code (skip on the very first bootstrap run) ------------------
if [[ "${FIRST_RUN}" != "--first-run" ]]; then
  log "Pulling latest from main…"
  git pull --ff-only
fi

# --- 2. Install + build ----------------------------------------------------
log "Installing dependencies…"
pnpm install --frozen-lockfile

# Bake the checked-out revision into the bundle (GET /api/version reports it).
export APP_COMMIT="${APP_COMMIT:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
log "Building libs + API (commit ${APP_COMMIT:0:8})…"
pnpm run build

log "Building frontend (BASE_PATH=/)…"
BASE_PATH=/ pnpm --filter @workspace/ghayth-erp run build

# --- 3. Publish SPA to nginx root -----------------------------------------
log "Publishing frontend to ${WEB_ROOT}…"
mkdir -p "${WEB_ROOT}"
rsync -a --delete "${APP_DIR}/artifacts/ghayth-erp/dist/public/" "${WEB_ROOT}/"

# --- 4. (Re)start the API under PM2 ---------------------------------------
log "Reloading API under PM2…"
if pm2 describe "${PM2_APP}" >/dev/null 2>&1; then
  pm2 reload "${PM2_APP}" --update-env
else
  pm2 start "${APP_DIR}/ecosystem.config.cjs" --env production
fi

log "Done. Tail logs with:  pm2 logs ${PM2_APP}"
