# /hr/overtime/:id — `artifacts/ghayth-erp/src/pages/hr/overtime-detail.tsx`

## 1. الميتاداتا
- المسار: `/hr/overtime/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/overtime-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:127`
- المجموعة: `hr`
- الكومبوننت: `OvertimeDetail`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 231
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L64: "(بلا تسمية)" → `() => navigate("/hr/overtime")`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تفاصيل طلب overtime واحد — يكمّل `hr-overtime.md` على مستوى الـ entity.

| المحتوى | الوصف |
|------|------|
| Hours requested | الساعات المطلوبة |
| Reason | سبب الـ overtime |
| Approval chain | راجع `hr-overtime.md` |
| Approval history | كل خطوة + التاريخ + المُقيّم |
| Computed cost | hours × hourly_rate × multiplier (1.5 أو 2.0) |
| Linked attendance | لو موجود check-in/out يطابق الفترة |
| Status | pending/approved/rejected/paid |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| عرض التفاصيل | GET `/hr/overtime/:id` | `hr_overtime` + joins | ✅ |
| موافقة/رفض | راجع `requests-byid.md` | ✅ |
| تعديل بعد التقديم (قبل الاعتماد) | hr | PATCH `/hr/overtime/:id` | ⚠ يحتاج التحقق |
| Linked to attendance auto-match | hr | راجع `hr-attendance.md` | ✅ |
| تأثير على payroll | hr/payroll | راجع `hr-overtime.md` و `hr-payroll.md` | ✅ |
| إشعارات | راجع `hr-overtime.md` | ✅ |
| Audit log | `auditMiddleware` (`/hr/overtime` لو مضاف) | ⚠ |

تحقق يدوي:
- [ ] هل تعديل overtime مُعتمد يحتاج re-approval؟
- [ ] هل overtime لـ ساعات غير actual (تم check-out قبلها) يُكتشف؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/overtime → 401`
- landedUrl: `?`
- توصية: مغلق
