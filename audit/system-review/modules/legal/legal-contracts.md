# /legal/contracts — `artifacts/ghayth-erp/src/pages/legal.tsx`

## 1. الميتاداتا
- المسار: `/legal/contracts`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/legal.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:17`
- المجموعة: `legal`
- الكومبوننت: `Legal`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `contracts`
- سطور الملف: 397
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L105: "نسخ العقد"

### القراءات (GET)
- GET `/legal/stats`
- GET `/legal/stats`
- GET `/legal/cases`
- GET `/legal/financial-report`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
عقود قانونية (B2B/شراكات/خدمات/توريد) — مستقلة عن عقود الإيجار.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء عقد | legal | `legal.ts` POST `/contracts` | `legal_contracts` | ✅ |
| ربط بطرف (عميل/مورد/شركة) | crm + finance | `contract.partyType + partyId` polymorphic | ✅ |
| توليد من قالب | documents | راجع `documents-templates.md` | ✅ |
| سير موافقة (CEO/CFO/Legal) | governance/workflows | `business_rules.legal_contract_approval` | `approval_chains` | ✅ |
| توقيع رقمي | digital-signature | `digital_signatures.contractId` | ✅ |
| ربط بفواتير المشروع | finance/invoices | `invoices.contractId` | ⚠ تحقق |
| تذكير بـ تجديد (renewal) | comms | cron يفحص `contracts.endDate` (90/30/7 يوم قبل) | `notifications` | ✅ |
| فسخ مبكر (early termination) | legal | POST `/contracts/:id/terminate` مع reason + penalty | `contract_amendments` | ⚠ |
| تأثير مالي للفسخ | finance/GL | penalty → AR; refund → AP | `gl_entries` | ⚠ يدوي |
| ربط بالقضايا (إن نزاع) | legal/cases | `legal_cases.contractId` | ✅ |
| تخزين في الأرشيف (post-expiry) | documents | بعد X سنة → cold storage | ⚠ |
| Audit log | core | `auditMiddleware` (`/legal` لو مضاف) | `audit_logs` | ⚠ تحقق |

تحقق يدوي:
- [ ] هل تجديد العقد يحفظ كل الـ history (طبقات الإصدار)؟
- [ ] هل تعديل عقد موقّع رقمياً يتطلب توقيع جديد من كل الأطراف؟
- [ ] هل العقود المتجاوزة تاريخها بدون تجديد تُحوّل إلى "expired" + تنشئ tickets؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `contracts` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/legal/contracts`
- لقطة: `audit/screenshots/legal_contracts.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
