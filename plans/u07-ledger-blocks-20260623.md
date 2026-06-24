# خطة تقطيع الكتل الدفترية المتبقية — `umrah-entities.ts`

**التاريخ:** 2026-06-23
**السلسلة:** U-07 (المراحل 19+)
**الحالة الحالية:** `umrah-entities.ts` = 1301 سطر (كان 5443 — تقلّص 76% عبر المراحل 11→18 بعد دمج #2926).
**المُحرِّك:** الجلسة الرئيسية (مدير التقطيع).

---

## المبدأ الحاكم (مكتشَف من المسح + مؤكَّد بالدستور)

> **منطق القيد (GL) لا يعيش في المسارات — يعيش في المحرّكات.**
> الدستور سطر 1294: «GL + account-mapping helpers must stay inside engines, not routes».

كل المسارات الدفترية المتبقية **رفيعة (thin)** — تستدعي محرّكًا فقط:
| الكتلة | المحرّك المالك | الملف |
|--------|----------------|-------|
| nusk-invoices | `postNuskJournalEntries` | `umrahImportEngine.js` |
| invoices/generate | `generateSalesInvoice` | (sales engine) |
| payments | `registerPayment` | (payment engine) |
| reclassify-revenue | `reclassifyRevenueForInvoices` | `umrahReclassifyEngine.js` |

**النتيجة المعمارية:** كل تقطيع = **نقل حرفي للمسارات**؛ المحرّكات **لا تُمَس**. التصنيف «دفتري» سببه أن المسارات **تستدعي** الترحيل، فيلزم:
1. **assertion tests** تثبّت أن عقد استدعاء المحرّك مطابق بايتيًا (نفس الوسائط، نفس الترتيب، داخل `withTransaction`).
2. **diff يثبت** أن ملفات المحرّكات صفر تغيير.
3. **مراجعة بدرجة الدفتر** (مجلس) + **اعتماد إبراهيم الإنساني** لكل دفعة.

---

## الكتل المتبقية (الجرد الكامل)

### Block A — nusk-invoices (أسطر 856–1075، ~220 سطر) — **دفتري**
5 مسارات: `GET /nusk-invoices`, `GET /:id` (قراءة)، `POST` + `PATCH` (يستدعيان `postNuskJournalEntries` داخل `withTransaction`)، `DELETE`.
- **الهدف:** `umrah-nusk-invoices.ts` جديد.
- **IGOC:** تحويل `createAuditLog` → `auditFromRequest`.
- **assertion tests:** عقد `postNuskJournalEntries(client, ctx{companyId,branchId,userId,seasonId}, {nuskId,...})` مطابق في POST+PATCH، داخل withTransaction، idempotency + audit محفوظة، صفر تغيير في `umrahImportEngine.ts`.

### Block B — payments (أسطر 1200–1286، ~87 سطر) — **دفتري**
`GET /payments` (قراءة)، `POST /payments` (يستدعي `registerPayment`).
- **الهدف:** `umrah-payments.ts` جديد.
- **IGOC:** تحويل `createAuditLog` → `auditFromRequest`.
- **assertion tests:** عقد `registerPayment` مطابق، audit/event محفوظة، صفر تغيير في محرّك الدفع.

### Block C — reclassify-revenue (أسطر 1287–1300، ~14 سطر) — **دفتري (رفيع جدًا)**
مسار واحد `POST /reclassify-revenue` يستدعي `reclassifyRevenueForInvoices(scope, body)`.
- **الهدف:** يُدمج مع Block B (payments) في نفس الملف أو ملف `umrah-revenue.ts` — صغير جدًا لمرحلة مستقلة.
- **assertion tests:** عقد `reclassifyRevenueForInvoices` مطابق، صفر تغيير في `umrahReclassifyEngine.ts`.

### Block D — invoices (أسطر 1095–1198، ~104 سطر) — **دفتري** (+ employees/assignments قراءة)
`GET /invoices` (قراءة)، `POST /invoices/generate` (يستدعي `generateSalesInvoice`)، `GET /sales-wizard/uninvoiced-groups` (قراءة)، `PATCH /invoices/:id` (UPDATE حقول الفاتورة + emitEvent — **ليس ترحيل GL**).
ملاحظة: `GET /employees/:employeeId/assignments` (1076–1094، قراءة محضة) مجاور — يُطوى هنا أو في كتلة المجموعات.
- **الهدف:** `umrah-sales-invoices.ts` جديد.
- **IGOC:** تحويل `createAuditLog` → `auditFromRequest` (في generate).
- **assertion tests:** عقد `generateSalesInvoice` مطابق، حدثا `umrah.invoice.generated` + `umrah.sales_invoice.created` محفوظان، صفر تغيير في محرّك المبيعات.

### Block E — groups (أسطر 165–855، ~690 سطر) — **تشغيلي (لا GL مباشر)**
المسار **القائد**. 10 مسارات: list/get/create/patch/delete + transport-requests (post/get) + cost-breakdown (قراءة محسوبة) + split + merge.
- split/merge يستخدمان `withTransaction` لكن **بلا ترحيل GL** — `emitEvent` فقط (نقل حجاج/مجموعات ذرّي).
- **الأكبر والأعقد** — يُقسَّم إلى **دفعتين فرعيتين**:
  - E1: read + CRUD (list/get/create/patch/delete).
  - E2: transport-requests + cost-breakdown + split + merge.
- **الهدف:** `umrah-groups.ts` جديد (الدفعتان في نفس الملف، تقطيعان متتاليان).
- **assertion tests:** ذرّية split/merge (withTransaction محفوظ)، أحداثها محفوظة. لا عقد GL (تشغيلي) — لكن يبقى مراجعة مجلس.

---

## الترتيب المقترح (دفعة دفعة — لكل واحدة PR + assertion tests + حكم مجلس + اعتماد إبراهيم)

| المرحلة | الكتلة | السطور | النوع | الاعتماد |
|---------|--------|--------|-------|----------|
| **19** | A: nusk-invoices | ~220 | دفتري | إبراهيم نعم/لا + assertion tests |
| **20** | B+C: payments + reclassify | ~101 | دفتري | إبراهيم نعم/لا + assertion tests |
| **21** | D: sales-invoices (+ assignments) | ~104 | دفتري | إبراهيم نعم/لا + assertion tests |
| **22** | E1: groups read+CRUD | ~340 | تشغيلي | مجلس (تأكيد عام) |
| **23** | E2: groups transport/cost/split/merge | ~350 | تشغيلي | مجلس (تأكيد عام) |

**الناتج النهائي المتوقع:** `umrah-entities.ts` يصبح **قشرة تركيب رفيعة** (~150–170 سطر: استيرادات + ZOD schemas مشتركة + `router.use(...)` للملفات الفرعية).

---

## قواعد التنفيذ (صارمة — من الدستور)

- ⛔ لا تطبّق دفعة دفترية بلا **assertion tests ناجحة** على عقد المحرّك + **حكم مجلس «يُعتمد»** + **اعتماد إبراهيم الإنساني**.
- ⛔ صفر تغيير في أي ملف محرّك (engine) — يُثبَت بالـdiff.
- ⛔ دفعة واحدة لكل PR. لا تجميع.
- ✅ كل تقطيع: نقل حرفي، API surface مطابق، sub-router عبر `router.use(...)`.
- ✅ IGOC ratchet: كل `createAuditLog` منقول → `auditFromRequest`.
- ✅ scopeHelperAdoption: +1 لكل ملف جديد (lockstep snapshot).
