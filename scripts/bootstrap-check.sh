#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# Ghayth ERP — bootstrap-check.sh
#
# Pre-flight check before booting api-server / web on a fresh VPS.
# Fails fast on the most common silent-failure causes:
#   - wrong Node major version
#   - missing pnpm
#   - missing required env vars
#   - malformed DATABASE_URL
#
# DOES NOT print secret values. Only prints whether each one is set.
#
# Exit codes:
#   0   all checks passed
#   1   at least one required check failed
#   2   bash version too old for `[[` (extremely unlikely)
#
# Bilingual output (Arabic + English). Safe to run repeatedly.
# ----------------------------------------------------------------------------

set -u  # error on unset vars in our own script (not in checks)

REQUIRED_NODE_MAJOR=24
REQUIRED_PNPM_MAJOR=10

# Required env vars — missing any of these → fail
REQUIRED_VARS=(
  DATABASE_URL
  SESSION_SECRET
  FIELD_ENCRYPTION_KEY
  ADMIN_EMAIL
  ADMIN_PASSWORD
)

# Optional env vars — missing → warning only, not fatal
OPTIONAL_VARS=(
  SENTRY_DSN
  OBS_DSN
  OBS_ENVIRONMENT
  METRICS_USER
  METRICS_PASS
  OCR_PROVIDER
  PORT
  NODE_ENV
)

# ---- color (only if stdout is a TTY) ---------------------------------------
if [ -t 1 ]; then
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_CYAN=$'\033[36m'
  C_BOLD=$'\033[1m'
  C_RESET=$'\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_CYAN=''; C_BOLD=''; C_RESET=''
fi

FAIL_COUNT=0
WARN_COUNT=0

pass() { echo "  ${C_GREEN}✓${C_RESET} $1"; }
warn() { echo "  ${C_YELLOW}⚠${C_RESET} $1"; WARN_COUNT=$((WARN_COUNT+1)); }
fail() { echo "  ${C_RED}✗${C_RESET} $1"; FAIL_COUNT=$((FAIL_COUNT+1)); }
hdr()  { echo; echo "${C_BOLD}${C_CYAN}== $1 ==${C_RESET}"; }

# ---- bilingual helpers -----------------------------------------------------
say() {
  # $1 = English, $2 = Arabic
  echo "  $1"
  echo "  $2"
}

echo "${C_BOLD}Ghayth ERP — Bootstrap pre-flight check${C_RESET}"
echo "${C_BOLD}غيث ERP — فحص جاهزية الإقلاع${C_RESET}"

# ============================================================================
# 1. Node.js
# ============================================================================
hdr "Node.js"
if ! command -v node >/dev/null 2>&1; then
  fail "node not found in PATH"
  fail "لم يتم العثور على node في PATH"
else
  NODE_VERSION=$(node --version 2>/dev/null || echo "unknown")
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed -E 's/^v?([0-9]+)\..*/\1/')
  if [ "$NODE_MAJOR" = "$REQUIRED_NODE_MAJOR" ]; then
    pass "node $NODE_VERSION (major $NODE_MAJOR — OK)"
  else
    fail "node $NODE_VERSION — required major version is $REQUIRED_NODE_MAJOR"
    fail "إصدار node غير مطابق — المطلوب major $REQUIRED_NODE_MAJOR"
  fi
fi

# ============================================================================
# 2. pnpm
# ============================================================================
hdr "pnpm"
if ! command -v pnpm >/dev/null 2>&1; then
  fail "pnpm not found in PATH"
  fail "لم يتم العثور على pnpm — جرّب: corepack enable && corepack prepare pnpm@${REQUIRED_PNPM_MAJOR} --activate"
else
  PNPM_VERSION=$(pnpm --version 2>/dev/null || echo "unknown")
  PNPM_MAJOR=$(echo "$PNPM_VERSION" | sed -E 's/^([0-9]+)\..*/\1/')
  if [ "$PNPM_MAJOR" = "$REQUIRED_PNPM_MAJOR" ]; then
    pass "pnpm $PNPM_VERSION (major $PNPM_MAJOR — OK)"
  else
    warn "pnpm $PNPM_VERSION — recommended major is $REQUIRED_PNPM_MAJOR (you may see ERR_PNPM_LOCKFILE_CONFIG_MISMATCH)"
    warn "إصدار pnpm غير مطابق — يُنصح بـ major $REQUIRED_PNPM_MAJOR لتجنّب مشاكل القفل"
  fi
fi

# ============================================================================
# 3. Required env vars
# ============================================================================
hdr "Required environment variables / متغيرات البيئة الإجبارية"
for var in "${REQUIRED_VARS[@]}"; do
  value="${!var:-}"
  if [ -z "$value" ]; then
    fail "$var is NOT set / غير معرَّف"
  else
    # Print length only, never the value itself
    pass "$var is set (length=${#value})"
  fi
done

# ============================================================================
# 4. DATABASE_URL shape check
# ============================================================================
hdr "DATABASE_URL shape check"
DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
  fail "DATABASE_URL not set — cannot validate shape"
  fail "لا يمكن التحقق من صيغة DATABASE_URL لأنه غير معرَّف"
