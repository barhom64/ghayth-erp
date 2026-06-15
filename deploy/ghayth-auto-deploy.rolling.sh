#!/usr/bin/env bash
# ghayth-auto-deploy (rolling / zero-downtime)
# Installed on the VPS at /usr/local/bin/ghayth-auto-deploy (run minutely by systemd).
#
# Zero-downtime model:
#   - api runs at API_REPLICAS (2) replicas. EVERY scale-up adds replicas ONE AT A
#     TIME and waits each healthy before adding the next. This serialises startup DB
#     migrations: runMigrations() has NO advisory lock, so two fresh replicas
#     migrating at once would crash one in prod. One-at-a-time => only one migrator
#     runs at any moment (old replicas already migrated and don't re-run).
#   - On a new main commit we add fresh replicas alongside the old set (one at a
#     time), wait each healthy, then drop the old set. >=1 healthy replica serves the
#     whole time.
#   - FAILURE SAFETY: if build OR the rolling swap fails, we restore the previous
#     commit (git reset back to OLD_SHA), DO NOT recreate web, and exit non-zero so
#     the next minutely run retries — production keeps the last fully-working version
#     (api + web stay in sync, never half-deployed).
#   - The web container's nginx (deploy/nginx.conf.template) resolves the `api`
#     service via Docker DNS at request time and retries the healthy replica while
#     one is mid-restart, so the swap is invisible to clients.
#   - Cron is replica-safe: cronScheduler.ts holds a DB distributed lock
#     (cron_locks), so 2 replicas never double-fire jobs.
#   - web is a single host-port container; recreated only when its image changed
#     (frontend/lib) — a brief (~1-2s) blip is possible then.
set -uo pipefail

APP_DIR="/opt/ghayth-erp"
BRANCH="main"
COMPOSE_FILE="docker-compose.prod.yml"
LOCK_FILE="/tmp/ghayth-auto-deploy.lock"
LOG_FILE="/var/log/ghayth-auto-deploy.log"
API_REPLICAS=2
HEALTH_TIMEOUT=150

log(){ echo "$(date -Is) $*" >> "$LOG_FILE"; }
dc(){ docker compose -f "$COMPOSE_FILE" "$@"; }

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "deploy already running, skip"
  exit 0
fi

cd "$APP_DIR" || { log "FATAL cannot cd $APP_DIR"; exit 1; }

get_count(){ dc ps -q api 2>/dev/null | grep -c . || true; }

# Echo the one api container id present now but not in the space-padded $1 list.
new_container_after(){
  local known="$1" cur id
  cur=$(dc ps -q api 2>/dev/null)
  for id in $cur; do
    case " $known " in *" $id "*) ;; *) echo "$id"; return;; esac
  done
}

wait_healthy(){
  local ids="$1" deadline id st all_ok
  deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
  while :; do
    all_ok=1
    for id in $ids; do
      st=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || echo gone)
      [ "$st" = "healthy" ] || all_ok=0
    done
    [ "$all_ok" = "1" ] && return 0
    [ "$(date +%s)" -ge "$deadline" ] && return 1
    sleep 3
  done
}

# Bring api up to $1 replicas, ONE AT A TIME, waiting each healthy. Used for cold
# start and drift reconcile. Rolls back the just-added replica on health timeout.
ensure_replicas(){
  local target="$1" cur known new
  cur=$(get_count)
  while [ "${cur:-0}" -lt "$target" ]; do
    known=$(dc ps -q api 2>/dev/null | tr '\n' ' ')
    dc up -d --no-deps --no-recreate --scale api="$((cur+1))" api >> "$LOG_FILE" 2>&1
    new=$(new_container_after "$known")
    if [ -z "$new" ]; then
      log "ensure_replicas ERROR: new replica did not appear (target $((cur+1)))"
      return 1
    fi
    if wait_healthy "$new"; then
      cur=$((cur+1))
      log "ensure_replicas: replica healthy ${new:0:12} (now $cur/$target)"
    else
      log "ensure_replicas ERROR: replica ${new:0:12} unhealthy in ${HEALTH_TIMEOUT}s; removing"
      docker stop "$new" >>"$LOG_FILE" 2>&1; docker rm "$new" >>"$LOG_FILE" 2>&1
      return 1
    fi
  done
  return 0
}

