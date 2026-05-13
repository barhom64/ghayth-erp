# /clients — `artifacts/ghayth-erp/src/pages/clients.tsx`

## 1. الميتاداتا
- المسار: `/clients`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/clients.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:80`
- المجموعة: `crm`
- الكومبوننت: `Clients`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `clients`
- سطور الملف: 234
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L126: "(بلا تسمية)" → `() => setPreviewItem(client)`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

العملاء — Customer master record. مركز الـ AR + المبيعات.

| النوع | الوصف |
|------|------|
| Individual (B2C) | فرد | with national ID + PDPL applies |
| Business (B2B) | شركة | with commercial reg + VAT |
| Government | جهة حكومية | special invoicing terms |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List clients | GET `/crm/clients` | `clients` | ✅ |
| إنشاء عميل | راجع `crm-create.md` | ✅ |
| Profile (360 view) | راجع `crm-byid.md` | ✅ |
| Update بيانات | PATCH `/crm/clients/:id` | with audit | ✅ |
| Verify VAT (ZATCA) | external lookup | راجع `admin-integrations.md` | ⚠ |
| Credit limit | manager approval | راجع `crm-credit-management.md` | ✅ |
| رصيد AR (مستحق) | aggregate | `gl_entries` WHERE account=AR-client | راجع `finance-ar-aging.md` |
| Invoices | linkage | راجع `finance-invoices.md` | ✅ |
| Payments received | linkage | راجع `finance-payments.md` | ✅ |
| Opportunities | linkage | راجع `crm-pipeline.md` | ✅ |
| Activities | linkage | راجع `crm-activities.md` | ✅ |
| Contracts/agreements | linkage | راجع `documents.md` | ✅ |
| Statement of account | report | راجع `bi-reports.md` | ✅ |
| Blacklist | flag | يمنع sales orders جديدة | ✅ critical |
| Merge duplicates | admin action | مع audit إجباري | ⚠ |
| **PDPL** — Right to access | export | ⚠ |
| **PDPL** — Right to erasure | حسب retention rules | ⚠ |
| **PDPL** — Consent log | marketing/communications | `client_consents` | ⚠ |
| Audit log | كل تعديل | `audit_logs` | ✅ |
| Soft delete | guard إذا فيه حركات مالية | ✅ |

تحقق يدوي:
- [ ] هل blacklist يمنع كل sales orders جديدة مع warning واضح؟
- [ ] هل merge duplicates يدمج balances + activities بشكل عرضي؟
- [ ] هل export PDPL يشمل كل البيانات (invoices, payments, activities) في 30 يوم max؟
- [ ] هل credit limit breach يطلب موافقة في الوقت الحقيقي؟

## 4. النمذجة
- الجدول: `clients` (export: `clients`, 10 عمود)
- tenant col: ✅ | createdBy: — | createdAt: ✅ | updatedAt: — | softDelete: ✅ | lifecycle col: ✅
- FKs: companies.id

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/clients`
- لقطة: `audit/screenshots/clients.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
