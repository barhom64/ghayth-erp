# /hr/contracts — `artifacts/ghayth-erp/src/pages/hr/contracts.tsx`

## 1. الميتاداتا
- المسار: `/hr/contracts`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/contracts.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:161`
- المجموعة: `hr`
- الكومبوننت: `Contracts`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `contracts`
- سطور الملف: 239
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L224: "(بلا تسمية)"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

عقود العمل — Employee contracts. مستند رسمي لكل علاقة عمل.

| نوع العقد | الوصف | متطلب نظامي |
|----------|------|------------|
| Permanent (محدد) | سنة قابلة للتجديد | Saudi Labor Law — مدّة محددة |
| Indefinite (غير محدد) | للمواطنين | Saudi Labor Law |
| Part-time | بدوام جزئي | Saudi Labor Law |
| Project-based | مرتبط بمشروع | راجع `projects.md` |
| Probation (3-90 يوم) | فترة تجربة | إجباري عند البداية |
| Internship | للتدريب | Saudi Labor Law |
| Outsource | لو موظف خارجي | external company linkage |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List contracts | GET `/hr/contracts` | `employee_contracts` | ✅ |
| إنشاء عقد جديد | POST `/hr/contracts` | يولّد PDF + signature workflow | ✅ |
| Renew contract | POST `/hr/contracts/:id/renew` | يولّد عقد جديد مرتبط | ✅ |
| Amend (تعديل) | POST `/hr/contracts/:id/amendment` | with audit + signature | ✅ critical |
| Terminate | راجع `hr-exit.md` | ✅ |
| Auto-renew flag | للمواطن typically | `autoRenew` | ⚠ |
| Expiry reminder (90/60/30 يوم) | cron | event=`contract_expiring` | راجع `notifications.md` ✅ |
| Salary changes link to contract | salary_components_history | ✅ |
| Title/position changes | linked transfers | راجع `hr-transfers.md` | ✅ |
| Probation evaluation | راجع `hr-evaluations.md` | ✅ |
| Compliance — Saudi Labor Law | validation | gratuity, leaves, overtime tied to contract terms | ✅ critical |
| Compliance — GOSI registration | external | راجع `admin-integrations.md` | ✅ |
| Compliance — Qiwa | Saudi labor portal | external | ⚠ |
| Mudad integration (لو WPS) | راجع `hr-payroll.md` | ✅ |
| Document storage | راجع `documents.md` | signed PDF | ✅ |
| Audit log إجباري | كل تعديل/تجديد/إنهاء | `audit_logs` | ✅ critical |
| **PDPL** — retention 5 سنوات بعد الإنهاء | per regulation | ✅ |
| RBAC | hr-manager + above | راجع `admin-rbac-matrix.md` | ✅ |

تحقق يدوي:
- [ ] هل expiry reminders تطلق بـ 90/60/30 يوم؟
- [ ] هل العقد المنتهي يبقى read-only في النظام (لا حذف)؟
- [ ] هل amendment يحتفظ بنسخة الأصل (version history)؟
- [ ] هل compliance check مع Saudi Labor Law تلقائي عند الإنشاء؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `contracts` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/contracts`
- لقطة: `audit/screenshots/hr_contracts.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