# Rolling swap on a code change: add API_REPLICAS fresh replicas one at a time
# alongside the old set, then drop the old set. On failure tear down the new ones
# and keep the old set running (caller then restores the previous commit).
rolling_api(){
  local old_ids oldn new_ids="" added=0 known new
  old_ids=$(dc ps -q api 2>/dev/null | tr '\n' ' ')
  oldn=$(echo $old_ids | wc -w)
  if [ "$oldn" -eq 0 ]; then
    log "rolling_api: no running api, cold start"
    ensure_replicas "$API_REPLICAS"; return $?
  fi
  while [ "$added" -lt "$API_REPLICAS" ]; do
    known="$old_ids $new_ids"
    dc up -d --no-deps --no-recreate --scale api="$((oldn+added+1))" api >> "$LOG_FILE" 2>&1
    new=$(new_container_after "$known")
    if [ -z "$new" ]; then
      log "rolling_api ERROR: new replica did not appear"
      [ -n "$new_ids" ] && { docker stop $new_ids >>"$LOG_FILE" 2>&1; docker rm $new_ids >>"$LOG_FILE" 2>&1; }
      dc up -d --no-deps --no-recreate --scale api="$oldn" api >> "$LOG_FILE" 2>&1
      return 1
    fi
    if wait_healthy "$new"; then
      new_ids="$new_ids $new"; added=$((added+1))
      log "rolling_api: new replica healthy ($added/$API_REPLICAS) ${new:0:12}"
    else
      log "rolling_api ERROR: new replica ${new:0:12} unhealthy in ${HEALTH_TIMEOUT}s; rolling back"
      docker stop $new_ids $new >>"$LOG_FILE" 2>&1; docker rm $new_ids $new >>"$LOG_FILE" 2>&1
      dc up -d --no-deps --no-recreate --scale api="$oldn" api >> "$LOG_FILE" 2>&1
      return 1
    fi
  done
  log "rolling_api: new set healthy; removing old:$old_ids"
  docker stop $old_ids >>"$LOG_FILE" 2>&1; docker rm $old_ids >>"$LOG_FILE" 2>&1
  dc up -d --no-deps --no-recreate --scale api="$API_REPLICAS" api >> "$LOG_FILE" 2>&1
  log "rolling_api: complete (replicas=$API_REPLICAS)"
  return 0
}

git fetch origin "$BRANCH" >> "$LOG_FILE" 2>&1
OLD_SHA="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/$BRANCH)"

if [ "$OLD_SHA" = "$REMOTE" ]; then
  # No code change. Reconcile replica count if it drifted below target (one at a time).
  rc=$(get_count)
  if [ "${rc:-0}" -lt "$API_REPLICAS" ]; then
    log "no code change; api replicas=$rc < $API_REPLICAS, reconciling one at a time"
    ensure_replicas "$API_REPLICAS" || log "reconcile failed (kept running replicas)"
  else
    log "no changes: ${OLD_SHA:0:8} (api replicas=$rc)"
  fi
  exit 0
fi

log "new commit: ${OLD_SHA:0:8} -> ${REMOTE:0:8}"
git reset --hard "origin/$BRANCH" >> "$LOG_FILE" 2>&1

if ! dc build api web >> "$LOG_FILE" 2>&1; then
  log "ERROR build failed; restoring ${OLD_SHA:0:8} (containers untouched), will retry next run"
  git reset --hard "$OLD_SHA" >> "$LOG_FILE" 2>&1
  exit 1
fi

if ! rolling_api; then
  log "ERROR rolling_api failed; restoring ${OLD_SHA:0:8}, keeping old api + NOT recreating web, will retry next run"
  git reset --hard "$OLD_SHA" >> "$LOG_FILE" 2>&1
  exit 1
fi

# Only recreate web after the api swap succeeded, so api+web never go out of sync.
dc up -d --no-deps web >> "$LOG_FILE" 2>&1

# Mobile web export — ISOLATED + non-fatal. Built/brought up separately AFTER
# api+web are healthy so a mobile build failure can never roll back or block the
# core stack; the web nginx resolves the `mobile` host at request time, so a
# missing/stale mobile container only 502s /mobile/ (the main UI stays up). We
# only log a warning on failure and let the next run retry.
if dc build mobile >> "$LOG_FILE" 2>&1; then
  if dc up -d --no-deps mobile >> "$LOG_FILE" 2>&1; then
    log "mobile deployed"
  else
    log "WARN mobile up failed; api+web stay deployed, will retry next run"
  fi
else
  log "WARN mobile build failed; api+web stay deployed, will retry next run"
fi

sleep 5
if curl -fsS http://127.0.0.1:8088/api/healthz >/dev/null 2>&1; then log "post-deploy api healthz OK"; else log "WARN post-deploy api healthz FAILED"; fi
if curl -fsS http://127.0.0.1:8088/healthz   >/dev/null 2>&1; then log "post-deploy web healthz OK"; else log "WARN post-deploy web healthz FAILED"; fi
log "deploy complete: ${REMOTE:0:8}"
