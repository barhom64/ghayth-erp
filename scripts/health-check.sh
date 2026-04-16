#!/bin/bash
# ─────────────────────────────────────────────────────────────
# غيث ERP — فحص صحة النظام الشامل
# يكشف: مسارات ناقصة، استيرادات مكسورة، أعمدة غير متوافقة
# الاستخدام: bash scripts/health-check.sh
# ─────────────────────────────────────────────────────────────

set -uo pipefail
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

header() { echo -e "\n${YELLOW}═══ $1 ═══${NC}"; }
pass()   { echo -e "  ${GREEN}✅ $1${NC}"; }
fail()   { echo -e "  ${RED}❌ $1${NC}"; ERRORS=$((ERRORS+1)); }
warn()   { echo -e "  ${YELLOW}⚠️  $1${NC}"; WARNINGS=$((WARNINGS+1)); }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERP_SRC="$ROOT/artifacts/ghayth-erp/src"
API_SRC="$ROOT/artifacts/api-server/src"

# ─────────────────────────────────────
header "1. فحص الاستيرادات من api.ts"
# ─────────────────────────────────────

BROKEN=0
EXPORTS=$(grep -oP 'export\s+(function|class|const|type|interface|async function)\s+\K\w+' "$ERP_SRC/lib/api.ts" 2>/dev/null | sort -u)

while IFS= read -r line; do
  file=$(echo "$line" | cut -d: -f1)
  imports=$(echo "$line" | grep -oP '\{[^}]+\}' | head -1 | tr -d '{}' | tr ',' '\n' | sed 's/\s*as\s.*//;s/^ *//;s/ *$//' | grep -v '^$' | grep -v '^type$')
  for imp in $imports; do
    if ! echo "$EXPORTS" | grep -qw "$imp" 2>/dev/null; then
      fail "$(basename "$file") يستورد '$imp' من api.ts — غير موجود!"
      BROKEN=$((BROKEN+1))
    fi
  done
done < <(grep -r 'from "@/lib/api"' "$ERP_SRC" --include='*.tsx' --include='*.ts' 2>/dev/null)

[ $BROKEN -eq 0 ] && pass "جميع الاستيرادات من api.ts صحيحة ($( echo "$EXPORTS" | wc -l) دالة مُصدّرة)"

# ─────────────────────────────────────
header "2. فحص المسارات — ملفات بدون routes"
# ─────────────────────────────────────

