# /hr/expiring-documents — `artifacts/ghayth-erp/src/pages/hr/expiring-documents.tsx`

## 1. الميتاداتا
- المسار: `/hr/expiring-documents`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/expiring-documents.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:160`
- المجموعة: `hr`
- الكومبوننت: `ExpiringDocuments`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `expiring-documents`
- سطور الملف: 174
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

مستندات الموظفين المنتهية / المقاربة على الانتهاء — Critical expiry dashboard.

| نوع المستند | إجباري لمن | المدة الدنيا للتنبيه |
|------------|----------|---------------------|
| Iqama (إقامة) | expat employees | 90/60/30/7 يوم |
| Passport | expat employees | 6 شهر |
| Visa (work permit) | expat employees | 90/60/30 يوم |
| Driver's license | drivers | 90/30 يوم |
| Health card | food/medical workers | 30/7 يوم |
| GOSI registration | all employees | يومي للـ audit |
| Contract (عقد العمل) | all | 90/60/30 يوم |
| Bond (لو مرتبط training) | as bonded | per terms |
| Saudization certificate | per Saudi rules | annual |
| Special certifications (driver heavy, electrician, etc.) | per role | 90/30 يوم |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List expiring documents | GET `/hr/expiring-documents` | aggregations | ✅ |
| Filter by document type/days | UI | ✅ |
| Drill-down to employee | navigate to `hr-employee-profile-byid.md` | ✅ |
| Trigger reminder (manual) | event=`document_expiring` | راجع `notifications.md` | ✅ |
| Auto-reminders (cron) | 90/60/30/7/1 days before | راجع `automation.md` | ✅ critical |
| Block dispatch (drivers لو license expired) | راجع `fleet-drivers-byid.md` | ✅ critical |
| Block continued employment (لو Iqama expired) | راجع `employees.md` | ✅ critical |
| Initiate renewal workflow | راجع `documents.md` | ⚠ |
| Bulk reminder to HR + employees | راجع `notifications.md` | ✅ |
| Compliance report (Saudization, etc.) | راجع `governance-compliance.md` | ✅ |
| Cost forecast (renewal fees) | budget input | راجع `finance-budget.md` | ⚠ |
| تكامل مع `employees.md` (master record) | ✅ critical |
| تكامل مع `fleet-drivers-byid.md` (license check) | ✅ critical |
| تكامل مع `governance-compliance.md` (Saudization) | ✅ critical |
| تكامل مع `notifications.md` (multi-tier alerts) | ✅ critical |
| تكامل مع Absher/MoI (Saudi platform) | external sync | راجع `admin-integrations.md` | ⚠ |
| تكامل مع Qiwa | external | راجع `admin-integrations.md` | ✅ critical |
| Audit log on access | `access_logs` | ✅ |
| **PDPL** — confidentiality عالية | restrict access | ✅ critical |
| RBAC | hr-manager + admin + employee (own only) | ✅ critical |

تحقق يدوي:
- [ ] هل auto-reminders truly fire at 90/60/30/7/1 days؟
- [ ] هل expired license blocks driver dispatch تلقائياً؟
- [ ] هل expired Iqama blocks continued work + flags HR للـ urgent action?
- [ ] هل bulk reminders go via correct channels per priority؟
- [ ] هل Absher integration syncs expiries in real-time?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `expiring-documents` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/expiring-documents`
- لقطة: `audit/screenshots/hr_expiring_documents.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
