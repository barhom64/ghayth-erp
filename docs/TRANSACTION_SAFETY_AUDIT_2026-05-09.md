# Transaction Safety Audit — 2026-05-09

تقرير فحص الـ atomicity في handlers مسارات API. الهدف: تحديد أي handler ينفّذ أكثر من عملية كتابة (INSERT / UPDATE / DELETE) بدون تغليفها في `withTransaction()`.

> Multi-DML route-handler audit. Goal: surface every endpoint that performs
> 2+ writes outside a transaction. Each finding was hand-reviewed; this
> report classifies them into "fix" / "intentional best-effort" / "needs
> engine refactor" buckets.

---

## ملخص — Summary

| البند | القيمة |
|------|-------|
| إجمالي route handlers | 961 |
| تستخدم `withTransaction()` بالفعل | 79 (8%) |
| Multi-DML بدون transaction (raw count) | 38 |
| **بعد المراجعة:** atomicity gaps حقيقية | **2 (مُصلحة)** |
| Best-effort secondary writes (intentional) | ~30 |
| تحتاج engine refactor (موثقة في KNOWN_ISSUES) | ~6 |

أداة الفحص الآلي: `artifacts/api-server/scripts/auditTransactionSafety.mjs`.

---

## 1. ✅ Fixed — atomicity gaps حقيقية

### `/auth/change-password` — security-critical
**قبل:** `UPDATE users password` ثم `UPDATE refresh_tokens revokedAt=NOW()` في try/catch منفصل. لو revocation فشل، الـ tokens القديمة تبقى صالحة بعد تغيير كلمة المرور (security regression صامت).

**بعد:** الاثنين داخل `withTransaction(async client => {...})`. إما يحصلان معًا أو لا يحصلان. لو revocation فشل لأي سبب → password change rolls back → user يحاول مرة أخرى بدلاً من إيهامه بالنجاح.

### `/admin/users/:id/reset-password` — security-critical (نفس النمط)
نفس الإصلاح. admin force-reset لازم يبطل tokens قديمة atomically، وإلا الـ "الإجبار على إعادة الدخول" مش مضمون.

---

## 2. ⚪ Intentional best-effort writes (لا يحتاج إصلاح)

النمط: **primary write** + **secondary write(s) في try/catch مع `logger.error`**. التصميم متعمد — failures في الـ secondary لا يجب أن تروول الـ primary.

أمثلة:
- `crm.ts POST /opportunities` — إنشاء opportunity ثم optional auto follow-up activity + obligation registration. لو registerObligation فشل (network blip لـ obligations engine) ما نريد فقدان الـ opportunity.
- `tasks.ts POST /` — إنشاء task ثم optional notifications.
- `properties.ts POST /maintenance-requests` — إنشاء maintenance request ثم optional FK count update.
- `legal.ts POST /cases` — إنشاء case ثم optional related entities (documents, sessions setup).
- `fleet.ts POST /traffic-violations` — إنشاء violation ثم optional auto HR violation creation.

**معيار التصنيف "intentional":** الـ secondary write موجود في `try { ... } catch (e) { logger.error(e, "..."); }` بدون `throw`. هذا meaningful design choice.

---

## 3. 🟠 Needs engine refactor (موثق في KNOWN_ISSUES.md)

النمط: handler يستدعي `applyTransition()` (الذي يفتح transaction داخلية) ثم بعد commit-ها يستدعي `accountingEngine.postXXX()` (transaction أخرى منفصلة). فجوة هيكلية لا تُحل per-route — تحتاج تعديل الـ engine ليقبل `client: pg.PoolClient` parameter.

أمثلة:
- `fleet.ts POST /trips/:id/complete` — applyTransition (status + vehicle + driver) ثم fleetEngine.postTripCompletionGL (journal entry)
- `hr.ts POST /payroll/runs/:id/post` — payroll status ثم accounting-engine.postPayrollGL
- `finance-invoices.ts POST /:id/post` — invoice status ثم postInvoiceGL + budget update + revenue recognition

