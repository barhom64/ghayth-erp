# /finance/custodies — `artifacts/ghayth-erp/src/pages/finance/custodies.tsx`

## 1. الميتاداتا
- المسار: `/finance/custodies`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/custodies.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:114`
- المجموعة: `finance`
- الكومبوننت: `Custodies`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `custodies`
- سطور الملف: 517
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L178: "عرض"
- L183: "(بلا تسمية)" → `() => setSettleTarget(c)`
- L207: "(بلا تسمية)"
- L381: "إلغاء" → `onDone`
- L496: "إلغاء" → `onDone`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
العهد المالية (Cash Custody). المرجع: `docs/blueprints/finance-invoices.md` §"Custodies".

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| طلب عهدة | finance | `finance-custodies.ts` POST `/custodies` | `custodies` (status='requested') | ✅ |
| سير موافقة | governance/workflows | `business_rules.custody_approval_chain` | `approval_chains` | ✅ |
| صرف العهدة → قيد محاسبي | finance/GL | DR Employee Custody / CR Cash | `gl_entries`, `gl_lines` | ✅ |
| تسليم العهدة للموظف | hr/employees | `custodies.holderId` → `employees.id` | يدخل `custody_balances` | ✅ |
| استخدام جزئي (purchase) | finance | POST `/custodies/:id/spend` | `custody_lines` (with receipt) | ✅ |
| قيد المصروف من العهدة | finance/GL | DR Expense / CR Employee Custody | تخفّض رصيد العهدة | ✅ |
| تسوية نهائية (settle) | finance | POST `/custodies/:id/settle` | `custodies.status='settled'` | ✅ |
| استرجاع المتبقي (refund) | finance/GL | DR Cash / CR Employee Custody | `gl_entries` | ✅ |
| Aging report (عهدة قديمة > 30 يوم) | finance/custodies | `/custodies/aging-report` | aggregation + escalation rules | ✅ |
| إشعار للموظف عند aging | comms | event=`custody_aging_warning` | `notifications` | ⚠ |
| Audit log | core | `auditMiddleware` (`/finance/custodies`) | `audit_logs` (entity=`custody`) | ✅ |

تحقق يدوي:
- [ ] هل عهدة لم تُسوَّ خلال 60 يوم تُخصم من راتب الموظف تلقائياً؟
- [ ] هل المرفقات (إيصالات) إجبارية لكل استخدام جزئي؟
- [ ] هل التقسيم بين عُهد متعددة لنفس الموظف ممكن أم واحدة فقط؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `custodies` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/custodies`
- لقطة: `audit/screenshots/finance_custodies.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
