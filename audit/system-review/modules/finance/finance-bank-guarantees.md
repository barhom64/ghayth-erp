# /finance/bank-guarantees — `artifacts/ghayth-erp/src/pages/finance/bank-guarantees.tsx`

## 1. الميتاداتا
- المسار: `/finance/bank-guarantees`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/bank-guarantees.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:129`
- المجموعة: `finance`
- الكومبوننت: `BankGuarantees`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `bank-guarantees`
- سطور الملف: 762
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L655: "(بلا تسمية)" 🔒
- L666: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
الضمانات البنكية (Bank Guarantees). للمناقصات، الضمان الابتدائي، النهائي.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إصدار ضمان بنكي | finance | POST `/bank-guarantees` | `bank_guarantees` | ✅ |
| نوع (bid/performance/advance/retention) | finance | `bg.type` | ✅ |
| رسوم البنك | finance/GL | عند الإصدار: DR Bank Guarantee Fees / CR Cash | `gl_entries` | ✅ |
| **هامش الضمان (margin)** | finance/GL | DR Bank Margin (held) / CR Cash | held كـ asset في الميزانية | ✅ |
| ربط بمشروع/مناقصة | operations + crm | `bg.projectId` أو `bg.opportunityId` | ✅ |
| تذكير قبل انتهاء الصلاحية (90/30/7) | comms | cron يفحص `bg.expiringDate` | `notifications` | ✅ |
| تجديد | finance | POST `/bank-guarantees/:id/renew` | يولّد row جديد، يربط بالقديم | ✅ |
| إفراج (release) عند انتهاء المشروع | finance/GL | DR Cash / CR Bank Margin (released) | `gl_entries` | ✅ |
| مصادرة (called/forfeited) | finance/GL | DR Loss / CR Bank Margin | تأثير سلبي على ميزانية المشروع | ⚠ |
| تقرير liabilities المعلّقة (off-BS) | finance/reports | aggregation per type | views | ✅ |
| إشعار للـ Finance Manager | comms | event=`bg_renewed\|expired\|called` | `notifications` | ✅ |
| Audit log | core | إجباري | `audit_logs` | ⚠ تحقق من ENTITY_MAP إن مضاف |

تحقق يدوي:
- [ ] هل ضمان منتهي صلاحية بدون تجديد يطلق مصادرة آلياً أم يحتاج تأكيد؟
- [ ] هل الضمانات مرتبطة بـ off-balance-sheet schedules لتقارير ZATCA/audit؟
- [ ] هل المصادرة (forfeiture) تطلب موافقة CFO قبل القيد؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `bank-guarantees` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/bank-guarantees`
- لقطة: `audit/screenshots/finance_bank_guarantees.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
