# دليل المساهمة — غيث ERP

> **هذه معايير 3 مستويات: قبل الدفع Push + قبل فتح PR + قبل الدمج Merge.**
> لا يكفي نجاح الأوامر محلياً لقبول الدمج؛ يلزم تحقق الحوكمة والصلاحيات والمالية وعزل الشركات والتوثيق.

> ⚠️ **ملاحظة معمارية**: `scripts/_push2.mjs` هو **حل تشغيلي مؤقت** بسبب قيود بيئة Replit على `git push` المباشر، **وليس workflow معماري دائم**. عند انتقال الفريق لبيئة تطوير عادية، يُستبدل بـ `git push` القياسي مع نفس قواعد Branch Protection أدناه.

---

## 🚦 Git Workflow Policy — ممنوع الدفع المباشر إلى `main`

كل تغيير يجب أن يمر بهذه المراحل:

```
Feature Branch → Pull Request → CI أخضر → Code Review → Merge
```

### Branch Protection Rules (مفعّلة على `main`)

يجب تفعيل هذه القواعد على GitHub:
`Settings → Branches → Branch protection rules → Add rule for main`

- ✅ **Require a pull request before merging** (1+ approval)
- ✅ **Require status checks to pass** (`guard.yml`, `audit-runtime.yml`)
- ✅ **Require branches to be up to date before merging**
- ✅ **Dismiss stale pull request approvals when new commits are pushed**
- ✅ **Do not allow bypassing the above settings** (حتى للأدمن)
- ✅ **Restrict force pushes** (block)
- ✅ **Restrict deletions** (block)

### تسمية الفروع (Branch Naming)

```text
feature/hr-payroll-q3
fix/tenant-isolation-bi-overview
refactor/rbac-v2
docs/zatca-provider-interface
hotfix/dashboard-sql-ambiguous
chore/upgrade-drizzle
```

`<type>` المسموح: `feature`, `fix`, `refactor`, `docs`, `hotfix`, `chore`, `test`, `migration`.

### حدود حجم الـ PR (إرشادية مع استثناء مبرّر)

| نوع PR | الحد الموصى به |
|---|---|
| feature | ≤ 20 ملف |
| refactor | ≤ 30 ملف |
| hotfix | ≤ 10 ملفات |
| migration | منفصل قدر الإمكان (PR مستقل) |

> الأصل أن يكون PR صغيراً ومحدّداً. إذا تجاوز الحد، **لا يُرفض تلقائياً** لكن يلزم:
> 1. توضيح سبب عدم التقسيم في وصف الـ PR.
> 2. فصل التغييرات في commits واضحة منطقياً.
> 3. خطة اختبار موسّعة.
> 4. مراجعة إضافية (2 reviewers بدل 1).
> 5. عدم خلط أكثر من نوع تغيير (UI + DB + Security + Finance) إلا لضرورة موثّقة.

### ممنوع خلطه في نفس الـ PR

| ❌ خلط ممنوع | السبب |
|---|---|
| Security + Performance | يخفي الانحدار الأمني خلف التحسين |
| Migration + UI | الـ rollback يكسر الواجهة |
| Refactor + Business logic | يصعب التمييز بين تغيير سلوك ونقل كود |
| Massive formatting + logic changes | تشويش على الـ diff الحقيقي |

---

## 🟢 المستوى الأول — قبل الدفع (Pre-flight Push)

يُشغّل المطوّر هذه الأوامر بهذا الترتيب، ولا يدفع إلا بعد نجاحها كلها:

```bash
pnpm install                                       # تطابق التبعيات مع pnpm-lock.yaml
pnpm typecheck                                     # 0 TS errors في كل libs + artifacts
pnpm run guard                                     # 6 خطوات حماية (ghost-rows, schema-drift, …)
pnpm --filter @workspace/api-spec run generate     # توليد OpenAPI → Orval hooks + Zod
```

❌ فشل أي خطوة → ممنوع الدفع.

### 1.1 قواعد المسارات (Canonical API Paths)