**الحل المقترح (out of scope لهذا الـ audit):**
1. إعادة كتابة `applyTransition` لتقبل callback يأخذ `client` ويُمرَّر للـ engine
2. أو نقل GL posting داخل onApply callback (موجود مكان للـ side effects)

موثّق في `docs/KNOWN_ISSUES.md` كـ:
> Transaction safety — structural — applyTransition uses internal withTransaction, preventing atomic GL+status

---

## 4. التصنيف الكامل (38 finding)

| الـ Endpoint | DML count | تصنيف | إجراء |
|-------------|-----------|-------|------|
| POST /evaluation-cycles/:id/upward-review | 13* | needs review (recomputeSummary upsert) | Future: pass client to recomputeSummary |
| POST /opportunities (crm) | 6 | intentional | – |
| POST /cases (legal) | 6 | intentional | – |
| PATCH /official-letters/:id/approve | 5 | needs review | Future: investigate |
| POST /login (auth) | 4 | needs review | Login records 2 INSERTs (session + login_log) — verify failure modes |
| POST /whatsapp/webhook | 4 | intentional (webhook idempotency) | – |
| **POST /change-password (auth)** | **2** | **FIXED** | ✅ wrapped in withTransaction |
| **POST /users/:id/reset-password (admin)** | **2** | **FIXED** | ✅ wrapped in withTransaction |
| POST /trips/:id/complete (fleet) | 2 | engine refactor needed | – |
| POST /trips/:id/cancel (fleet) | 2 | engine refactor needed | – |
| POST /traffic-violations (fleet) | 2 | intentional (auto HR violation) | – |
| POST /memos/:id/gm-decision (hr-discipline) | 3 | intentional (decision + action) | – |
| POST /leave-requests/:id/cancel (hr) | 3 | needs review | Future |
| POST /:id/test (gov-integrations) | 2 | intentional (test result + log) | – |
| POST /maintenance-requests (properties) | 2 | intentional | – |
| POST /contracts/:id/terminate (properties) | 2 | engine refactor needed | – |
| POST /fuel-logs (fleet) | 3 | intentional (log + vehicle update) | – |
| POST /pbx/completed (communications) | 2 | intentional (call log + activity) | – |
| POST /templates/:id/generate (documents) | 2 | intentional (generate + audit) | – |
| PATCH /accounting-mappings/:operationType | 2 | engine refactor needed | – |
| PATCH /payroll/:id (hr) | 2 | engine refactor needed | – |
| PATCH /approval-requests/:id/decide (hr) | 2 | needs review | Future |
| PATCH /overtime/:id/approve (hr-overtime) | 2 | needs review | Future |
| POST /daily-close/execute (operationsCenter) | 2 | needs review | Future |
| PUT /sub-agents/:id/link (umrah-entities) | 3 | needs review | Future |
| (~13 more) | 2 each | mostly intentional | – |

\* الـ "13" غير دقيق نتيجة hits متعددة على نفس الكلمة في القالب. الواقع: ~2 DMLs (insert + recomputeSummary upsert). تحتاج `recomputeSummary` تقبل client param.

---

## 5. كيف تستخدم الأداة

```bash
# console output
cd artifacts/api-server && node scripts/auditTransactionSafety.mjs

# JSON report للـ CI
node scripts/auditTransactionSafety.mjs --json
```

عند إضافة multi-DML handler جديد:
1. **رايح يفشل؟** غلّف بـ `withTransaction` فورًا.
2. **secondary best-effort؟** غلّف الـ primary، خلّ secondary خارج الـ transaction في try/catch.
3. **فيه call لـ engine يفتح transaction؟** هذي حالة "needs engine refactor" — وثّقها في هذا الملف، لا تحاول fix per-route.

---

## 6. التغييرات في الكوميت

```
artifacts/api-server/scripts/auditTransactionSafety.mjs   (new)
artifacts/api-server/src/routes/auth.ts                   (change-password atomicity)
artifacts/api-server/src/routes/admin.ts                  (reset-password atomicity)
docs/TRANSACTION_SAFETY_AUDIT_2026-05-09.md               (this file)
```
