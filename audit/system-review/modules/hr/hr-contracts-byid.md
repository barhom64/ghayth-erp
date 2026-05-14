# /hr/contracts/:id — `artifacts/ghayth-erp/src/pages/details/hr-contract-detail.tsx`

## 1. الميتاداتا
- المسار: `/hr/contracts/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/hr-contract-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:163`
- المجموعة: `hr`
- الكومبوننت: `HrContractDetail`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 288
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل عقد عمل واحد — Employment contract detail.

| الحالة | الوصف |
|--------|------|
| Draft | قيد الإعداد |
| Pending signature | بانتظار التوقيع |
| Active | فعّال — مسجّل GOSI |
| Pending renewal | يقرب نهايته |
| Renewed | تم تجديده |
| Terminated | منهي | راجع `hr-exit.md` |
| Expired | انتهى دون تجديد |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View contract | GET `/hr/contracts/:id` | `employee_contracts` | ✅ |
| E-signature collection | راجع `documents.md` | dual-party | ⚠ |
| Activate (post-signature) | with GOSI registration | راجع `admin-integrations.md` | ✅ critical |
| Amend (ملحق) | POST `/hr/contracts/:id/amendment` | with audit + new version | ✅ critical |
| Renew | POST `/hr/contracts/:id/renew` | يولّد new linked contract | ✅ |
| Terminate (early) | with reason | راجع `hr-exit.md` | ✅ critical |
| Probation evaluation | راجع `hr-evaluations.md` | within probation period | ⚠ |
| Linked salary changes | راجع `hr-payroll-salary-components.md` | with audit | ✅ critical |
| Linked transfers | راجع `hr-transfers.md` | ✅ |
| Document storage (PDF) | راجع `documents.md` | signed copy | ✅ critical |
| Saudi Labor Law compliance check | server-side | gratuity, leaves, OT terms | ✅ critical |
| GOSI registration sync | external | ✅ critical |
| Qiwa registration sync | external | ✅ |
| Mudad WPS setup (لو applicable) | external | ✅ |
| Expiry alerts (90/60/30/7 يوم) | cron | راجع `notifications.md` | ✅ critical |
| تكامل مع `employees.md` (linked employee) | ✅ |
| تكامل مع `hr-payroll.md` (salary basis) | ✅ critical |
| تكامل مع `hr-exit.md` (termination) | ✅ critical |
| تكامل مع `documents-archive.md` (retention 5y+ post-termination) | ✅ critical |
| تكامل مع `governance-compliance.md` (Saudi Labor Law) | ✅ critical |
| Audit log إجباري | كل تعديل/توقيع/تجديد | `audit_logs` | ✅ critical |
| **PDPL** — confidential | restricted | ✅ critical |
| RBAC | hr-manager + employee (own view only) | ✅ critical |

تحقق يدوي:
- [ ] هل expiry reminders تطلق متعدد المستويات (HR + manager + employee)?
- [ ] هل amendments preserve original version (history)?
- [ ] هل Saudi Labor Law validation تمنع invalid clauses (e.g., probation > 90 days)?
- [ ] هل GOSI sync real-time مع activation?
- [ ] هل expired contract auto-blocks attendance + payroll?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/contracts → 401`
- landedUrl: `?`
- توصية: مغلق
