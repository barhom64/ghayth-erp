# /hr/discipline/memos — `artifacts/ghayth-erp/src/pages/hr/discipline-memos.tsx`

## 1. الميتاداتا
- المسار: `/hr/discipline/memos`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/discipline-memos.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:138`
- المجموعة: `hr`
- الكومبوننت: `DisciplineMemos`
- subKey: `violations` | minRoleLevel: —
- الكيان المستنبط: `memos`
- سطور الملف: 25
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
الإنذارات التأديبية. المرجع: `docs/blueprints/hr-discipline.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إصدار إنذار | hr/discipline | `hr-discipline.ts` POST `/discipline/memos` | `discipline_memos` | ✅ |
| ربط بمخالفة سابقة | hr | `memo.violationId` → `employee_violations` | ✅ |
| سير موافقة (3 طبقات: مباشر → HR → MD) | governance/workflows | `approval_chains` | ✅ |
| اللائحة المرجعية | hr/discipline | `discipline_regulation` (الفصل/المادة) | `discipline_regulation` | ✅ |
| تصاعد العقوبة (escalation) | hr | `penalty-escalation` بناءً على history | `penalty_escalations` | ✅ |
| خصم من الراتب (إن العقوبة مالية) | hr/payroll | `payroll_lines.violationDeduction` | ✅ |
| إيقاف عن العمل (suspension) | hr/attendance | `attendance.status='suspended'` خلال فترة | ⚠ تحقق |
| فصل من العمل (termination) | hr/exit | يفتح `hr_exit_requests` بطلب فصل | ⚠ تحقق |
| توليد المذكرة كمستند | documents | من template → `documents.entityType='discipline_memo'` | ✅ |
| توقيع رقمي | digital-signature | اختياري | ✅ |
| إشعار للموظف + المدير + HR | comms | event=`memo_issued\|memo_acknowledged\|escalated` | `notifications` | ✅ |
| إقرار/اعتراض الموظف | hr | `memo_acknowledgements` (signed/disputed) | ✅ |
| Audit log | core | `auditMiddleware` (`/hr/discipline`) | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل صلاحية الاطلاع على المذكرة محصورة (HR + الموظف + المدير المباشر)؟
- [ ] هل المذكرة المتقادمة (>سنة) تُلغى من سجل الـ escalation؟
- [ ] هل الاعتراض على مذكرة يفتح لجنة مراجعة (workflow منفصل)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `memos` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/discipline/memos`
- لقطة: `audit/screenshots/hr_discipline_memos.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