| ❌ خطأ شائع | ✅ المسار الصحيح |
|---|---|
| `/api/hr/employees` | `/api/hr/employees-status` |
| `/api/hr/leaves` | `/api/hr/leave-requests` |
| `/api/hr/training` | `/api/hr/training/programs` |
| `/api/hr/recruitment` | `/api/hr/recruitment/postings` + `/applications` |
| `/api/fleet/fuel` | `/api/fleet/fuel-logs` |
| `/api/properties` | `/api/properties/units` |
| `/api/support` | `/api/support/tickets` |
| `/api/marketing` | `/api/marketing/campaigns` |

📌 **القاعدة الذهبية**: قبل كتابة أي fetch لمسار جديد:
```bash
grep -E "router\.(get|post|patch|delete)\(['\"]/" artifacts/api-server/src/routes/<module>.ts
```

### 1.2 قواعد قاعدة البيانات (Schema Discipline)

- ❌ لا تستخدم `pool.query()` مباشرة في route handlers — استخدم `rawQuery()` أو Drizzle.
  - **استثناء وحيد**: داخل `lib/db/` أو أدوات منخفضة المستوى فقط.
- ✅ كل SELECT من جدول له `deletedAt` يجب أن يحتوي `WHERE "deletedAt" IS NULL`.
- ✅ في JOIN، أهّل كل عمود قد يكون مكرراً (`rp.status` لا `status`).
- ✅ تحقق من وجود العمود قبل إضافة فلتر:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='<table>' AND column_name='deletedAt';
```

### 1.3 محظورات الكود

| ممنوع | البديل |
|---|---|
| `console.log` في كود الخادم | `req.log` أو `logger` |
| `<DataTable<any>>` بـ generics | `(DataTable as any)` مع TODO + تبرير مكتوب — وأي `any` جديد يحتاج تبرير |
| popups/modals لـ Create/Edit | صفحة كاملة عبر `<Link>` + `FormShell` |
| `useState` لإدارة form إذا يوجد `FormShell` | `FormShell` + Zod schema |
| `pnpm dev` من جذر المشروع | workflows فقط |
| `pnpm add --no-frozen-lockfile` | `pnpm add` العادي مع `catalog:` |
| `if (req.path.includes("/pay")) return` (stale guards) | احذفه — يسبّب hangs لا نهائية |
| Secrets في الكود | Replit Secrets فقط |

### 1.4 آلية الدفع (مختلفة عن git العادي)

⚠️ `git push` معطّل في بيئة Replit. الدفع عبر:

```bash
node scripts/_push2.mjs                  # تراكمي قابل للاستئناف
node scripts/_push_dashboard_fix.mjs     # قالب one-shot لتغيير صغير
```

🚫 ملفات `.github/workflows/*.yml` لا تُدفع بأي سكربت — تُعدَّل مباشرة على GitHub web.

---

## 🟡 المستوى الثاني — قبل فتح Pull Request (PR Hygiene)

### 2.1 ممنوع PR كبير مختلط

كل PR له **هدف واحد واضح**. ممنوع خلط:
- Performance
- Security
- Migration
- Refactor
- UI

في PR واحد. قسّمها إلى عدة PRs.

### 2.2 صيغة الـ Commit

```
<type>(<scope>): <عنوان تقني مختصر بالإنجليزية ≤ 60 حرف>

<شرح تفصيلي بالعربية أو الإنجليزية>
- ماذا تغيّر ولماذا
- روابط المهام (Task #186, closes #190)
- ملاحظات اختبار (smoke 60/60 PASS)
```

أمثلة معتمدة:
- `fix(hr): correct leave-request status transition`
- `feat(umrah): add nusk invoice reconciliation`
- `docs(zatca): define provider interface`
- `refactor(dashboards): qualify ambiguous columns in joins`

`<type>` المسموح: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `perf`, `ci`.

### 2.3 قالب وصف الـ PR (إجباري)

```markdown
## 🎯 الهدف
(جملة واحدة — هدف واحد فقط)

## 📝 ما الذي تغيّر؟
- ملف: `path/to/file.ts` — السبب
- ملف: `path/to/other.ts` — السبب

## ✅ نتائج الاختبار المحلّي
- [ ] `pnpm typecheck` = 0 errors
- [ ] `pnpm run guard` = PASS (6/6)
- [ ] Smoke = 60/60 PASS
- [ ] Tenant isolation test (إن لمست API/SQL)
- [ ] GL test + idempotency (إن لمست المالية)
- [ ] Screenshots قبل/بعد (إن لمست UI)
- [ ] Migration notes (إن لمست DB schema)

## 🔗 روابط
Task #XXX, closes #YYY
```

---

## 🔴 المستوى الثالث — قبل الدمج (Merge Acceptance — حوكمة غيث)

### 3.1 شرط عزل الشركات (Tenant Isolation)

أي تعديل في API أو SQL لازم يُثبت:
- ✅ `companyId` موجود في كل query.
- ✅ لا cross-tenant leak — اختبار يُجرّب user من شركة A على بيانات شركة B ويتأكد من 403/404.
- ✅ tenant isolation tests ناجحة.

### 3.2 شرط الأثر المالي (Financial Impact)

أي تعديل يلمس:
- الفواتير / القيود / العمرة المالية / الرواتب / المصروفات / المدفوعات

لا يُقبل إلا مع:
- ✅ **GL test** — قيد محاسبي متوازن (debit = credit).
- ✅ **Idempotency** — إعادة تشغيل العملية لا تنتج قيوداً مكرّرة.
- ✅ **منع الترحيل على فترة مغلقة** (closed period guard).
- ✅ **audit/event** — كل عملية مالية تُسجّل في `audit_log`.

### 3.3 شرط الصلاحيات (Authorization)

أي route جديد أو معدّل لازم يحتوي:
- ✅ middleware `auth` (مصادقة).
- ✅ `requirePermission(...)` أو `authorize({ feature, action })`.
- ✅ `scope` واضح (companyId/branchId).
- ✅ **field masking** للبيانات الحساسة (رواتب، أرقام بطاقات، بيانات شخصية).
- ✅ الحقول المشفّرة تستخدم `lib/fieldEncryption.ts`.

### 3.4 شرط الواجهة (UI Standards)

أي شاشة أو form جديد:
- ✅ لا يستخدم `useState` لإدارة form إن وُجد `FormShell` — يستخدم `FormShell + Zod`.
- ✅ لا modal للإنشاء/التعديل — صفحة كاملة (`QuickPreviewDialog` للقراءة فقط، `AlertDialog` للتأكيد).
- ✅ يلتزم RTL (`dir="rtl"` و `lang="ar"`).
- ✅ يستخدم الجداول الموحّدة (`DataTable` المشترك).
- ✅ تواريخ بـ `formatDateAr()`، أرقام بـ `formatNumber()`، عملات بـ `formatCurrency()`.
- ✅ لا تظهر رسائل إنجليزية للمستخدم النهائي.
- ✅ Empty / Error states بالعربية مع icons + retry button.

### 3.5 شرط التوثيق (Docs Sync)

أي تغيير في:
- مسار / API / قاعدة بيانات / صلاحية / منطق مالي / تكامل خارجي

يحدّث **في نفس الـ PR**:
- `replit.md` (Gotchas + API canonicals).
- `lib/api-spec/openapi.yaml` ثم `pnpm --filter @workspace/api-spec run generate`.
- `SERVICES_INDEX.md` لو أُضيف/حُذف endpoint.
- `GHAITH_FULL_SYSTEM_VERIFICATION_REPORT.md` لو لمست architecture.

### 3.6 شرط الدمج النهائي (Merge Gate)

✅ **لا يُدمج PR إلا إذا**:
- [ ] CI أخضر (كل GitHub Actions PASS — `guard.yml`, `audit-runtime.yml`).
- [ ] Code review من شخص آخر (≥1 approval).
- [ ] لا توجد unresolved comments.
- [ ] لا توجد skipped tests غير مبررة (لو مهَملة → يُكتب السبب في PR).
- [ ] حجم PR معقول (< 500 سطر تغيير، أو مبرّر إن أكبر).
- [ ] Screenshots مرفقة لو UI.
- [ ] Migration notes مرفقة لو DB schema.
- [ ] لا تعارض مع `main` (rebase نظيف).

---

## ✅ Definition of Done — متى تُعتبر المهمة منتهية؟

المهمة **لا تُعتبر مكتملة** إلا إذا حقّقت **كل** النقاط التالية:

### تقنياً
- [ ] `pnpm typecheck` أخضر (0 errors).
- [ ] `pnpm run guard` أخضر (6/6 خطوات).
- [ ] لا `console.log` في كود الخادم — استُعمل `req.log`/`logger`.
- [ ] لا `any` جديد بدون TODO + تبرير مكتوب.
- [ ] لا hardcoded permissions — كل الصلاحيات عبر `requirePermission` / `authorize`.
- [ ] لا schema drift (`pnpm run check:schema-drift` أخضر).
- [ ] لا ghost rows (`pnpm run check:ghost-rows` أخضر).

### حوكمياً (Governance)
- [ ] **Tenant isolation pass** — اختبار يثبت أن user من شركة A لا يصل لبيانات شركة B.
- [ ] **RBAC pass** — كل route فيه auth + authorize + scope.
- [ ] **Field masking** للبيانات الحساسة (رواتب، أرقام بطاقات، بيانات شخصية مشفّرة).

### مالياً (إن لمس المالية)
- [ ] **GL test** — قيد محاسبي متوازن (debit = credit).
- [ ] **Idempotency** — إعادة العملية لا تنتج قيوداً مكرّرة.
- [ ] **Closed period guard** — لا ترحيل على فترة مغلقة.
- [ ] **Audit log** — كل عملية مالية مسجّلة في `audit_log`.

### واجهةً (إن لمس UI)
- [ ] **Screenshots قبل/بعد** مرفقة في PR.
- [ ] `FormShell + Zod` (لا `useState` يدوي للـ forms).
- [ ] لا modals للإنشاء/التعديل — صفحة كاملة عبر `<Link>`.
- [ ] RTL + عربية (`formatDateAr`, `formatNumber`, `formatCurrency`).
- [ ] Empty/Error states بالعربية مع icons + retry button.

### قاعدة بيانات (إن لمس Schema)
- [ ] **Migration notes** مرفقة في PR.
- [ ] Migration قابل للـ rollback (down migration موجود).
- [ ] لا `CREATE INDEX CONCURRENTLY` داخل transaction.

### اختبارياً
- [ ] **Smoke test PASS** (`bash scripts/health-check.sh` = 60/60 OK).
- [ ] لا skipped tests بدون تبرير في PR.

### توثيقياً
- [ ] `replit.md` محدّث لو تغيّرت Gotchas أو API canonicals.
- [ ] OpenAPI spec محدّث + `pnpm --filter @workspace/api-spec run generate` نُفّذ.
- [ ] `SERVICES_INDEX.md` محدّث لو أُضيف/حُذف endpoint.

### مراجعةً
- [ ] **PR reviewed** بـ ≥1 approval (أو 2 لو تجاوز حدود الحجم).
- [ ] لا unresolved comments.
- [ ] CI أخضر بالكامل.

---

## 🔐 المصادقة (للـ curl/scripts)

النظام يستخدم **HttpOnly Cookies** (لا Bearer tokens):

```bash
curl -c jar.txt -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ghayth.com","password":"Admin@123456"}'

curl -b jar.txt http://localhost/api/hr/employees-status
```

---

## 📤 ملخّص للمطوّر الجديد (TL;DR)

1. **قبل الدفع**: `pnpm install && pnpm typecheck && pnpm run guard` — كلها PASS.
2. **لا تخمّن مسارات API** — `grep` في `routes/` قبل أي fetch.
3. كل SELECT يحترم `deletedAt`، وكل JOIN مؤهَّل.
4. ادفع بـ `node scripts/_push2.mjs` فقط.
5. **PR واحد = هدف واحد** — لا تخلط security مع refactor مع UI.
6. لو لمست المالية → GL test + idempotency + audit log.
7. لو لمست API → tenant isolation test.
8. لو لمست UI → FormShell + RTL + screenshots.
9. حدّث `replit.md` و OpenAPI spec في نفس الـ PR.
10. `.github/workflows/*` تُعدَّل على GitHub web فقط.
