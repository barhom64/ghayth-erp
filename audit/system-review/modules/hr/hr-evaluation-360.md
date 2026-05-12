# /hr/evaluation-360 — `artifacts/ghayth-erp/src/pages/hr/evaluation-360.tsx`

## 1. الميتاداتا
- المسار: `/hr/evaluation-360`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/evaluation-360.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:149`
- المجموعة: `hr`
- الكومبوننت: `Evaluation360`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `evaluation-360`
- سطور الملف: 180
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/hr/evaluation-cycles`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تقييم 360° — مدير + زميل + موظف upward (سري).

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء دورة تقييم | hr | POST `/hr/evaluation-cycles` | `evaluation_cycles` | ✅ |
| اختيار المُقيِّمين (peers + manager) | hr | `evaluation_participants` | ✅ |
| **تقييم زميل** (peer-evaluation) | hr | POST `/hr/evaluation-cycles/:id/peer-evaluation` | `peer_evaluations` | ✅ |
| **تقييم upward سري** (employee→manager) | hr | POST `/hr/evaluation-cycles/:id/upward-review` | `upward_reviews` (anonymous) | ✅ |
| تجميع وتحليل النتائج | hr | aggregate من peer + upward + manager | view | ✅ |
| تقرير 360° | hr | GET `/hr/evaluation-cycles/:id/summary` | aggregation | ✅ |
| **سرية ضرورية** | core | `upward_reviews` لا تربط بـ `reviewerId` في الـ output | RBAC checks | ✅ critical |
| تأثير على `hr_performance_reviews` السنوية | hr | عبر `performance_reviews.evaluationCycleId` | ✅ |
| ربط بـ training/IDP للنقاط الضعيفة | hr/training | `idp_items.linkedCycleId` | ⚠ |
| إشعارات للمُقيِّمين (السرية محفوظة) | comms | event=`peer_evaluation_requested` | `notifications` (بدون اسم المُقيّم في الـ payload) | ✅ |
| تجميع تقارير للمدير | bi | aggregate non-anonymous بعد الـ cycle | views | ✅ |
| Audit log | core | `auditMiddleware` (`/hr/evaluation-cycles`) — يجب ألا يكشف الـ reviewer للـ upward | ⚠ تحقق |

تحقق يدوي:
- [ ] هل `upward_reviews` تحفظ `reviewerId` مشفّر/hashed أم plain؟
- [ ] هل العدد الأدنى للمُقيِّمين (n=3) محصّن قبل عرض الـ aggregate (لمنع التعرّف)؟
- [ ] هل اللوحات الإدارية تعرض البيانات السرية بحاية aggregation فقط؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `evaluation-360` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/evaluation-360`
- لقطة: `audit/screenshots/hr_evaluation_360.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
