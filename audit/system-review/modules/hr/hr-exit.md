# /hr/exit — `artifacts/ghayth-erp/src/pages/hr/exit-requests.tsx`

## 1. الميتاداتا
- المسار: `/hr/exit`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/exit-requests.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:128`
- المجموعة: `hr`
- الكومبوننت: `ExitRequests`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `exit`
- سطور الملف: 251
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
نهاية الخدمة / استقالة. **عملية شديدة الترابط** — تلامس المالية + الإدارة + الجهات الحكومية.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| طلب نهاية خدمة | hr/exit | `hr-exit.ts` POST `/hr/exit` | `hr_exit_requests` | ✅ |
| سير موافقة (3-5 طبقات) | governance/workflows | `business_rules.exit_approval_chain` (مباشر → HR → MD) | `approval_chains` | ✅ |
| **حساب مكافأة نهاية الخدمة** | hr/gratuity | based on `lib/hr/gratuity-calc` (قاعدة سعودية: نصف شهر/سنة لأول 5، شهر/سنة بعدها) | `hr_gratuity_calculations` | ✅ |
| تسوية رصيد الإجازات | hr/leaves | `hr_leave_balances.remaining` × daily_rate | يُضاف للمستحقات | ✅ |
| تسوية السلف المتبقية | hr/loans | خصم من المستحقات | `hr_loans.status='closed'` | ✅ |
| تسوية العهدة | finance/custodies | يجب تصفية العهد قبل الإذن | `custodies.status='settled'` | ✅ |
| إرجاع الأصول (laptop, sim, badge) | hr/exit | checklist `exit_clearances` | ✅ |
| **قيد محاسبي للمستحقات** | finance/GL | DR Severance Expense / CR Cash + خصم استقطاعات GOSI الأخيرة | `gl_entries`, `gl_lines` | ✅ |
| إلغاء التأشيرة (للأجانب) | gov-integrations | إشعار قوى/الجوازات | `gov_submissions` | ⚠ يدوي عادةً |
| إلغاء GOSI registration | gov-integrations | عبر بوابة GOSI | ⚠ يدوي |
| توليد شهادة خدمة | documents | من template → `documents.entityType='service_certificate'` | ✅ |
| إلغاء صلاحيات النظام | auth | `users.deletedAt = now()` + revoke sessions | `users`, `sessions` | ⚠ تحقق من الـ trigger |
| Exit interview | hr | `exit_interviews` (اختياري) | ✅ |
| إشعارات (للموظف + الجهات + IT) | comms | event=`exit_approved\|clearance_pending\|final_settlement` | `notifications` | ✅ |
| Audit log | core | `auditMiddleware` (`/hr/exit` لو مضاف) | `audit_logs` | ⚠ |

تحقق يدوي:
- [ ] هل صرف المستحقات النهائية يتم عبر voucher واحد أم سلسلة قيود؟
- [ ] هل الموظف لا يستطيع check-in بعد آخر يوم عمل (revoke automatic)؟
- [ ] هل البيانات الشخصية تُمحى/تنحصر بعد X سنة (PDPL compliance)؟
- [ ] هل القضايا القانونية المفتوحة (لو وُجدت) تمنع إصدار شهادة الخدمة؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `exit` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/exit`
- لقطة: `audit/screenshots/hr_exit.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
