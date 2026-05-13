# /hr/transfers — `artifacts/ghayth-erp/src/pages/hr/transfers.tsx`

## 1. الميتاداتا
- المسار: `/hr/transfers`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/transfers.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:154`
- المجموعة: `hr`
- الكومبوننت: `Transfers`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `transfers`
- سطور الملف: 299
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/transfers` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L239: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/hr/transfers`
- GET `/employees?status=active&limit=200`
- GET `/settings/branches`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
نقل الموظفين بين أقسام/فروع/شركات.

| النوع | المثال |
|------|--------|
| Department transfer | داخل نفس الفرع، قسم آخر |
| Branch transfer | فرع آخر داخل نفس الشركة |
| Inter-company transfer | شركة أخرى داخل نفس الـ holding |
| Promotion (with transfer) | منصب جديد + قسم/فرع |
| Demotion | منصب أقل |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| طلب نقل (يدوي أو HR-driven) | POST `/hr/transfers` | `employee_transfers` | ✅ |
| سير موافقة (المدير الحالي + الجديد + HR) | governance | `approval_chains` (3 طبقات) | ✅ |
| تحديث `employee_assignments` | hr | عند الاعتماد → row جديد + close القديم | atomic | ✅ |
| تأثير على الراتب (لو تغيير) | hr/payroll | `salary_components` per assignment | ⚠ تحقق |
| تأثير على ميزانية القسم | راجع `finance-budget.md` | الراتب يخصم من قسم آخر | ⚠ |
| تأثير على approval chains | governance | إعادة بناء `chains.managerId` للموظف | ✅ |
| إشعار للأطراف المعنية | comms | event=`transfer_requested\|approved\|effective` | `notifications` | ✅ |
| تكامل GOSI/قوى (للنقل بين شركات) | gov-integrations | تحديث registration | ⚠ يدوي |
| توليد قرار النقل (مستند) | documents | template + توقيع رقمي | ✅ |
| ربط بـ promotion bonus (لو مطبق) | hr/payroll | one-time `payroll_lines` | ⚠ |
| Audit log إجباري | core | `audit_logs` (entity=`employee_transfer`) | ⚠ تحقق |

تحقق يدوي:
- [ ] هل النقل يطبق فوراً أم في تاريخ effective محدد؟
- [ ] هل overlap بين assignments قديم/جديد ممكن أم محظور؟
- [ ] هل النقل بين شركات يتطلب gratuity settlement من الشركة الأولى؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `transfers` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/transfers`
- لقطة: `audit/screenshots/hr_transfers.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
