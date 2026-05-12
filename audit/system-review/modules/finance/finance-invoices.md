# /finance/invoices — `artifacts/ghayth-erp/src/pages/finance/invoices.tsx`

## 1. الميتاداتا
- المسار: `/finance/invoices`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/finance/invoices.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:90`
- المجموعة: `finance`
- الكومبوننت: `Invoices`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `invoices`
- سطور الملف: 278
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L130: "عرض" → `(e) => { e.stopPropagation(); setPreviewItem(inv);`
- L132: "عرض"
- L134: "(بلا تسمية)"
- L146: "نسخ الفاتورة"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
عند إنشاء/اعتماد فاتورة، يجب أن تتسلسل الحركات التالية. المرجع: `docs/blueprints/finance-invoices.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| قيد محاسبي (مدين/دائن) | finance/GL | `finance-invoices.ts:304` → `accounting-engine.ts` (postInvoice helper) | `gl_entries`, `gl_lines`, `posting_failures` (عند الخطأ) | ✅ موجود (`hasEmitEvent + hasTransaction`) |
| تحديث رصيد العميل | crm/clients | عبر `client_balances_history` | جدول `clients.balance` يعكس الإجمالي | ⚠ التحقق يدوياً |
| إصدار ZATCA Phase 2 (XML + UUID + QR) | finance-zatca | `finance-zatca.ts` (محرّك التوقيع) | `zatca_documents`, `invoice_meta.zatcaUuid` | ✅ موجود لكن غير مطلق تلقائياً عند POST الفاتورة — يتطلب POST لاحق `/invoices/:id/send` |
| إشعار للعميل | comms | `notification-engine.ts` event=`invoice_issued` | `notifications` | ⚠ المسار `POST /finance/invoices` لا يستدعي `sendNotification`؛ يتم عبر `/send` |
| سير الموافقة (إن > حد) | governance/workflows | `workflows.ts` + `approvalActions.ts` | `approval_chains`, `approval_chain_steps` | ✅ يعتمد على threshold في `business_rules` |
| Audit log | core | `auditMiddleware` + `createAuditLog` داخل route | `audit_logs` (entity=`invoices`) | ✅ موجود (`hasAudit=✅`) |

تحقق يدوي مطلوب:
- [ ] هل `accounting-engine.postInvoice` يحترم `costCenter` + `branchId`؟
- [ ] في حالة فشل GL، هل تُكتب `posting_failures` و تُعرض في `/admin/posting-failures`؟
- [ ] هل ZATCA يُرسل تلقائياً للحالة `status=approved` أم يبقى يدوياً عبر زر "إرسال"؟
- [ ] عند الإلغاء/الإرجاع: هل يُولّد قيد عكسي تلقائياً؟ (راجع `journal-reverse`)

## 4. النمذجة
- الجدول: `invoices` (export: `invoices`, 12 عمود)
- tenant col: ✅ | createdBy: — | createdAt: ✅ | updatedAt: — | softDelete: ✅ | lifecycle col: ✅
- FKs: companies.id, clients.id

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/invoices`
- لقطة: `audit/screenshots/finance_invoices.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
