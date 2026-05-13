# /manager-board — `artifacts/ghayth-erp/src/pages/manager-board.tsx`

## 1. الميتاداتا
- المسار: `/manager-board`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/manager-board.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:77`
- المجموعة: `misc`
- الكومبوننت: `ManagerBoard`
- subKey: — | minRoleLevel: 40
- الكيان المستنبط: `manager-board`
- سطور الملف: 492
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L196: "مركز القرارات الكامل"
- L269: "التفاصيل"
- L326: "الكل"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
لوحة المدير (Manager Board) — KPIs قسمية + الإجراءات المنتظرة للمدير.

| القسم | المصدر | البيانات |
|------|--------|----------|
| Pending approvals | requests + workflows | عدد الطلبات تنتظر موافقتي |
| Team attendance today | hr/attendance | check-in count + lateness |
| Team performance KPIs | hr/performance | scores per employee |
| Team productivity | tasks/projects | tasks completed/pending |
| Department budget status | finance/budget | % spent, alerts |
| Open tickets | support | tickets assigned to my team |
| Compliance status | governance | open audit findings + CAPA |
| Open risks | governance | risks I own |
| Upcoming reviews | hr/performance | reviews due in 30 days |
| Direct reports list | hr | scope: my team only |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| تجميع KPIs | aggregate من 8+ مصدر | محسوب لحظياً | ✅ |
| فلترة scope=team | يطبق reportingChain | RBAC | ✅ |
| Quick actions (approve from board) | inline approval | راجع `requests-byid.md` | ✅ |
| Drill-down per employee | navigate to `employee-detail` | راجع `employees-byid.md` | ✅ |
| تصدير report | `export.ts` | weekly summary | ⚠ |
| إشعارات للمدير | comms | event=`team_kpi_alert` | `notifications` | ⚠ |
| Audit log | core | read-only operations لا تُسجّل | ✅ |

تحقق يدوي:
- [ ] هل scope of "team" يشمل grandchildren (manager-of-manager view)؟
- [ ] هل البيانات الحساسة (راتب الموظف) محصورة على المدير المباشر + HR؟
- [ ] هل اللوحة محدثّة real-time أم cached؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `manager-board` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/manager-board`
- لقطة: `audit/screenshots/manager_board.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
