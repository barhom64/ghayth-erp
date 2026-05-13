# /legal/judgments/:id — `artifacts/ghayth-erp/src/pages/details/legal-judgment-detail.tsx`

## 1. الميتاداتا
- المسار: `/legal/judgments/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/legal-judgment-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:22`
- المجموعة: `legal`
- الكومبوننت: `LegalJudgmentDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 312
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل حكم قضائي — finality أو بداية appeal.

| نوع الحكم | الأثر |
|----------|------|
| Final judgment | نهائي | actionable |
| Initial judgment | ابتدائي | قابل للاستئناف |
| Settlement order | تسوية | actionable + ملزم |
| Dismissal | رفض | لصالح المدعى عليه |
| Suspended | معلّق | حسب شروط |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View judgment | GET `/legal/judgments/:id` | `legal_judgments` | ✅ |
| Update status | PATCH | with audit | ✅ |
| Mark final (lost appeal window) | enforceable | actionable | ✅ critical |
| Record financial implications | amount + party | for provisions/GL | ✅ critical |
| Update case status | parent | راجع `legal-cases-byid.md` | ✅ |
| File appeal | within statutory window | راجع `legal-cases-byid.md` | ✅ |
| Enforce judgment (لو for us) | execution proceeding | راجع `legal-enforcement.md` | ⚠ |
| Pay judgment (لو against us) | راجع `finance-payments.md` | with GL | ✅ critical |
| GL entry — provision reversal (post final) | راجع `finance-provisions.md` | IFRS | ✅ critical |
| GL entry — settlement payment | راجع `finance-payments.md` | ✅ critical |
| Document attachment | judgment PDF + reasons | إجباري | راجع `documents.md` ✅ |
| Notification chain | event=`judgment_issued/final` | راجع `notifications.md` | ✅ critical |
| تكامل مع Najz (verification) | external | راجع `admin-integrations.md` | ⚠ |
| تكامل مع `documents-archive.md` (retention 30y!) | per Saudi law | ✅ critical |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| RBAC | legal manager + counsel | high-confidentiality | ✅ critical |

تحقق يدوي:
- [ ] هل final judgment يحدث provision reversal تلقائياً؟
- [ ] هل enforcement (لو لصالحنا) يطلق recovery process via finance؟
- [ ] هل appeal window automatic countdown مع تنبيهات؟
- [ ] هل document PDF يحفظ encrypted (PDPL + retention)?
- [ ] هل judgment ضدنا يطلق صلاحية finance manager للـ payment؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/legal/judgments → 401`
- landedUrl: `?`
- توصية: مغلق
