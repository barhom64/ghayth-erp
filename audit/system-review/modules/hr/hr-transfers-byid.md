# /hr/transfers/:id — `artifacts/ghayth-erp/src/pages/details/transfer-detail.tsx`

## 1. الميتاداتا
- المسار: `/hr/transfers/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/details/transfer-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:155`
- المجموعة: `hr`
- الكومبوننت: `TransferDetail`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 272
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل طلب نقل واحد — view + actions.

| نوع النقل | الوصف |
|----------|------|
| Department transfer | بين أقسام نفس الفرع |
| Branch transfer | بين فروع | requires geographic considerations |
| Position transfer (promotion/demotion) | تغيير المسمى | salary impact |
| Temporary assignment | مؤقت | duration + return date |
| Permanent | دائم | تعديل العقد |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View transfer details | GET `/hr/transfers/:id` | `employee_transfers` | ✅ |
| Approval workflow | راجع `governance/approvals.md` | ✅ |
| Approve | POST `/hr/transfers/:id/approve` | lifecycle pending→approved | راجع `governance.md` ✅ |
| Reject | POST `/hr/transfers/:id/reject` | with reason | ✅ |
| Cancel (before approval) | PATCH | by requester | ✅ |
| Effective date enforcement | scheduled | على date يحدث assignment | ✅ critical |
| Update employee assignment | على effective date | `employee_assignments` | ✅ |
| Salary adjustment (لو promotion) | linkage | راجع `hr-salary-components.md` | ✅ |
| Contract amendment | لو permanent | راجع `hr-contracts.md` | ✅ |
| Access transfer (IT systems) | clearance | راجع `admin-users.md` | ⚠ |
| Asset handover (لو branch transfer) | راجع `warehouse-movements.md` | ⚠ |
| Notification chain | event=`transfer_initiated/approved/rejected` | راجع `notifications.md` | ✅ |
| تكامل مع `hr-attendance.md` | shift change لو branch transfer | ✅ |
| تكامل مع `hr-evaluations.md` | new manager evaluation context | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| RBAC | hr-manager + relevant managers (old/new) | ✅ |

تحقق يدوي:
- [ ] هل effective date scheduled job يعمل بدقة (لا تأخّر)؟
- [ ] هل asset handover يمنع التحويل لو فيه أصول معلّقة؟
- [ ] هل manager القديم يستطيع الـ block (قبل approval)؟
- [ ] هل audit يحفظ both old + new assignment snapshot؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/transfers → 401`
- landedUrl: `?`
- توصية: مغلق
