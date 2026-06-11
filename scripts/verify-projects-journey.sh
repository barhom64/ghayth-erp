#!/bin/bash
# verify-projects-journey.sh — E2E proof of the Projects package (#1594).
#
# Exercises the WHOLE projects operational chain through the EXISTING projects
# routes + finance engine (no new engine, no direct invoice/journal writes from
# the project routes — finance is a server via project.invoice.requested +
# projectsEngine GL):
#
#   project (client + budget)
#     → auto cost-centre carries the budget as allocation (variance-ready)
#     → project cost  → WIP journal (DR project_wip / CR cash)  [balanced]
#     → budget edit   → cost-centre allocation re-syncs
#     → BOQ items     → bill → ONE client invoice, a line per item, items billed
#     → dev unit      → sell → WIP→COGS journal [balanced] + sale invoice, profit
#     → phase         → in_progress → complete → milestone invoice
#
# Every accounting effect is asserted BALANCED. Re-runnable (unique per run).
#
# RUNS AS A NON-ADMIN projects_manager BY DEFAULT — the #1959 criterion: prove the
# whole chain (UI → effect, INCLUDING the server-side GL postings) works for a
# non-admin role, not just owner. The account is self-provisioned idempotently
# (reuses the owner's bcrypt hash so PASSWORD still authenticates). Set NONADMIN=0
# to run as owner instead, or override EMAIL/PASSWORD.
#
# Prereqs: a HEAD-OF-MAIN DB + built server (الضياء tenant: postable 1111/1270/
# 5130). For a head-of-main agent DB use `pnpm db:provision-agent`.
set -euo pipefail
BASE="${BASE:-http://localhost:5000/api}"
DSN="${DATABASE_URL:-postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp}"
NONADMIN="${NONADMIN:-1}"
PM_EMAIL="${PM_EMAIL:-pm-projects@door.sa}"
PASSWORD="${PASSWORD:-Door@2026Diaa}"
J="$(mktemp)"; PASS=0; FAIL=0
RUN="$(date +%H%M%S)$RANDOM"
py(){ python3 -c "$1" 2>/dev/null; }
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
export PGPASSWORD="$(echo "$DSN" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"
q(){ psql "$DSN" -tA -c "$1" 2>/dev/null; }
balanced(){ [ "$(q "SELECT (SUM(debit)=SUM(credit) AND SUM(debit)>0) FROM journal_lines WHERE \"journalId\"=$1;")" = "t" ]; }
echo "▶ Projects journey — #1594 (مشروع→تكلفة WIP→BOQ→بيع وحدة→مستخلص، قيود متوازنة)"

# Choose login: self-provisioned NON-ADMIN projects_manager (default) or owner.
EMAIL="${EMAIL:-door@door.sa}"
if [ "$NONADMIN" = "1" ]; then
  RID="$(q "SELECT id FROM rbac_roles WHERE role_key='projects_manager' AND \"companyId\"=2 LIMIT 1;")"
  BR="$(q "SELECT \"branchId\" FROM employee_assignments WHERE \"companyId\"=2 AND status='active' AND \"branchId\" IS NOT NULL ORDER BY id LIMIT 1;")"
  if [ -n "$RID" ] && [ -n "$BR" ]; then
    q "DO \$\$ DECLARE h text; e int; u int; BEGIN
        SELECT \"passwordHash\" INTO h FROM users WHERE email='door@door.sa';
        SELECT id INTO e FROM employees WHERE email='$PM_EMAIL' AND \"companyId\"=2;
        IF e IS NULL THEN INSERT INTO employees(name,\"companyId\",email,status) VALUES('مدير المشاريع (تحقق)',2,'$PM_EMAIL','active') RETURNING id INTO e;
          INSERT INTO employee_assignments(\"employeeId\",\"companyId\",\"branchId\",\"jobTitle\",role,status,\"hireDate\",\"isPrimary\") VALUES(e,2,$BR,'مدير مشاريع','projects_manager','active',CURRENT_DATE,true); END IF;
        SELECT id INTO u FROM users WHERE email='$PM_EMAIL';
        IF u IS NULL THEN INSERT INTO users(email,\"passwordHash\",role,\"employeeId\",\"isActive\") VALUES('$PM_EMAIL',h,'projects_manager',e,true) RETURNING id INTO u; END IF;
        INSERT INTO rbac_user_roles(\"userId\",\"companyId\",role_id,\"branchId\",is_primary) VALUES(u,2,$RID,$BR,true) ON CONFLICT(\"userId\",\"companyId\",role_id) DO NOTHING;
      END \$\$;" >/dev/null
    EMAIL="$PM_EMAIL"; ok "هُيّئ حساب non-admin (projects_manager)"
  else
    no "تعذّر تهيئة non-admin (role/branch مفقود) — تشغيل كـowner"; NONADMIN=0
  fi
fi

curl -fsS -c "$J" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -o /dev/null
CSRF="$(grep erp_csrf "$J" | awk '{print $7}')"; [ -n "$CSRF" ] && ok "login ($EMAIL)" || { no login; exit 1; }
pw(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X POST "$BASE$1" -d "$2"; }
ptch(){ curl -sS -b "$J" -H "x-csrf-token: $CSRF" -H "Content-Type: application/json" -X PATCH "$BASE$1" -d "$2"; }
gid(){ py "import sys,json;d=json.load(sys.stdin);print(d.get('$1') or '')"; }

# Assert the running role is NOT owner (the #1959 point) in non-admin mode.
if [ "$NONADMIN" = "1" ]; then
  ROLE="$(q "SELECT role FROM users WHERE email='$EMAIL';")"
  [ "$ROLE" = "projects_manager" ] && ok "الدور الجاري non-admin (projects_manager، ليس owner) — معيار #1959" || no "role check ($ROLE)"
fi

CLIENT="$(q "SELECT id FROM clients WHERE \"companyId\"=2 AND \"deletedAt\" IS NULL LIMIT 1;")"
[ -n "$CLIENT" ] && ok "عميل موجود (#$CLIENT)" || { no "no client"; exit 1; }

# 1) Project + auto cost-centre + budget allocation
PRJ="$(pw /projects "{\"name\":\"رحلة تحقق المشاريع $RUN\",\"clientId\":$CLIENT,\"startDate\":\"2026-06-10\",\"endDate\":\"2026-12-31\",\"budget\":600000}")"
PID="$(echo "$PRJ" | gid id)"
[ -n "$PID" ] && ok "مشروع أُنشئ (#$PID)" || { no "project create: $PRJ"; exit 1; }
sleep 1
ALLOC="$(q "SELECT \"allocatedAmount\" FROM cost_centers WHERE \"companyId\"=2 AND \"linkedEntityType\"='project' AND \"linkedEntityId\"=$PID;")"
[ "$ALLOC" = "600000.00" ] && ok "مركز تكلفة تلقائي + تخصيص الميزانية ($ALLOC)" || no "cost-centre allocation ($ALLOC)"

# 2) Budget edit re-syncs allocation
ptch /projects/$PID "{\"budget\":800000}" >/dev/null; sleep 1
ALLOC2="$(q "SELECT \"allocatedAmount\" FROM cost_centers WHERE \"linkedEntityType\"='project' AND \"linkedEntityId\"=$PID;")"
[ "$ALLOC2" = "800000.00" ] && ok "إعادة مزامنة التخصيص عند تعديل الميزانية ($ALLOC2)" || no "alloc re-sync ($ALLOC2)"

# 3) Project cost → WIP journal (balanced)
COST="$(pw /projects/$PID/costs "{\"description\":\"تكلفة إنشاء\",\"amount\":250000,\"category\":\"construction\"}")"
JE="$(echo "$COST" | gid journalEntryId)"
{ [ -n "$JE" ] && balanced "$JE"; } && ok "تكلفة→WIP قيد متوازن (#$JE)" || no "cost WIP GL ($JE)"

# 3b) PRJ-P2 — project status transitions validated through lifecycleEngine.
#     The project is still 'planning' here. planning→blocked is NOT an edge in
#     the "projects" state machine → must be rejected (409); planning→active IS
#     → must succeed and persist. Proves the engine-backed guard live on a real DB.
ILLEGAL="$(ptch /projects/$PID '{"status":"blocked"}' | gid error)"
[ -n "$ILLEGAL" ] && ok "منع انتقال غير مشروع planning→blocked (lifecycleEngine)" || no "illegal transition not blocked"
LEGAL="$(ptch /projects/$PID '{"status":"active"}' | gid status)"
[ "$LEGAL" = "active" ] && ok "انتقال مشروع planning→active عبر المحرّك" || no "legal transition ($LEGAL)"
PST="$(q "SELECT status FROM projects WHERE id=$PID;")"
[ "$PST" = "active" ] && ok "حالة المشروع مُحدّثة فعليًا في DB (active)" || no "project status not persisted ($PST)"

# 4) BOQ items → bill → invoice with a line per item
B1="$(pw /projects/$PID/boq '{"itemType":"aggregate","description":"لياسة","unit":"m2","quantity":80,"unitPrice":50}' | gid id)"
B2="$(pw /projects/$PID/boq '{"description":"تغيير لمبة","unit":"piece","quantity":5,"unitPrice":30}' | gid id)"
{ [ -n "$B1" ] && [ -n "$B2" ]; } && ok "بنود BOQ مُنشأة (#$B1,#$B2 = 4000+150)" || no "boq create"
BILL="$(pw /projects/$PID/boq/bill '{}')"; BREF="$(echo "$BILL" | gid ref)"; BSUB="$(echo "$BILL" | gid subtotal)"
sleep 1
BINV="$(q "SELECT id FROM invoices WHERE ref='$BREF' AND \"companyId\"=2;")"
{ [ -n "$BINV" ] && [ "$BSUB" = "4150" ]; } && ok "فوترة BOQ → فاتورة #$BINV (مجموع $BSUB)" || no "boq bill ($BREF sub=$BSUB)"
NL="$(q "SELECT count(*) FROM invoice_lines WHERE \"invoiceId\"=$BINV;")"
[ "$NL" = "2" ] && ok "سطر فاتورة لكل بند ($NL)" || no "boq lines ($NL)"
STMP="$(q "SELECT status||':'||COALESCE(\"invoiceId\"::text,'X') FROM project_boq_items WHERE id=$B1;")"
[ "$STMP" = "billed:$BINV" ] && ok "البنود موسومة billed + invoiceId" || no "boq stamp ($STMP)"
REBILL="$(pw /projects/$PID/boq/bill '{}' | gid error)"
[ -n "$REBILL" ] && ok "منع الفوترة المزدوجة (لا بنود معلّقة)" || no "double-bill not blocked"

