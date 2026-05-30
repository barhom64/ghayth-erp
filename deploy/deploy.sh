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

log "Building libs + API + frontend (BASE_PATH=/)…"
# The root build is recursive (`pnpm -r run build`) so it compiles the frontend
# too — and the frontend's vite.config HARD-requires PORT and BASE_PATH even at
# build time. Export both so the recursive frontend build succeeds and the SPA
# is emitted with a root base path (served from nginx root, API via /api).
export PORT="${PORT:-8080}"
export BASE_PATH="/"
pnpm run build

# --- 3. Publish SPA to nginx root -----------------------------------------
log "Publishing frontend to ${WEB_ROOT}…"
mkdir -p "${WEB_ROOT}"
rsync -a --delete "${APP_DIR}/artifacts/ghayth-erp/dist/public/" "${WEB_ROOT}/"

# --- 4. Load runtime secrets so PM2 passes them to the API -----------------
# The api-server reads its config straight from process.env (no dotenv loader),
# and PM2 snapshots the environment at start time. Source .env here so
# DATABASE_URL, JWT_SECRET, FIELD_ENCRYPTION_KEY, SECRETS_ENCRYPTION_KEY,
# CORS_ORIGINS, etc. actually reach the API process. `--update-env` re-reads it
# on reload, so editing .env + re-running this script picks up new secrets.
if [[ -f "${APP_DIR}/.env" ]]; then
  log "Loading environment from .env…"
  set -a
  # shellcheck disable=SC1090
  . "${APP_DIR}/.env"
  set +a
fi

# --- 5. (Re)start the API under PM2 ---------------------------------------
log "Reloading API under PM2…"
if pm2 describe "${PM2_APP}" >/dev/null 2>&1; then
  pm2 reload "${PM2_APP}" --update-env
else
  pm2 start "${APP_DIR}/ecosystem.config.cjs" --env production --update-env
fi

log "Done. Tail logs with:  pm2 logs ${PM2_APP}"
