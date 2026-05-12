# /umrah/pilgrims — `artifacts/ghayth-erp/src/pages/umrah/pilgrims.tsx`

## 1. الميتاداتا
- المسار: `/umrah/pilgrims`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/pilgrims.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:49`
- المجموعة: `operations`
- الكومبوننت: `UmrahPilgrims`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `pilgrims`
- سطور الملف: 146
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
إدارة المعتمرين (Pilgrims). المرجع: `docs/blueprints/umrah.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| تسجيل معتمر + ربط بباقة + موسم | umrah | `umrah.ts` POST `/pilgrims` | `umrah_pilgrims`, `umrah_packages`, `umrah_seasons` | ✅ |
| تخصيص عميل (agent/sub-agent) | umrah | `umrah_pilgrims.agentId` → `umrah_agents` | عمولة محسوبة لاحقاً | ✅ |
| فاتورة الباقة | umrah/invoices | `umrah_invoices` (مستقل عن finance/invoices) | `umrah_invoices`, `umrah_invoice_lines` | ✅ موجود |
| قيد محاسبي | finance/GL | DR AR-umrah / CR Revenue-umrah + cost layers | `gl_entries`, `gl_lines` | ⚠ تحقق من ربط `accounting-mappings` |
| تخصيص نقل + سكن | umrah | `umrah_transport_assignments`, `umrah_accommodation` | تكاليف تظهر في tco | ✅ |
| دفعات المعتمر | umrah | `umrah_payments` (مستقل) | يحدّث `umrah_invoices.paidAmount` | ✅ |
| عمولة الوكيل | umrah | `commission_plans` × payments → `umrah_commissions` | يخصم من Revenue ويُدخل في Liability | ✅ |
| رسوم تأخير/مخالفة | umrah | `umrah_penalties` | يضاف للفاتورة كسطر | ✅ |
| تأشيرة + جواز سفر تتبع | umrah | حقول في `umrah_pilgrims` (visa_status, passport_expiry) | cron alerts قبل الانتهاء | ✅ |
| تكامل تصاريح حكومية | gov-integrations | `lib/saudi-compliance` (إن مفعّل) | `gov_submissions` | ⚠ اختياري |
| إشعار للمعتمر | comms | event=`pilgrim_assigned` | `notifications` (actionUrl للبوابة) | ⚠ يعتمد |
| Audit log | core | `auditMiddleware` لو مضاف لـ ENTITY_MAP / `emitEvent` يدوي | `audit_logs` / `event_logs` | ⚠ تحقق |

تحقق يدوي:
- [ ] هل تغيير الباقة بعد الدفعة الأولى يولّد قيد فروقات؟
- [ ] هل تذكرة الطيران (إن مدمجة) تدخل تكلفتها في GL أم منفصلة؟
- [ ] هل المعتمر الذي ألغى الرحلة يحصل على إرجاع كامل/جزئي حسب القاعدة؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `pilgrims` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/pilgrims`
- لقطة: `audit/screenshots/umrah_pilgrims.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
