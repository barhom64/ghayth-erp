# /hr/idp — `artifacts/ghayth-erp/src/pages/hr/idp.tsx`

## 1. الميتاداتا
- المسار: `/hr/idp`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/idp.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:157`
- المجموعة: `hr`
- الكومبوننت: `IDP`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `idp`
- سطور الملف: 280
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/idp` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L239: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/hr/idp`
- GET `/employees?status=active&limit=200`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
Individual Development Plan (IDP). خطة تطوير الموظف السنوية.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء IDP (يدوي أو من performance review) | hr | POST `/hr/idp` | `hr_idp_plans` | ✅ |
| ربط بأهداف SMART | hr | `idp_goals` per plan | ✅ |
| ربط بالنقاط الضعيفة من التقييم | hr/performance | `idp_plans.linkedReviewId` → `performance_reviews` | ✅ راجع `hr-performance.md` |
| ربط ببرامج تدريبية | hr/training | `idp_items.trainingId` → `training_programs` | ✅ |
| ميزانية التدريب | finance/budget | `idp_plans.budgetAllocated` → `budgets` | ⚠ تحقق |
| ربط بـ 360 evaluation | hr | راجع `hr-evaluation-360.md` | ⚠ |
| follow-up + check-ins | hr | `idp_checkins` (شهري) | ✅ |
| تقييم الإنجاز | hr | عند الإغلاق → نسبة الإكمال | ⚠ |
| تأثير على التقييم السنوي القادم | hr/performance | feed into `performance_kpis` | ✅ |
| ربط بـ ترقية محتملة | hr | اقتراح ترقية عند إكمال IDP بنجاح | ⚠ يدوي |
| إشعارات (الموظف + المدير + HR) | comms | event=`idp_created\|milestone_reached\|due\|completed` | `notifications` | ✅ |
| Audit log | core | `auditMiddleware` (`/hr/idp` لو مضاف) | `audit_logs` | ⚠ |

تحقق يدوي:
- [ ] هل IDP بدون تحديث لشهرين متتالين يطلق تنبيه للمدير؟
- [ ] هل ميزانية تدريب IDP محدودة per employee per year؟
- [ ] هل IDP إجباري للترقية أم اختياري؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `idp` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/idp`
- لقطة: `audit/screenshots/hr_idp.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