# 5) Development unit → sell → WIP→COGS journal (balanced) + sale invoice
U1="$(pw /projects/$PID/units '{"name":"وحدة A","code":"A1","area":100,"salePrice":350000}' | gid id)"
[ -n "$U1" ] && ok "وحدة تطوير (#$U1)" || no "unit create"
SELL="$(pw /projects/units/$U1/sell "{\"buyerClientId\":$CLIENT}")"
SOLD="$(echo "$SELL" | gid sold)"; CB="$(echo "$SELL" | gid costBasis)"; PROFIT="$(echo "$SELL" | gid profit)"; CJ="$(echo "$SELL" | gid cogsJournalId)"
[ "$SOLD" = "True" ] && ok "بيع الوحدة (أساس تكلفة=$CB، ربح=$PROFIT)" || no "sell ($SELL)"
{ [ -n "$CJ" ] && balanced "$CJ"; } && ok "قيد COGS متوازن (WIP→تكلفة مبيعات، #$CJ)" || no "cogs GL ($CJ)"
sleep 1
USTMP="$(q "SELECT status||':'||COALESCE(\"invoiceId\"::text,'X') FROM development_units WHERE id=$U1;")"
echo "$USTMP" | grep -q "sold:" && [ "$(echo "$USTMP" | cut -d: -f2)" != "X" ] && ok "الوحدة sold + فاتورة بيع موسومة ($USTMP)" || no "unit stamp ($USTMP)"
RESELL="$(pw /projects/units/$U1/sell "{\"buyerClientId\":$CLIENT}" | gid error)"
[ -n "$RESELL" ] && ok "منع البيع المزدوج" || no "double-sell not blocked"

