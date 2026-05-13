# /finance/cashflow — `artifacts/ghayth-erp/src/pages/finance/cashflow-dashboard.tsx`

## 1. الميتاداتا
- المسار: `/finance/cashflow`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/cashflow-dashboard.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:139`
- المجموعة: `finance`
- الكومبوننت: `CashflowDashboard`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `cashflow`
- سطور الملف: 413
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L86: "الوحدة المالية" → `() => refetchSummary()`
- L88: "الوحدة المالية"
- L325: "عرض الكل"
- L361: "عرض الكل"

### القراءات (GET)
- GET `/finance/invoices?status=draft&limit=5${qstr ? `
- GET `/finance/expenses?limit=5${qstr ? `



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تقرير التدفقات النقدية (Cash Flow Statement) — IFRS standard.

| المصدر | البيان | تأثير على cash |
|--------|--------|----------------|
| **Operating Activities** | فواتير عملاء مدفوعة | +Inflow |
| | مصاريف تشغيلية مدفوعة | -Outflow |
| | رواتب مصروفة | -Outflow |
| | VAT to/from ZATCA | net effect |
| **Investing Activities** | شراء أصول ثابتة | -Outflow |
| | بيع أصول ثابتة | +Inflow |
| | استثمارات قصيرة الأجل | varies |
| **Financing Activities** | قروض جديدة | +Inflow |
| | سداد قروض | -Outflow |
| | توزيعات أرباح | -Outflow |
| | bank margins (BGs) | hold/release |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| توليد cash flow statement | `finance-reports.ts` GET `/cashflow` | aggregation من `gl_lines` مع classification | ✅ |
| تصنيف كل قيد (operating/investing/financing) | finance | `gl_entries.cashflowCategory` أو inferred من accountCode | ⚠ تحقق |
| Direct method vs Indirect method | finance/reports | يدعم النوعين | ⚠ غالباً Indirect |
| تكامل مع cash forecast | finance | يستخدم التاريخ كـ baseline للتنبؤ | راجع `finance-cash-flow-forecast.md` |
| تصدير لـ ZATCA/audit | finance | تقرير سنوي | ⚠ |
| ربط بـ fiscal periods | finance | فقط للفترات المغلقة (للنهائي) | ✅ |

تحقق يدوي:
- [ ] هل القيود المباشرة (manual journals) تُصنّف آلياً أم يدوياً؟
- [ ] هل التحويلات بين حسابات شركة واحدة تظهر في الـ cashflow أم تُستبعد؟
- [ ] هل البنوك متعددة (multi-currency) محسوبة بـ closing FX أم average؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `cashflow` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/cashflow`
- لقطة: `audit/screenshots/finance_cashflow.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
