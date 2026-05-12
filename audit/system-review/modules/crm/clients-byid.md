# /clients/:id — `artifacts/ghayth-erp/src/pages/client-detail.tsx`

## 1. الميتاداتا
- المسار: `/clients/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/client-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:82`
- المجموعة: `crm`
- الكومبوننت: `ClientDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 947
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L718: "(بلا تسمية)" → `() => setShowCreate(false)`

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
ملف العميل الكامل — يلامس الفواتير، الـ AR، المخاطر، التقييم.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء/تعديل عميل | crm | `clients.ts` POST/PATCH `/clients/:id` | `clients` | ✅ |
| ملف ZATCA buyer info | finance-zatca | `clients.taxId`, `vatNumber`, `address` | يستخدم في كل فاتورة | ✅ |
| رصيد العميل | finance | aggregation من `invoices` و `voucher_allocations` | view | ✅ |
| AR Aging per client | finance/ar-aging | aggregate من invoices.dueDate | view | ✅ |
| حد الائتمان (credit limit) | crm | `clients.creditLimit`, `creditHold` | يمنع أوامر بيع جديدة عند التجاوز | ⚠ تحقق |
| نقاط الولاء/التقييم | crm | `clients.rating` يتحدّث من سلوك الدفع | ⚠ |
| العقود (lease/service) | properties + legal | `property_contracts.tenantId`/`legal_contracts.partyId` | ✅ |
| التذاكر (support) | support | `support_tickets.clientId` | ✅ |
| الأنشطة (calls/meetings) | crm | `crm_activities.clientId` | ✅ |
| الفرص (opportunities) | crm | `crm_opportunities.clientId` | ✅ |
| المراسلات الرسمية | communications | `correspondence.entityId=clientId, entityType='client'` | ✅ |
| الوثائق | documents | `documents.entityType='client'` | ✅ |
| إشعارات إدارة الحساب | comms | event=`client_created\|credit_warning\|inactive` | `notifications` | ⚠ |
| تكامل WhatsApp/SMS | gov-integrations | اختياري | ⚠ |
| Audit log | core | `auditMiddleware` (`/clients`) | `audit_logs` (entity=`client`) | ✅ |

تحقق يدوي:
- [ ] هل دمج عميلين مكرّرين (deduplication) يحفظ تاريخ كلاهما؟
- [ ] هل تجميد العميل (credit hold) يطلق إشعار لمندوب المبيعات + finance؟
- [ ] هل اعتبار "عميل غير نشط" بعد X شهر بدون فواتير يطلق email تذكير؟
- [ ] هل PDPL: بيانات العميل المحذوف تُحفظ في anonymized form بعد فترة retention؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=SKIP
- ملاحظة: `landed=/dashboard expected=/clients/3`
- لقطة: `audit/screenshots/clients_id.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
