# /hr/exit/create — `artifacts/ghayth-erp/src/pages/create/hr/exit-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/exit/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/exit-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:129`
- المجموعة: `hr`
- الكومبوننت: `ExitCreate`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 234
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/exit` | POST | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L123: "مسح المسودة" → `clearDraft`
- L222: "(بلا تسمية)" 🔒
- L226: "(بلا تسمية)" → `() => setLocation("/hr/exit")`

### القراءات (GET)
- GET `/employees?limit=500`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء طلب إنهاء خدمة (Exit / Termination) — العملية الأكثر حساسية في HR.

| نوع الإنهاء | الوصف | gratuity policy |
|------------|------|-----------------|
| Resignation | استقالة | حسب Saudi Labor Law (2/3 بعد سنتين+) |
| Termination (Cause) | فصل لسبب | بدون gratuity إن خرق MA 80 |
| Termination (No Cause) | فصل بدون سبب | full gratuity + compensation |
| End of contract | انتهاء عقد محدد | full gratuity |
| Death | وفاة | full gratuity للورثة |
| Retirement | تقاعد | full gratuity + GOSI pension |
| Mutual agreement | تراضي | حسب الاتفاق |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| إنشاء طلب إنهاء | POST `/hr/exit` | `employee_exits` (status=pending) | ✅ |
| Auto-calculate gratuity | server-side | based on tenure + last salary | راجع `hr-gratuity.md` ✅ |
| Auto-calculate end-of-service settlement | unused leaves + bonuses + loans | راجع `hr-final-settlement.md` ✅ |
| Outstanding loans deduction | linkage | راجع `hr-loans.md` | ✅ critical |
| Outstanding tickets/violations | resolution check | راجع `hr-violations.md` | ⚠ |
| Approval workflow | manager → HR → finance | راجع `governance/approvals.md` | ✅ critical |
| Clearance checklist | IT (access), Finance (cash), Warehouse (items), Documents | راجع `hr-exit-clearance.md` | ✅ |
| Generate end-of-service letter | PDF | راجع `print-templates` | ✅ |
| GL entry — settlement | Dr Salary Expense + Cr Cash/Bank | راجع `finance-payroll-posting.md` | ✅ critical |
| GOSI termination | external API | راجع `admin-integrations.md` | ✅ |
| Qiwa termination | external | ⚠ |
| Deactivate user account (post-clearance) | راجع `admin-users.md` | ✅ critical |
| Archive employee profile | move to inactive | preserve for retention | ✅ |
| Notification chain | event=`exit_initiated` → manager, HR, finance | راجع `notifications.md` | ✅ |
| Exit interview | optional | راجع `hr-exit-interview.md` | ⚠ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| **PDPL** — retention 5 سنوات بعد الإنهاء | regulation | ✅ |
| RBAC | hr-manager + finance approval | ✅ critical |

تحقق يدوي:
- [ ] هل gratuity calculation يطبّق Saudi Labor Law بدقة (1/2 first 5 years, full after)?
- [ ] هل clearance checklist تحجب الـ final settlement حتى الإكمال؟
- [ ] هل GOSI termination تلقائي بعد approval أم يدوي؟
- [ ] هل في حالة Death — gratuity تذهب للورثة (heirs management)؟
- [ ] هل audit log يحتفظ بكل الـ approvals + reasons + clearance items؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/exit/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/hr_exit_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
