# /hr/performance — `artifacts/ghayth-erp/src/pages/hr/performance.tsx`

## 1. الميتاداتا
- المسار: `/hr/performance`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/performance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:106`
- المجموعة: `hr`
- الكومبوننت: `Performance`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `performance`
- سطور الملف: 138
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/hr/performance`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تقييم الأداء (Performance Reviews) — دورة سنوية أو ربع سنوية.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء مراجعة أداء | hr | `hr.ts` POST `/performance` | `hr_performance_reviews` | ✅ |
| تحديد KPIs الموظف | hr | `performance_kpis` per role | ✅ |
| مراجعة 360° (راجع `hr-evaluation-360.md`) | hr | `evaluation_cycles` | متصلة | ✅ |
| ربط بـ training/IDP (للنقاط الضعيفة) | hr/training | `idp_items.linkedReviewId` | ✅ |
| توصية بـ علاوة/ترقية | hr | `performance_outcomes` | ⚠ تحقق |
| تأثير على راتب (next cycle) | hr/payroll | تعديل `salary_components` يدوي بناءً على outcome | ✅ |
| تأثير على المكافأة السنوية | finance/GL | bonus calculation → `expenses` | ⚠ |
| توقيع رقمي للمراجعة | digital-signature | الموظف + المدير + HR | ✅ |
| تخزين في ملف الموظف | documents | `documents.entityType='employee'` | ✅ |
| إشعارات (الموظف + المدير + HR) | comms | event=`review_scheduled\|completed\|signed` | `notifications` | ✅ |
| Audit log | core | `auditMiddleware` (`/hr/performance`) | `audit_logs` (entity=`performance`) | ✅ |

تحقق يدوي:
- [ ] هل تقييم سنتين متتاليتين ضعيفتين يطلق Performance Improvement Plan آلياً؟
- [ ] هل اعتراض الموظف على التقييم يفتح workflow مراجعة منفصل؟
- [ ] هل المراجعة محفوظة immutable بعد التوقيع؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `performance` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/performance`
- لقطة: `audit/screenshots/hr_performance.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
