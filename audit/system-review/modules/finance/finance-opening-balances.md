# /finance/opening-balances — `artifacts/ghayth-erp/src/pages/finance/opening-balances.tsx`

## 1. الميتاداتا
- المسار: `/finance/opening-balances`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/opening-balances.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:140`
- المجموعة: `finance`
- الكومبوننت: `OpeningBalances`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `opening-balances`
- سطور الملف: 147
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

أرصدة افتتاحية — للـ go-live من نظام سابق. عملية مرّة واحدة (one-time) لكل tenant.

| الفئة | الوصف |
|------|------|
| Assets | كاش، بنوك، ذمم مدينة، مخزون، أصول ثابتة |
| Liabilities | ذمم دائنة، قروض، GOSI |
| Equity | رأس مال، أرباح محتجزة |
| Trial balance | يجب أن يكون متوازن قبل القفل |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List opening balances | GET `/finance/opening-balances` | `gl_entries` WHERE type=opening | ✅ |
| Set/Update per account | PATCH `/finance/opening-balances/:accountId` | only before go-live | ✅ critical |
| Bulk import (CSV/Excel) | POST `/finance/opening-balances/import` | with validation | ⚠ |
| Validate trial balance | server-side | Assets = Liabilities + Equity | ✅ critical |
| Lock opening (final) | POST `/finance/opening-balances/lock` | irreversible — requires CFO + audit | ✅ critical |
| Cannot unlock | guard | إلا via DB admin + full audit | ✅ critical |
| Generate as opening journal | يولّد قيود في `gl_entries` | reference=`OPENING` | ✅ |
| AR opening balances | per customer | راجع `crm/clients.md` | ✅ |
| AP opening balances | per supplier | راجع `warehouse-suppliers.md` | ✅ |
| Inventory opening | per item per warehouse | linked to `inventory_layers` | ✅ |
| Fixed assets opening | per asset | with accumulated depreciation | راجع `finance-fixed-assets.md` |
| تكامل مع `finance-financial-statements.md` | البداية | ✅ critical |
| تكامل مع `finance-trial-balance.md` | initial state | ✅ |
| Audit log إجباري | كل تعديل | `audit_logs` | ✅ critical |
| RBAC | CFO + finance director فقط | level≥90 | ✅ critical |
| Cannot post regular transactions before lock | guard | ✅ |

تحقق يدوي:
- [ ] هل lock irreversible فعلاً؟ (لا way to unlock by anyone except DBA)
- [ ] هل validate Trial Balance لازم قبل lock؟
- [ ] هل AR/AP opening تتطابق مع customer/supplier balances؟
- [ ] هل صلاحية opening balances مقصورة على CFO + audit logged دائماً؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `opening-balances` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/opening-balances`
- لقطة: `audit/screenshots/finance_opening_balances.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