else
  # Accept postgres:// or postgresql:// scheme, with optional userinfo, host, port, path
  if echo "$DB_URL" | grep -Eq '^(postgres|postgresql)://[^/[:space:]]+/[^[:space:]]+'; then
    # Extract scheme + host (NOT credentials) for sanity print
    SCHEME=$(echo "$DB_URL" | sed -E 's,^(postgres(ql)?)://.*,\1,')
    # Strip credentials before extracting host
    HOST_PART=$(echo "$DB_URL" | sed -E 's,^[^@]*@,,' | sed -E 's,/.*,,')
    pass "DATABASE_URL scheme=$SCHEME host=$HOST_PART (credentials hidden)"
  else
    fail "DATABASE_URL does not match expected shape postgres://USER:PASS@HOST:PORT/DBNAME"
    fail "صيغة DATABASE_URL غير صحيحة — يجب أن تكون بالشكل postgres://USER:PASS@HOST:PORT/DBNAME"
  fi
fi

# ============================================================================
# 5. Secret-length sanity checks (no values printed)
# ============================================================================
hdr "Secret strength sanity / فحص قوة الأسرار"
SESSION_LEN=${#SESSION_SECRET}
if [ -n "${SESSION_SECRET:-}" ] && [ "$SESSION_LEN" -lt 32 ]; then
  warn "SESSION_SECRET length=$SESSION_LEN is short — recommended ≥ 64 chars"
  warn "طول SESSION_SECRET قصير — يُنصح بـ 64 حرف فأكثر"
fi

FEK_LEN=${#FIELD_ENCRYPTION_KEY}
if [ -n "${FIELD_ENCRYPTION_KEY:-}" ] && [ "$FEK_LEN" -lt 32 ]; then
  warn "FIELD_ENCRYPTION_KEY length=$FEK_LEN is short — should be a 32-byte base64 string (~44 chars)"
  warn "طول FIELD_ENCRYPTION_KEY قصير — يجب أن يكون base64 لـ 32 بايت (~44 حرف)"
fi

if [ -n "${ADMIN_PASSWORD:-}" ] && [ "${#ADMIN_PASSWORD}" -lt 12 ]; then
  warn "ADMIN_PASSWORD length=${#ADMIN_PASSWORD} is short — recommended ≥ 12 chars"
  warn "طول ADMIN_PASSWORD قصير — يُنصح بـ 12 حرف فأكثر"
fi

# ============================================================================
# 6. Optional env vars — informational
# ============================================================================
hdr "Optional environment variables / متغيرات اختيارية"
for var in "${OPTIONAL_VARS[@]}"; do
  value="${!var:-}"
  if [ -z "$value" ]; then
    echo "  ${C_YELLOW}·${C_RESET} $var is unset (using default behavior)"
  else
    pass "$var is set"
  fi
done

# ============================================================================
# 7. Common file-system expectations
# ============================================================================
hdr "Workspace sanity"
if [ ! -f "package.json" ]; then
  fail "package.json not found in current directory — run this script from the repo root"
  fail "الملف package.json غير موجود — شغّل السكربت من جذر المستودع"
fi
if [ ! -d "artifacts/api-server" ]; then
  fail "artifacts/api-server/ not found — wrong directory?"
  fail "مجلد artifacts/api-server/ غير موجود — هل أنت في المسار الصحيح؟"
fi
if [ ! -d "node_modules" ]; then
  warn "node_modules/ not found — did you run \`pnpm install\`?"
  warn "لم يتم العثور على node_modules — هل شغّلت pnpm install ؟"
fi

# ============================================================================
# Summary
# ============================================================================
echo
echo "${C_BOLD}== Summary / الملخّص ==${C_RESET}"
if [ "$FAIL_COUNT" -eq 0 ] && [ "$WARN_COUNT" -eq 0 ]; then
  echo "${C_GREEN}${C_BOLD}All checks passed. Safe to boot.${C_RESET}"
  echo "${C_GREEN}${C_BOLD}جميع الفحوصات نجحت. يمكن الإقلاع بأمان.${C_RESET}"
  exit 0
elif [ "$FAIL_COUNT" -eq 0 ]; then
  echo "${C_YELLOW}${C_BOLD}$WARN_COUNT warning(s) — boot will proceed but review the warnings above.${C_RESET}"
  echo "${C_YELLOW}${C_BOLD}يوجد $WARN_COUNT تحذير(ات) — يمكن الإقلاع لكن راجع التحذيرات أعلاه.${C_RESET}"
  exit 0
else
  echo "${C_RED}${C_BOLD}$FAIL_COUNT check(s) failed and $WARN_COUNT warning(s). DO NOT BOOT.${C_RESET}"
  echo "${C_RED}${C_BOLD}فشل $FAIL_COUNT فحص(ات) ووجود $WARN_COUNT تحذير(ات). لا تُقلِع النظام.${C_RESET}"
  exit 1
fi
