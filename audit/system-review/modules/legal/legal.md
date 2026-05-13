# /legal — `artifacts/ghayth-erp/src/pages/legal.tsx`

## 1. الميتاداتا
- المسار: `/legal`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/legal.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:15`
- المجموعة: `legal`
- الكومبوننت: `Legal`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `legal`
- سطور الملف: 397
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L105: "نسخ العقد"

### القراءات (GET)
- GET `/legal/stats`
- GET `/legal/stats`
- GET `/legal/cases`
- GET `/legal/financial-report`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

الشؤون القانونية — Legal Affairs. الإدارة المركزية لكل قضية + عقد + جلسة.

| القسم | الوصف | المرجع |
|------|------|--------|
| Cases | القضايا | راجع `legal-cases.md` |
| Sessions | جلسات المحكمة | راجع `legal-sessions.md` |
| Judgments | الأحكام | راجع `legal-judgments.md` |
| Contracts | العقود | راجع `legal-contracts.md` |
| Correspondence | المراسلات القانونية | راجع `legal-correspondence.md` |
| Documents | المستندات | راجع `legal-documents.md` |
| Lawyers | المحامون (داخلي/خارجي) | `legal_lawyers` |
| Counterparties | الأطراف المقابلة | `legal_counterparties` |
| Courts | المحاكم | reference data |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Landing dashboard | GET `/legal` | aggregations | ✅ |
| Active cases count | aggregate | per status | ✅ |
| Upcoming sessions | next 7/30 days | راجع `legal-sessions.md` | ✅ |
| Pending judgments | aggregate | ✅ |
| Critical deadlines (statutes of limitations) | alert | event=`legal_deadline_approaching` | راجع `notifications.md` ✅ critical |
| تكامل مع `governance-compliance.md` | للـ regulatory | ✅ |
| تكامل مع Najz (Saudi MOJ) | external | راجع `admin-integrations.md` | ⚠ |
| تكامل مع `documents-archive.md` | retention طويل (10y+) | ✅ critical |
| RBAC | legal counsel + manager | scope per case | ✅ critical |
| **PDPL** — confidentiality عالية | most data restricted | ✅ critical |
| Audit log إجباري | كل وصول للقضايا الحساسة | `access_logs` + `audit_logs` | ✅ critical |

تحقق يدوي:
- [ ] هل deadline tracking مع Najz مزامن real-time؟
- [ ] هل lawyers الخارجية لهم scope محدّد (per case فقط)؟
- [ ] هل audit يحفظ access events للقضايا الحساسة؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `legal` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/legal`
- لقطة: `audit/screenshots/legal.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
