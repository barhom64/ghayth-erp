# /finance/intercompany — `artifacts/ghayth-erp/src/pages/finance/intercompany.tsx`

## 1. الميتاداتا
- المسار: `/finance/intercompany`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/intercompany.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:134`
- المجموعة: `finance`
- الكومبوننت: `Intercompany`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `intercompany`
- سطور الملف: 201
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L166: "(بلا تسمية)" → `() => setShowCreate(false)`

### القراءات (GET)
- GET `/finance/intercompany${scopeSuffix}`
- GET `/settings/companies${scopeSuffix}`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
Intercompany Transactions — تحويلات/خدمات بين الشركات داخل نفس المجموعة (الـ holding).

| النوع | المثال |
|------|--------|
| Transfer of cash | شركة أ تقرض شركة ب |
| Sale of inventory | شركة أ تبيع لشركة ب (markup أو at-cost) |
| Service rendered | شركة أ تقدّم خدمة لشركة ب |
| Allocation of overhead | حصة كل شركة من costs المركزية |
| Loan + interest | قروض داخلية مع فوائد |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| إنشاء transaction | POST `/finance/intercompany` | `intercompany_transactions` | ✅ |
| **قيد مزدوج** (matching DR/CR) | finance/GL | شركة أ: AR-IC / شركة ب: AP-IC | atomic across companies | ⚠ تحقق |
| Markup للضرائب (transfer pricing) | finance | لـ tax compliance | ⚠ |
| **إلغاء (elimination) عند consolidation** | finance/reports | عند توليد القوائم المُجمَّعة | aggregate per group | ✅ |
| Reconciliation شهري | راجع `admin-gl-reconciliation.md` | sum company A IC = sum company B IC inverted | ✅ critical |
| WHT بين الشركات (إن جنسيات مختلفة) | finance | تطبيق المعاهدات | ⚠ |
| Approval workflow (للمبالغ الكبيرة) | governance | يحتاج CFO من الطرفين | `approval_chains` | ⚠ |
| Audit log إجباري | كل transaction | `audit_logs` | ✅ critical |
| Variance reporting | bi | الفروقات بين المسجَّل والمتوقَّع | ⚠ |
| تكامل مع consolidation | finance/reports | لتقارير IFRS group | ✅ |

تحقق يدوي:
- [ ] هل القيد ينشأ في الشركتين بنفس الوقت atomically (نفس rec ID)?
- [ ] هل اختلاف الـ FX rate بين العمليتين يُحلّ بـ FX gain/loss account؟
- [ ] هل elimination تلقائي عند generation الـ consolidated report؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `intercompany` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/intercompany`
- لقطة: `audit/screenshots/finance_intercompany.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
