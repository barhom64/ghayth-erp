#!/usr/bin/env bash
#
# verify-aldiyaa.sh — confirms the Al-Diyaa wal-Bayan tenant is fully
# seeded on the database pointed to by $DATABASE_URL.
#
# Usage:
#   DATABASE_URL=postgres://... bash scripts/verify-aldiyaa.sh
#
# Exit code 0 means all expected rows are present at the expected counts.
# Any divergence prints the diff and exits 1.

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "✗ DATABASE_URL not set." >&2
  exit 2
fi

COMPANY_NAME='مؤسسة الضياء والبيان للمقاولات'

# Expected counts after running both seed files
declare -A EXPECTED=(
  [companies]=1
  [branches]=5
  [employees]=1
  [users]=1
  [employee_assignments]=1
  [chart_of_accounts]=144
  [role_permissions]=98
  [hr_leave_types]=10
  [shifts]=3
  [salary_components]=6
  [system_settings]=174
)

declare -A QUERIES=(
  [companies]="SELECT count(*) FROM companies WHERE name = '$COMPANY_NAME'"
  [branches]="SELECT count(*) FROM branches WHERE \"companyId\" = (SELECT id FROM companies WHERE name = '$COMPANY_NAME')"
  [employees]="SELECT count(*) FROM employees WHERE \"nationalId\" = '1056272873'"
  [users]="SELECT count(*) FROM users WHERE email = 'door@door.sa'"
  [employee_assignments]="SELECT count(*) FROM employee_assignments WHERE \"employeeId\" = (SELECT id FROM employees WHERE \"nationalId\" = '1056272873') AND status = 'active'"
  [chart_of_accounts]="SELECT count(*) FROM chart_of_accounts WHERE \"companyId\" = (SELECT id FROM companies WHERE name = '$COMPANY_NAME')"
  [role_permissions]="SELECT count(*) FROM role_permissions WHERE \"companyId\" = (SELECT id FROM companies WHERE name = '$COMPANY_NAME')"
  [hr_leave_types]="SELECT count(*) FROM hr_leave_types WHERE \"companyId\" = (SELECT id FROM companies WHERE name = '$COMPANY_NAME')"
  [shifts]="SELECT count(*) FROM shifts WHERE \"companyId\" = (SELECT id FROM companies WHERE name = '$COMPANY_NAME')"
  [salary_components]="SELECT count(*) FROM salary_components WHERE \"companyId\" = (SELECT id FROM companies WHERE name = '$COMPANY_NAME')"
  [system_settings]="SELECT count(*) FROM system_settings WHERE \"companyId\" = (SELECT id FROM companies WHERE name = '$COMPANY_NAME')"
)

fail=0
echo "▶ verifying Al-Diyaa wal-Bayan tenant on $(echo "$DATABASE_URL" | sed 's|//[^@]*@|//***:***@|')"
echo

printf "%-25s %10s %10s\n" "table" "expected" "actual"
printf "%-25s %10s %10s\n" "-------------------------" "----------" "----------"
for table in companies branches employees users employee_assignments chart_of_accounts role_permissions hr_leave_types shifts salary_components system_settings; do
  expected=${EXPECTED[$table]}
  actual=$(psql "$DATABASE_URL" -tAc "${QUERIES[$table]}" 2>/dev/null || echo "ERR")
  if [ "$actual" = "$expected" ]; then
    marker="✓"
  else
    marker="✗"
    fail=$((fail + 1))
  fi
  printf "%-25s %10s %10s  %s\n" "$table" "$expected" "$actual" "$marker"
done

echo
if [ "$fail" -eq 0 ]; then
  echo "✓ Al-Diyaa tenant is fully seeded ($((${#EXPECTED[@]})) checks passed)."
  exit 0
else
  echo "✗ $fail check(s) failed — re-run the seeds:" >&2
  echo "    psql \"\$DATABASE_URL\" -f db/seed-aldiyaa-albayan.sql" >&2
  echo "    psql \"\$DATABASE_URL\" -f db/seed-aldiyaa-company-defaults.sql" >&2
  exit 1
fi
