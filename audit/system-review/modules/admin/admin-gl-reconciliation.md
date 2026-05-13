# /admin/gl-reconciliation — `artifacts/ghayth-erp/src/pages/admin-gl-reconciliation.tsx`

## 1. الميتاداتا
- المسار: `/admin/gl-reconciliation`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/admin-gl-reconciliation.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/adminRoutes.tsx:35`
- المجموعة: `admin`
- الكومبوننت: `AdminGlReconciliation`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `gl-reconciliation`
- سطور الملف: 107
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L45: "(بلا تسمية)" → `() => refetch()`

### القراءات (GET)
- GET `/admin/governance/gl-reconciliation`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
GL Reconciliation — مطابقة الأستاذ العام مع الـ sub-ledgers (AR, AP, Inventory, ...).

| Sub-ledger | الكنترول | المصدر |
|-----------|---------|--------|
| AR | sum(`invoices.balance`) = sum(`gl_lines WHERE account_type='AR'`) | finance/invoices + GL |
| AP | sum(`vendors.balance`) = sum(`gl_lines WHERE account_type='AP'`) | finance/vendors + GL |
| Inventory | sum(`inventory_layers.value`) = sum(`gl_lines WHERE account='Inventory'`) | warehouse + GL |
| Custodies | sum(`custodies.balance`) = `gl_lines.Employee_Custody_account` | finance/custodies |
| Bank | sum(`bank_statements.balance`) = `gl_lines.Bank_account` | finance/bank-reconciliation |
| Fixed Assets | sum(`fixed_assets.netBookValue`) = `gl_lines.Net_FA_account` | finance/fixed-assets |
| Tenant Deposits | sum(`property_deposits.balance`) = `gl_lines.Deposits_Liability` | properties |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Run reconciliation | POST `/admin/gl-reconciliation/run` | aggregate + compare | ✅ |
| كشف فروقات (variances) | كل sub-ledger له expected vs actual | `reconciliation_variances` | ✅ |
| Drill-down للفروقات | كل variance يقود لـ transactions | للـ root cause | ✅ |
| Auto-fix لو فرق صغير (< ## 3. الحركات ذات الصلة (Cross-Module Transactions)
) | rounding adjustments | يولّد قيد تسوية | ⚠ تحقق |
| Manual journal للتسوية الكبيرة | راجع `finance-journal-create.md` | يحتاج موافقة | ✅ |
| تقرير شهري قبل الإقفال | إجباري قبل closing الفترة | ✅ |
| إشعار للـ CFO عند variance > 0 | event=`gl_reconciliation_variance` | `notifications` | ✅ critical |
| Audit log إجباري | لكل run + كل tuning | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل reconciliation يُشغّل تلقائياً قبل closing الفترة (guard)?
- [ ] هل الفروقات > حد معيّن تمنع الإقفال؟
- [ ] هل audit trail يحفظ الـ matched IDs للتدقيق اللاحق؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `gl-reconciliation` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/admin/gl-reconciliation`
- لقطة: `audit/screenshots/admin_gl_reconciliation.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