# 6) Phase → in_progress → complete → milestone invoice
PH="$(pw /projects/$PID/phases '{"name":"مرحلة 1"}' | gid id)"
q "UPDATE project_phases SET status='in_progress' WHERE id=$PH;" >/dev/null
MIC="$(ptch /projects/$PID/phases/$PH/complete '{}' | gid milestoneInvoiceCreated)"
[ "$MIC" = "True" ] && ok "فوترة المستخلص (مرحلة→فاتورة)" || no "milestone billing ($MIC)"
sleep 1
MINV="$(q "SELECT (\"projectId\"=$PID) FROM invoices WHERE ref='INV-MS-2606-$PH' AND \"companyId\"=2;")"
[ "$MINV" = "t" ] && ok "فاتورة المستخلص مربوطة بالمشروع" || no "milestone invoice link ($MINV)"

# 7) PRJ-P3 — project statement print preset renders end-to-end on a real DB.
#     The `project_statement` bespoke preset + its read-only data loader resolve
#     the project's financial position (budget/cost/billed/remaining) + cost
#     breakdown. Printing needs print perms → log in as owner for this step.
PJ="$(mktemp)"
curl -fsS -c "$PJ" -H "X-E2E-Test: 1" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"door@door.sa\",\"password\":\"$PASSWORD\"}" -o /dev/null
PCSRF="$(grep erp_csrf "$PJ" | awk '{print $7}')"
PRES="$(curl -sS -b "$PJ" -H "x-csrf-token: $PCSRF" -H "Content-Type: application/json" -X POST "$BASE/print/render" -d "{\"entityType\":\"project_statement\",\"entityId\":\"$PID\"}")"
PJOB="$(echo "$PRES" | gid jobId)"
[ -n "$PJOB" ] && ok "طباعة مستخلص المشروع (preset حيّ + بيانات حقيقية، job #$PJOB)" || no "project statement print ($PRES)"

# teardown — keep the suite re-runnable
q "UPDATE projects SET \"deletedAt\"=NOW() WHERE id=$PID;" >/dev/null

echo ""
echo "النتيجة: ✅ $PASS  ❌ $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
