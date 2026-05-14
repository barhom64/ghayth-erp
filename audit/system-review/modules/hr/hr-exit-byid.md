# /hr/exit/:id — `artifacts/ghayth-erp/src/pages/hr/exit-detail.tsx`

## 1. الميتاداتا
- المسار: `/hr/exit/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/exit-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:130`
- المجموعة: `hr`
- الكومبوننت: `ExitDetail`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 268
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل طلب إنهاء خدمة — Exit lifecycle (initiated → cleared → settled → closed).

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View exit request | GET `/hr/exit/:id` | `employee_exits` | ✅ |
| Clearance checklist progress | aggregate | راجع `hr-exit-clearance.md` | ✅ critical |
| Gratuity calculation (live) | per Saudi Labor Law | راجع `hr-gratuity.md` | ✅ critical |
| Final settlement amount | gratuity + unused leaves + bonuses - loans - advances | ✅ critical |
| Approve (multi-level) | manager → HR → finance | راجع `governance/approvals.md` | ✅ critical |
| Reject | with reason | ✅ |
| Reverse (لو cancelled) | with audit | rare | ⚠ critical |
| Generate end-of-service letter | راجع `print-templates` | ✅ |
| GL entry — settlement | راجع `finance-payroll-posting.md` | ✅ critical |
| GOSI termination submit | external | راجع `admin-integrations.md` | ✅ critical |
| Qiwa termination | external | ⚠ |
| Iqama cancellation (للـ expat) | external (MoI) | راجع `admin-integrations.md` | ✅ critical |
| Exit interview | راجع `hr-exit-interview.md` | optional | ⚠ |
| Deactivate user account | راجع `admin-users.md` | post-clearance | ✅ critical |
| Archive employee profile | move to inactive | راجع `employees.md` | ✅ |
| Final paycheck | راجع `hr-payroll.md` | ✅ critical |
| Clear loans | راجع `hr-loans-byid.md` | with possible deduction from gratuity | ✅ critical |
| Clear custodies | راجع `finance-custodies-byid.md` | ✅ critical |
| Clear assets (laptop, phone, ID card, vehicle) | راجع `warehouse.md` | ✅ critical |
| Clear access (IT systems) | راجع `admin-users.md` | ✅ critical |
| Documents archive | راجع `documents-archive.md` | retention 5y | ✅ critical |
| تكامل مع Saudi MoL (Mudad/Qiwa) | external | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع GOSI | mandatory | راجع `admin-integrations.md` | ✅ critical |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| **PDPL** — retention vs erasure | per regulation | ✅ critical |
| RBAC | hr-manager + finance + IT للـ access | ✅ critical |

تحقق يدوي:
- [ ] هل clearance checklist mandatory before final settlement disbursement?
- [ ] هل gratuity calculation matches Saudi Labor Law بدقة (1/2 first 5 years, full after)?
- [ ] هل GOSI/Iqama termination تلقائي بعد approval?
- [ ] هل asset/access clearance enforced (no exit without it)?
- [ ] هل في حالة Death — gratuity goes to heirs per inheritance rules?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/exit → 401`
- landedUrl: `?`
- توصية: مغلق
