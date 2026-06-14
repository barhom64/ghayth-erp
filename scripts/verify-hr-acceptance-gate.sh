#!/usr/bin/env bash
# HR-REV-8 — بوابة قبول HR: هيكل التحقق من رحلات التشغيل الحية (#2227)
#
# هذا هيكل (scaffold). كل رحلة دالة تُرجع PASS/FAIL/PENDING.
# تُملأ الدوال بفحوص فعلية (API + DB + audit) بعد إكمال HR-REV-3/4.
# لا يُقبل HR حتى تعود كل الرحلات PASS مع أدلة (UI/API/DB/audit/event/report).
#
# الاستخدام:  bash scripts/verify-hr-acceptance-gate.sh
set -uo pipefail

PASS=0; FAIL=0; PENDING=0
check() { # check "<name>" "<status>" "<evidence>"
  case "$2" in
    PASS) PASS=$((PASS+1));    printf '  \033[32m✓ PASS\033[0m   %s — %s\n' "$1" "$3" ;;
    FAIL) FAIL=$((FAIL+1));    printf '  \033[31m✗ FAIL\033[0m   %s — %s\n' "$1" "$3" ;;
    *)    PENDING=$((PENDING+1)); printf '  \033[33m… PENDING\033[0m %s — %s\n' "$1" "$3" ;;
  esac
}

echo "HR Acceptance Gate (#2227) — 16 رحلة إلزامية"
echo "──────────────────────────────────────────────"

# 1–5: التفعيل السريع والاكتمال الموزّع (يعتمد HR-REV-3/4)
check "J01 إنشاء سريع موظف إداري"  PENDING "بانتظار POST /employees/quick-activate"
check "J02 إنشاء سريع سائق"        PENDING "بانتظار profile=driver (HR-REV-4)"
check "J03 إنشاء موظف مالي"        PENDING "بانتظار profile=accountant"
check "J04 الموظف يكمل بياناته"    PENDING "بانتظار PATCH /activation-plan/:taskId"
check "J05 مدير القسم يكمل العمل"  PENDING "بانتظار activation-plan"

# 6–7, 10, 15: قابلة للتنفيذ على الموجود
check "J06 الرواتب تكمل الراتب"    PENDING "PATCH /employees/:id (salary) — أضف فحص DB+audit"
check "J07 الوثائق تتحقق"          PENDING "/employees/documents verify"
check "J10 منح صلاحية حسب المسمى"  PENDING "POST /admin/onboard — افحص rbac_user_roles+audit(activeRole)"
check "J15 مسير راتب متأثر"        PENDING "POST /hr/payroll — افحص الخصومات+GL"

# 8–9: عقود الخدمة (مستودع/أسطول)
check "J08 عهدة: طلب→صرف→استلام"   PENDING "خدمة مستودع — وثيقة صرف/استلام"
check "J09 مركبة: طلب→تخصيص"       PENDING "خدمة أسطول — تخصيص لا إنشاء"

# 11–14: دورة حياة الوصول (فجوات حرجة)
check "J11 طلب صلاحية واعتمادها"   PENDING "rbac_user_grants temporary"
check "J12 نقل + تغيير النطاق"     PENDING "🚩 النقل لا يُعيد منح النطاق تلقائيًا"
check "J13 إيقاف + سحب الصلاحيات"  PENDING "🚩 تحقّق أمني: هل يُعطَّل الحساب وتُسحب الأدوار؟"
check "J14 إنهاء + إغلاق التبعات"  PENDING "🚩 إغلاق العهد/السلف/الإجازات/الصلاحيات"

# 16: انعكاس التقارير
check "J16 تقرير HR يعكس الآثار"   PENDING "تحقّق من انعكاس 1–15"

echo "──────────────────────────────────────────────"
printf "PASS=%d  FAIL=%d  PENDING=%d\n" "$PASS" "$FAIL" "$PENDING"
# البوابة تُغلق فقط حين PASS=16 و FAIL=0 و PENDING=0
if [ "$FAIL" -ne 0 ] || [ "$PENDING" -ne 0 ]; then
  echo "❌ البوابة مفتوحة: HR غير مقبول بعد."
  exit 1
fi
echo "✅ كل الرحلات مرّت — HR مقبول."
