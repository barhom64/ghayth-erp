# /umrah/invoices — `artifacts/ghayth-erp/src/pages/umrah/invoices.tsx`

## 1. الميتاداتا
- المسار: `/umrah/invoices`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/invoices.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:58`
- المجموعة: `operations`
- الكومبوننت: `UmrahInvoices`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `invoices`
- سطور الملف: 147
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/umrah/agent-invoices`
- GET `/umrah/agents`
- GET `/umrah/seasons`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
فواتير العمرة. مستقلة عن `finance/invoices` لكنها مرتبطة بـ GL.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء فاتورة باقة | umrah | `umrah.ts` POST `/umrah/invoices` | `umrah_invoices`, `umrah_invoice_lines` | ✅ |
| تكلفة الباقة (السكن + النقل + التأشيرة) | umrah | حساب من `umrah_packages` + assignments | aggregation | ✅ |
| **قيد محاسبي عند إصدار الفاتورة** | finance/GL | DR AR-Umrah / CR Revenue-Umrah | `gl_entries` (يربط بـ `accounting-mappings` لـ umrah) | ⚠ تحقق |
| تكلفة المبيعات (COGS) | finance/GL | DR COGS-Umrah / CR Inventory أو Prepaid-Suppliers | ⚠ |
| دفعات المعتمر | umrah | POST `/umrah/payments` يحدّث `umrah_invoices.paidAmount` | ✅ |
| ربط بـ ZATCA (B2C e-invoice) | finance-zatca | عند الإصدار → simplified tax invoice | `zatca_documents` | ⚠ تحقق |
| رسوم الحجز + التأمين | umrah | `umrah_invoice_lines.type='reservation'\|'insurance'` | ✅ |
| رسوم الإلغاء (cancellation fee) | umrah | عند `pilgrim.status='cancelled'` → سطر خصم | ⚠ |
| إرجاع عند الإلغاء | finance/GL | DR Revenue-Umrah / CR Cash (partial refund) | `gl_entries` | ⚠ |
| ربط بـ الباقات والمواسم | umrah | `umrah_invoices.packageId`, `seasonId` | للتقارير | ✅ |
| عمولة الوكيل | umrah/commission | راجع `umrah-pilgrims.md` | ✅ |
| إشعارات (للمعتمر + المالية) | comms | event=`umrah_invoice_issued\|paid` | `notifications` | ✅ |
| Audit log | core | (umrah ENTITY_MAP الإضافي للمستقبل) | `event_logs` for now | ⚠ |

تحقق يدوي:
- [ ] هل فواتير العمرة تحترم سنوات مالية مختلفة (موسم cross-fiscal)؟
- [ ] هل العملة الأجنبية (للحجاج من خارج السعودية) محسوبة بـ FX حالي أم محجوزة عند الحجز؟
- [ ] هل القيد المحاسبي يولّد تلقائياً أم يحتاج post manual؟

## 4. النمذجة
- الجدول: `invoices` (export: `invoices`, 12 عمود)
- tenant col: ✅ | createdBy: — | createdAt: ✅ | updatedAt: — | softDelete: ✅ | lifecycle col: ✅
- FKs: companies.id, clients.id

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/invoices`
- لقطة: `audit/screenshots/umrah_invoices.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
