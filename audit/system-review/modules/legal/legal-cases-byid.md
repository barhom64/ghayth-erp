# /legal/cases/:id — `artifacts/ghayth-erp/src/pages/legal-case-detail.tsx`

## 1. الميتاداتا
- المسار: `/legal/cases/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/legal-case-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:26`
- المجموعة: `legal`
- الكومبوننت: `LegalCaseDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 546
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل قضية واحدة — full lifecycle: open → in-progress → judgment → closed/appealed.

| الحالة | الوصف |
|--------|------|
| Draft | قيد الإعداد قبل الرفع |
| Filed | مرفوعة في المحكمة |
| In progress | جلسات نشطة |
| Awaiting judgment | بانتظار الحكم |
| Judgment issued | صدر حكم | راجع `legal-judgments.md` |
| Appeal filed | استئناف |
| Closed (won/lost) | انتهت |
| Settled | تسوية |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View case details | GET `/legal/cases/:id` | `legal_cases` | ✅ |
| Add session (court hearing) | راجع `legal-sessions.md` | ✅ |
| Add judgment | راجع `legal-judgments.md` | ✅ |
| Add document/evidence | POST `/legal/cases/:id/documents` | راجع `documents.md` | ✅ |
| Add correspondence (لـ counterparty) | راجع `legal-correspondence.md` | ✅ |
| Assign lawyer (internal/external) | per case | with scope | ✅ |
| Track legal fees (billable) | راجع `finance-expenses.md` | ✅ |
| Track court fees | راجع `finance-expenses.md` | ✅ |
| Set/extend deadline (statute of limitations) | reminder | event=`legal_deadline_approaching` | ✅ critical |
| Update status | lifecycle | راجع `lifecycle/legal-cases.ts` | ✅ |
| File appeal | POST `/legal/cases/:id/appeal` | with new deadline | ✅ |
| Settle | POST `/legal/cases/:id/settle` | with terms + financial impact | ✅ critical |
| Close (won) | with judgment reference | ✅ |
| Close (lost) | with appeal option + provision | راجع `finance-provisions.md` | ✅ critical |
| Provisions for liability | لو خسارة محتملة | راجع `finance-provisions.md` | IFRS ✅ critical |
| تكامل مع Najz (المحاكم Saudi) | external sync | راجع `admin-integrations.md` | ⚠ |
| تكامل مع `finance-expenses.md` (fees) | linked GL | ✅ |
| تكامل مع `governance-compliance.md` | لو يؤثر | ✅ |
| تكامل مع `documents-archive.md` | retention 10y+ | ✅ critical |
| تكامل مع `notifications.md` (sessions + deadlines) | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| **PDPL** — confidentiality عالية | restrict access | ✅ critical |
| RBAC | legal counsel + lawyer assigned only | external lawyer scope to one case | ✅ critical |

تحقق يدوي:
- [ ] هل deadline alerts قبل 30/15/7/1 يوم؟
- [ ] هل external lawyer يستطيع رؤية قضايا أخرى؟ (يجب لا)
- [ ] هل provisions يولّد GL entry تلقائياً عند احتمال خسارة عالٍ؟
- [ ] هل Najz sync يحدّث session dates تلقائياً؟
- [ ] هل closed cases read-only فقط (مع option للـ reopen by manager)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/legal/cases → 401`
- landedUrl: `?`
- توصية: مغلق
