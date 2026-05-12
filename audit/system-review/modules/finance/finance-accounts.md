# /finance/accounts — `artifacts/ghayth-erp/src/pages/finance/accounts.tsx`

## 1. الميتاداتا
- المسار: `/finance/accounts`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/accounts.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:81`
- المجموعة: `finance`
- الكومبوننت: `Accounts`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `accounts`
- سطور الملف: 430
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L281: "طباعة" → `handlePrint`
- L285: "(بلا تسمية)" → `() => setViewMode("tree")`
- L293: "(بلا تسمية)" → `() => setViewMode("flat")`

### القراءات (GET)
- GET `/finance/accounts`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
دليل الحسابات (Chart of Accounts). الأساس الذي يبني عليه كل النظام المالي.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء حساب | finance | `finance-accounts.ts` POST `/accounts` | `chart_of_accounts` | ✅ |
| التحقق من ترقيم منطقي | finance | regex على `code` (5 أرقام مثلاً) | client + server | ✅ |
| ترتيب هرمي | finance | `accounts.parentCode` self-FK | ✅ |
| تصنيف (asset/liability/equity/revenue/expense) | finance | `accounts.type` enum | يحدّد كيف يظهر في القوائم المالية | ✅ |
| ربط بـ `accounting-mappings` | finance | كل عملية (POS, payroll, ...) تربط بحساب | `accounting_mappings` | ✅ |
| accounting-mappings لـ subsidiary | finance | clients/vendors AR/AP تربط بـ child accounts | `subsidiary_accounts` | ✅ |
| رصيد الحساب | finance | aggregation من `gl_lines` (no stored balance) | view | ✅ |
| رصيد الفروع (cost-center) | finance | aggregation per branchId | view | ✅ |
| حماية من الحذف لو له حركات | finance | `accounts.deletedAt` يُمنع إن `gl_lines > 0` | guard | ⚠ تحقق |
| توافق ZATCA (الحقول الإلزامية للضريبة) | finance-zatca | `accounts.vatCategory` | ✅ |
| تأثير على fiscal-periods (إقفال الفترة) | finance | كل ميزان مراجعة يقرأ من `chart_of_accounts` | view | ✅ |
| Audit log | core | إجباري (تغيير دليل الحسابات حساس) | `audit_logs` | ✅ |
| سير موافقة (للحسابات الرئيسية) | governance/workflows | `business_rules.coa_approval_threshold` | `approval_chains` | ⚠ تحقق |

تحقق يدوي:
- [ ] هل تغيير `type` لحساب له حركات يُمنع تلقائياً؟
- [ ] هل دمج حسابين (merge) يحافظ على history كلا الحسابين؟
- [ ] هل الحسابات المُنشأة آلياً من POS/payroll تتبع نفس قواعد الترقيم؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `accounts` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/accounts`
- لقطة: `audit/screenshots/finance_accounts.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
