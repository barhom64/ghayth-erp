# /dashboard — `artifacts/ghayth-erp/src/pages/dashboard.tsx`

## 1. الميتاداتا
- المسار: `/dashboard`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/dashboard.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:63`
- المجموعة: `misc`
- الكومبوننت: `Dashboard`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `dashboard`
- سطور الملف: 979
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/check-in` | POST | ✅ | — | — | — | ✅ | ✅ | — |
| _(write)_ | `/hr/check-out` | POST | ✅ | — | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L272: "(بلا تسمية)" → `handleCheckIn` 🔒
- L282: "(بلا تسمية)" → `handleCheckOut` 🔒
- L519: "عرض الكل"
- L530: "(بلا تسمية)" → `() => setLocation("/tasks")`
- L576: "عرض الكل"
- L734: "(بلا تسمية)"
- L838: "(بلا تسمية)" → `() => setLocation("/finance/invoices/create")`
- L879: "(بلا تسمية)" → `() => setLocation("/hr/attendance")`

### القراءات (GET)
- GET `/my-space`
- GET `/intelligence/suggestions`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
الصفحة الرئيسية (Dashboard) — أول صفحة بعد login. تختلف حسب الدور.

| الدور | البيانات المعروضة |
|-------|---------------------|
| Employee | My attendance, my leaves, my tasks, my requests |
| Manager | + team KPIs (راجع `manager-board.md`) |
| HR | + headcount, pending hiring, exits |
| Finance | + AR aging, today's vouchers, posting failures |
| CFO | + Revenue MTD, cash position, budget alerts |
| CEO | + exec dashboard summary |
| Admin | + system health, RBAC violations, governance alerts |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| تحميل dashboard حسب role | client-side router | ✅ |
| Check-in/out (للموظف) | راجع `hr-attendance.md` | ✅ |
| Quick stats per scope | aggregate من 10+ مصدر | views | ✅ |
| إشعارات unread badge | aggregate `notifications.unreadCount` | ✅ |
| Recent activities | `event_logs` آخر 20 | ✅ |
| Pending approvals badge | aggregate `approval_chain_steps` | ✅ |
| Quick links (top 5 used) | based on user behavior | ⚠ يدوي حالياً |
| Birthday/anniversary reminders | hr | ⚠ |
| Audit log | لا تُسجّل (read-only) | ✅ |

تحقق يدوي:
- [ ] هل الـ default view لكل role مُهيَّأ بالفعل؟
- [ ] هل المستخدم يستطيع تخصيص dashboard لنفسه؟ (`personal_dashboards`)
- [ ] هل dashboard لا يُحمّل بيانات حساسة لا يحتاجها المستخدم (lazy load)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `dashboard` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=PASS | fetch=PASS | CTA=SKIP | nav=PASS | smoke=PASS
- landedUrl: `http://localhost/dashboard`
- توصية: مغلق