MISSING=0
for dir in hr finance fleet legal warehouse; do
  route_file="$ERP_SRC/routes/${dir}Routes.tsx"
  [ ! -f "$route_file" ] && continue
  
  page_dir="$ERP_SRC/pages/$dir"
  [ ! -d "$page_dir" ] && continue
  
  for page_file in "$page_dir"/*.tsx; do
    [ ! -f "$page_file" ] && continue
    page_name=$(basename "$page_file" .tsx)
    if ! grep -q "\"$page_name\"" "$route_file" 2>/dev/null && \
       ! grep -q "'$page_name'" "$route_file" 2>/dev/null && \
       ! grep -q "/$page_name" "$route_file" 2>/dev/null; then
      fail "صفحة '$dir/$page_name' غير مسجلة في ${dir}Routes.tsx"
      MISSING=$((MISSING+1))
    fi
  done
done

[ $MISSING -eq 0 ] && pass "جميع الصفحات مسجّلة في ملفات المسارات"

# ─────────────────────────────────────
header "3. فحص Routes — إشارات لملفات غير موجودة"
# ─────────────────────────────────────

DANGLING=0
for routes_file in "$ERP_SRC"/routes/*Routes.tsx; do
  [ ! -f "$routes_file" ] && continue
  while IFS= read -r import_path; do
    full_path="$ERP_SRC/pages/${import_path}.tsx"
    if [ ! -f "$full_path" ]; then
      fail "$(basename "$routes_file") → pages/$import_path.tsx غير موجود"
      DANGLING=$((DANGLING+1))
    fi
  done < <(grep -oP 'import\("@/pages/\K[^"]+' "$routes_file" 2>/dev/null | sed 's/")//')
done

[ $DANGLING -eq 0 ] && pass "جميع مسارات الـ routes تشير لملفات موجودة"

# ─────────────────────────────────────
header "4. فحص قاعدة البيانات"
# ─────────────────────────────────────

if [ -n "${DATABASE_URL:-}" ]; then
  DB_ERR=0
  
  check_column() {
    local table=$1 column=$2 context=$3
    result=$(psql "$DATABASE_URL" -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='$table' AND column_name='$column'" 2>/dev/null | tr -d ' \n')
    [ -z "$result" ] && { fail "$context: عمود '$column' غير موجود في '$table'"; DB_ERR=$((DB_ERR+1)); }
  }
  
  check_table() {
    local table=$1 context=$2
    result=$(psql "$DATABASE_URL" -t -c "SELECT table_name FROM information_schema.tables WHERE table_name='$table'" 2>/dev/null | tr -d ' \n')
    [ -z "$result" ] && warn "$context: جدول '$table' غير موجود"
  }

  check_table "obligations" "obligationsEngine"
  check_table "official_letters" "cronScheduler"
  check_table "employees" "employees routes"
  check_table "employee_assignments" "employees routes"
  check_column "official_letters" "companyId" "cronScheduler"
  check_column "official_letters" "status" "cronScheduler"
  check_column "official_letters" "sentAt" "cronScheduler"
  check_column "official_letters" "approvedAt" "cronScheduler"
  check_column "employees" "name" "employees"

  [ $DB_ERR -eq 0 ] && pass "أعمدة قاعدة البيانات المستخدمة متوافقة"
else
  warn "DATABASE_URL غير معرّف — تخطي فحص قاعدة البيانات"
fi

# ─────────────────────────────────────
header "5. فحص API Endpoints"
# ─────────────────────────────────────

API_ERR=0
check_api() {
  local path=$1 name=$2
  local status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:8080$path" 2>/dev/null)
  case "$status" in
    401|200|304) pass "$name → $status" ;;
    000) fail "$name — غير متصل"; API_ERR=$((API_ERR+1)) ;;
    *) warn "$name → $status" ;;
  esac
}

check_api "/api/employees" "الموظفين"
check_api "/api/hr/leave-requests" "الإجازات"
check_api "/api/hr/shifts" "الورديات"
check_api "/api/hr/transfers" "التنقلات"
check_api "/api/hr/official-letters" "الخطابات"
check_api "/api/hr/discipline/memos" "الانضباط"
check_api "/api/finance/purchase-orders" "المشتريات"
check_api "/api/crm/opportunities" "CRM"
check_api "/api/properties/units" "العقارات"
check_api "/api/support/tickets" "الدعم"
check_api "/api/projects" "المشاريع"
check_api "/api/documents" "المستندات"

# ─────────────────────────────────────
header "6. فحص الخدمات"
# ─────────────────────────────────────

for pn in "8080:API" "18822:ERP" "25516:Portal" "23179:Careers"; do
  port=${pn%%:*}; name=${pn#*:}
  if curl -s --max-time 2 -o /dev/null "http://localhost:$port" 2>/dev/null; then
    pass "$name (port $port)"
  else
    fail "$name (port $port) — متوقف!"
  fi
done

# ─────────────────────────────────────
header "النتيجة"
# ─────────────────────────────────────

echo ""
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}✅ النظام سليم — $ERRORS أخطاء، $WARNINGS تحذيرات${NC}"
elif [ $ERRORS -eq 0 ]; then
  echo -e "${YELLOW}⚠️  $WARNINGS تحذير — النظام يعمل${NC}"
else
  echo -e "${RED}❌ $ERRORS خطأ + $WARNINGS تحذير${NC}"
fi

exit $ERRORS
