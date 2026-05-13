# تقرير تدقيق شامل — توحيد المكتبات والأخطاء (Ghayth ERP)

**التاريخ:** 13 مايو 2026
**الفرع:** `claude/audit-libraries-errors-5siZN`
**النطاق:** كامل المستودع (api-server + ghayth-erp + lib/* + scripts + e2e + ai-guardian)

---

## ملاحظة افتتاحية مهمة

أُسس هذا التقرير على **خطة سابقة افتراضت** أن المستودع يحوي 5 تطبيقات frontend (ghayth-erp, client-portal, careers-portal, ghayth-erp-deck, mockup-sandbox) و~1066 خطأ مفتوحًا و12 مخاطرة P1.

عند التحقق الفعلي على `main` (commit `2498cba3`) في تاريخ هذا التقرير، تبيّن أن:

- لا يوجد سوى **تطبيقَين فعليَّين**: `artifacts/api-server` (الخادم) و`artifacts/ghayth-erp` (الواجهة). الأربعة الأخرى مجلدات `node_modules` فقط بدون كود مصدري ولا `package.json` (ربما حذفت في عملية تنظيف سابقة).
- معظم بنود P1 المذكورة في الخطة **مُصلَحة بالفعل** أو لم تكن دقيقة.
- 5 من 5 من فحوصات الـ guard تمر نظيفة (`typecheck`, `lint:patterns`, `audit:routes`, `audit:schema`, `audit:domain-routes`).

لذلك ينقسم هذا التقرير إلى:

1. **القسم الأول**: ما تم التحقق من سلامته (لا تكرر العمل).
2. **القسم الثاني**: الفجوات الحقيقية المتبقية (~6 بنود فقط).
3. **القسم الثالث**: الإصلاحات المطبَّقة في هذا الـ PR.
4. **القسم الرابع**: مقارنة مع الأنظمة العالمية (محدّثة).
5. **القسم الخامس**: خارطة طريق للسبرنتات القادمة.

---

## القسم الأول — ما تم التحقق من سلامته ✅

| الفحص | الأمر | الناتج |
|------|------|--------|
| TypeScript (3 مشاريع) | `pnpm typecheck` | **Done** على api-server + ghayth-erp + scripts |
| Lint patterns (legacy code) | `pnpm lint:patterns` | **clean** — no forbidden legacy patterns |
| Routes inventory | `pnpm audit:routes` | **OK** — 419 page files, all imported |
| Schema drift (raw SQL ↔ schema) | `pnpm audit:schema` | **OK** — scanned 248 files · schema has 1484 columns / 318 tables · 0 unknown identifiers |
| RBAC permission catalog | `lintPermissions.mjs` | catalog فعّال + ‎186 permission‎ مسجَّل |
| SQL safe interpolation | `lintSql.mjs` | **2726 SQL calls scanned, 0 offenders** |

### 1.1 انضباط الكتالوج (Catalog discipline) — مكتمل ✅

`pnpm-workspace.yaml` يحوي **34 إدخالًا** في الكتالوج، بما فيها كل المكتبات التي وصفتها الخطة كـ"خارج الكتالوج":

```yaml
catalog:
  '@hookform/resolvers': ^3.10.0   # ✅
  '@tailwindcss/typography': ^0.5.15  # ✅
  cmdk: ^1.1.1                     # ✅
  'embla-carousel-react': ^8.6.0   # ✅
  'input-otp': ^1.4.2              # ✅
  'react-day-picker': ^9.11.1      # ✅
  'tw-animate-css': ^1.4.0         # ✅
  vaul: ^1.1.2                     # ✅
  wouter: ^3.3.5                   # ✅
  'date-fns': ^3.6.0               # ✅
  'next-themes': ^0.4.6            # ✅
  sonner: ^2.0.7                   # ✅
```

و`artifacts/ghayth-erp/package.json` يستخدم **`catalog:` لكل dependency بلا استثناء** (راجع الأسطر 14-67).

> **النتيجة:** بند D1 من الخطة (توسيع الكتالوج) **منجز بالكامل** قبل بدء هذا الـ PR.

### 1.2 الأمان والصلاحيات — مفحوص بعمق ✅

تم تشغيل وكيل تدقيق أمني متخصص على `artifacts/api-server/src/routes/` (80+ ملف). النتيجة:

| الجانب | الحالة |
|--------|--------|
| JWT signing | HS256 + 32+ byte secret من env + 15m expiry |
| Cookies | `httpOnly` + `secure` (production) + `sameSite` |
| CSRF | `csrfMiddleware.ts` يصدّق token + يعفي safe methods فقط |
| Rate limiting | login/refresh/register بـ per-IP limiters؛ المصدّق عليه per-user |
| Permission middleware | `authorize()` + `requirePermission()` تغطي كل POST/PUT/DELETE |
| code injection | **0** استخدام لـ `eval`, `Function(`, `setTimeout(string)`, `child_process.exec` بسلاسل متّصلة |
| `companyId` scoping | **5481+ query** فيها `WHERE … "companyId" = $n` |
| PDPL endpoints | **5 من 5** محميَّة (دحض ادعاء الخطة "4 من 5 بدون guard") |

#### تفصيل الـ PDPL (artifacts/api-server/src/routes/pdpl.ts):

| الـ endpoint | الحماية | الموقع |
|-------------|---------|--------|
| `GET /privacy-notice` | عام (مطلوب لإظهار الإشعار قبل الموافقة) | السطر 131 |
| `GET /retention-policies` | `authMiddleware + authorize(admin.pdpl:list)` | السطر 166 |
| `GET /employee-data-export/:id` | `authMiddleware + (self OR hr:read OR admin.pdpl:export)` | السطر 181 |
| `POST /data-request` | `authorize(admin.pdpl:create)` | السطر 271 |
| `GET /processing-log` | `authorize(admin.pdpl:view) + requireMinLevel(90)` | السطر 313 |

### 1.3 الراوتر (Router) — صحيح ✅

ادعاء الخطة "291/373 مسار يُعاد توجيهها لـ ‎`/dashboard`‎" **غير صحيح**. الفحص الفعلي لـ `artifacts/ghayth-erp/src/App.tsx`:

```tsx
function ProtectedRoutes() {
  return (
    <SidebarLayout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          {allModuleRoutes.map((r) => (
            <Route key={r.path} path={r.path}>
              <ModuleRoute Component={r.component} module={r.module} … />
            </Route>
          ))}
          <Route component={NotFound} />   {/* ← fallback صحيح */}
        </Switch>
      </Suspense>
    </SidebarLayout>
  );
}
```

الـ fallback يذهب إلى `NotFound`، **لا** إلى `/dashboard`. كل المسارات الـ 419 المسجَّلة تُحلّ من شريط العنوان مباشرة.

### 1.4 الجدول الزمني المالي (financial_periods) — مهيّأ ✅

ادعاء الخطة "`financial_periods=0` يمنع كل ترحيل GL" **مدحوض**. الملف `db/seed-financial-periods.sql` موجود ومفعَّل في `db/bootstrap.sh:111-114`:

```bash
PERIODS_FILE="$REPO_ROOT/db/seed-financial-periods.sql"
if [ -f "$PERIODS_FILE" ]; then
  echo "→ seeding financial periods …"
  PGPASSWORD="$DB_PASSWORD" psql "$DSN" -v ON_ERROR_STOP=1 -q -f "$PERIODS_FILE"
fi
```

السكربت idempotent، يُنشئ فترة 'open' للسنة الحالية لكل شركة تفتقر لها.

### 1.5 ملف clients.ts — لا يوجد سطر 845 ✅

ادعاء الخطة "`clients.ts:845` — متغير `insertId` غير معرّف":

- الملف فعليًا **625 سطرًا** فقط.
- `insertId` يُلتقط بشكل صحيح في 428 و554:
  ```ts
  const { insertId } = await rawExecute(`INSERT INTO clients … `, [...]);
  const [newClient] = await rawQuery<ClientRow>(
    `SELECT * FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [insertId, scope.companyId]
  );
  if (!newClient) throw new NotFoundError("فشل في استرجاع العميل");  // ← fail-loud
  ```

### 1.6 governance_capa / workflow_definitions — لا تعارض schema ✅

ادعاء الخطة "الكود يفتش `deletedAt` على جدولين بلا عمود":

- فعليًا الجدولان **لا يحويان** `deletedAt`.
- الكود في `routes/governance.ts:698,727,886-931` يستخدم SELECT/INSERT/UPDATE **بدون** فلتر `deletedAt`. لا توجد SQL errors.

### 1.7 Native dialogs (alert/confirm/prompt) — مزالة ✅

البحث الكامل في `artifacts/ghayth-erp/src/`:

| النمط | الاستخدامات الفعلية | تعليقات تذكر سابق |
|-------|---------------------|---------------------|
| `window.alert(` | **0** | — |
| `window.confirm(` | **0** | 7 (تشير إلى الاستبدال السابق بـ AlertDialog) |
| `window.prompt(` | **0** | 3 (تشير إلى الاستبدال بـ PromptDialog) |

كل التعليقات تشير إلى أن الاستبدال **تمَّ بالفعل** عبر `prompt-dialog.tsx` و`AlertDialog` من shadcn.

---

## القسم الثاني — الفجوات الحقيقية المتبقية ⚠️

بعد إسقاط الادعاءات الباطلة، هذه هي القائمة الحقيقية:

### 2.1 جدول `vendor_contracts` غير موجود في الـ schema 🔴 P1

- الكود في `artifacts/api-server/src/lib/cronScheduler.ts:2403-2425` يشغّل cron أسبوعي اسمه `weekly_vendor_contract_expiry` يستعلم من `vendor_contracts vc JOIN suppliers …`.
- الجدول **غير معرَّف** في `db/schema_pre.sql`، `db/schema_post.sql`، أو أي ملف migration.
- الخطأ يُكتم بـ `.catch((e) => { logger.error(e, …); return []; })`، لذا الـ cron يبدو ناجحًا في الـ logs لكنه لا ينتج تنبيهات أبدًا.
- **الإصلاح المطبَّق في هذا الـ PR**: انظر القسم الثالث.

### 2.2 `PERSIST_ALL_EVENTS` معطَّل افتراضيًا 🟠 P2 (PDPL)

- في `artifacts/api-server/src/lib/businessHelpers.ts:144-150`:
  ```ts
  // PERSIST_ALL_EVENTS — defaults off because every emitEvent() call
  // would otherwise add an INSERT to the hot path. Set it to "true"
  // in production once event_logs is observed to handle the volume.
  const persistAll = process.env.PERSIST_ALL_EVENTS === "true";
  ```
- **الأثر**: PDPL يتطلب audit trail كامل لمعالجة البيانات الشخصية. الأحداث غير الحرجة لا تُحفظ افتراضيًا → ثغرة امتثال.
- **التوصية**: `event_logs` تحوي بالفعل INDEXes كاملة (راجع schema)، ويمكن جعل الافتراضي `true` في production مع إبقاء opt-out عبر `PERSIST_ALL_EVENTS=false`.
- **الإصلاح المطبَّق**: تحديث التعليق + توثيق المتغيّر في `.env.example` (لم نُغيِّر السلوك لتفادي تأثير غير مقصود على الأداء).

### 2.3 19 زوجًا من ملفات migration بنفس الاسم 🟡 P3

```
021 + 028 → salary_history_and_employee_components.sql
… (و 18 زوج آخر)
```

كلا الملفين **متطابقان حرفيًا**:

```bash
$ diff 021_salary_history_and_employee_components.sql 028_salary_history_and_employee_components.sql
# (no diff)
```

- نظام الـ migrations يستخدم رقم البادئة كـ unique key، لذا لا تُطبَّق الـ migration مرتين فعليًا.
- لكن وجود ملفين متطابقين بأرقام مختلفة يضلل أي مراجع.
- **التوصية**: إضافة فحص في `pnpm guard` يكشف الـ duplicates. (لم يُطبَّق في هذا الـ PR لتجنب توسيع النطاق.)

### 2.4 حماية `insertId <= 0` غير موجودة 🟡 P3

من تقرير الوكيل الأمني:

- في `routes/clients.ts:428,554` و**كل ملفات الـ routes** التي تستخدم `rawExecute` ثم تستعمل `insertId` لاحقًا:
  ```ts
  const { insertId } = await rawExecute(`INSERT INTO …`, [...]);
  // إذا فشل INSERT بصمت (رغم أن rawExecute تُلقي خطأ عادة)،
  // قد يكون insertId = 0 — والـ SELECT اللاحق يُرجع undefined.
  ```
- في `clients.ts:434` يوجد `if (!newClient) throw new NotFoundError(…)` — لذا fail-loud يحدث، لكن الرسالة قد تكون مضلِّلة (تقول "فشل الاسترجاع" بدل "فشل الإدراج").
- **التوصية**: إضافة helper `assertInsert(insertId, entity)` يُلقي خطأ صريحًا. (تركتُه خارج النطاق لأن السلوك الحالي fail-loud بالفعل.)

### 2.5 صياغة التواريخ غير موحَّدة 🟡 P3

البحث في `artifacts/ghayth-erp/src/`:

- `lib/date-utils.ts:132` يستخدم `Intl.DateTimeFormat("ar-SA", {...})` — **القياسي** ✅
- 6 ملفات تستخدم `.toLocaleString()` بدون locale → يعتمد على متصفح المستخدم
- ‎0 ملف‎ يستخدم `toLocaleString("ar-SA")` (تم تنظيفه)

**التوصية**: `lint:patterns` يمكن أن يُضاف له قاعدة تمنع `.toLocaleString()` بدون locale صريح، وتدفع الجميع لاستخدام helpers في `lib/date-utils.ts`. (مدوَّن ولم يُطبَّق في هذا الـ PR.)

### 2.6 8 استخدامات لـ `window.location` بدلًا من راوتر 🟡 P3

| الملف:السطر | الاستخدام | تقييم |
|------------|-----------|------|
| `lib/api.ts:150` | redirect لـ /login عند 401 | ✅ مبرَّر (full reload لإعادة تهيئة auth) |
| `components/error-boundary.tsx:46` | reload عند خطأ غير معالَج | ✅ مبرَّر |
| `components/page-error-boundary.tsx:208` | "إلى الصفحة الرئيسية" بعد خطأ | ✅ مبرَّر (لتجنب state تالف) |
| `components/shared/page-state.tsx:290` | redirect لـ /login | ✅ مبرَّر |
| `pages/store/order-detail.tsx:200` | reload كـ retry | ⚠️ يمكن استخدام `refetch()` |
| `pages/insights.tsx:494` | navigate لـ rec.actionLink | ⚠️ يمكن استخدام `setLocation` من wouter |
| `pages/fleet/insurance.tsx:83` | navigate لـ /fleet/insurance/create | ⚠️ يمكن استخدام `<Link>` |

**3 استخدامات قابلة للتحسين** فقط، البقية مبرَّرة. (مدوَّن.)

---

## القسم الثالث — الإصلاحات المطبَّقة في هذا الـ PR

في حدود نطاق هذا الـ PR، تم تطبيق:

### 3.1 إنشاء جدول `vendor_contracts` (تصحيح بنية مخفي)

أُضيف ملف migration جديد + تحديث `db/schema_pre.sql`:

- يُنشئ الجدول مع كل الأعمدة التي يستعلم عنها الـ cron (`endDate`, `status`, `vendorId`, `title`, `companyId`).
- يضيف INDEXes على `(companyId, status, endDate)` لكي تنفّذ الاستعلامات في O(log n).
- يضيف FK على `suppliers(id)` و`companies(id)` مع `ON DELETE CASCADE`.

### 3.2 توثيق `PERSIST_ALL_EVENTS` في `.env.example`

أُضيفت فقرة تشرح متى يجب تفعيله للامتثال PDPL.

### 3.3 تحديث `KNOWN_ISSUES.md`

أُضيف قسم Phase 10 يلخّص الفجوات الست المتبقية مع روابط للملفات.

---

## القسم الرابع — مقارنة محدَّثة مع الأنظمة العالمية

| الفئة | غيث (الواقع) | المعيار العالمي | الفجوة الحقيقية |
|-------|---------------|-----------------|-----------------|
| **GL/AR/AP** | ✅ Chart of Accounts (145 حساب)، فواتير، GL، financial_periods مهيّأ | multi-currency، fixed-asset depreciation، multi-company GL | ⚠️ multi-currency — `docs/MULTI_CURRENCY_DESIGN.md` يُوثّق التصميم لكن التنفيذ جزئي |
| **ZATCA Phase 2** | ✅ schema موجود — `docs/ZATCA_PHASE_2_DESIGN.md` يوثّق التصميم | إلزامي في السعودية | ⚠️ Integration فعلي مع Fatoora API — تنفيذ جاري |
| **HR (السعودي)** | ✅ Attendance، Leave، Discipline، Payroll، GOSI، Iqama في schema | Mudad، WPS | ⚠️ Mudad/WPS لم يُربطا بعد |
| **التدقيق** | ✅ 186 صلاحية، event sourcing، RBAC v2 (SoD + JIT)، 3040 unit test | SOC2 reports | ⚠️ تقارير امتثال آلية |
| **DR / Backup** | ✅ موثّق في `docs/DR.md` + `docs/SECRETS_ROTATION.md` | scripts كاملة + RPO/RTO | ⚠️ scripts لم تُكتَب بعد |
| **الملاحظة (Observability)** | ✅ مصمَّم في `docs/OBSERVABILITY_DESIGN.md` + `docs/MONITORING.md` | Sentry، Prometheus، traces | ⚠️ Integration فعلي مع موفر |
| **i18n** | ✅ عربي ✅ RTL تلقائي | Multi-language | ⚠️ لا t() مركزي (نظام أحادي اللغة حاليًا) |

> **ملاحظة**: تقارير المقارنة العالمية قائمة بالفعل في `docs/SAUDI_COMPLIANCE_DESIGN.md` و`docs/REMAINING_ROADMAP.md` و`audit/system-review/findings/`. لا داعي لإعادة كتابتها.

---

## القسم الخامس — خارطة الطريق

ترتيب أولوية واقعي بعد التدقيق:

### Sprint القادم (2 أسابيع)

1. ✅ **vendor_contracts**: مطبَّق في هذا الـ PR.
2. **PERSIST_ALL_EVENTS=true** في production: قرار تشغيلي + monitoring لـ event_logs growth rate.
3. **`assertInsert` helper**: ‎4 أسطر‎ helper + استبدال في 3-5 مواقع P1.
4. **lint:patterns rule** لـ `.toLocaleString()` بدون locale.

### Sprint التالي (2 أسابيع)

5. **migration de-duplication script**: يكشف الـ 19 زوج المتطابقة، يحذف الأقدم بأمان.
6. **3 تحسينات لراوتر**: `pages/insights.tsx`, `pages/store/order-detail.tsx`, `pages/fleet/insurance.tsx`.
7. **Mudad / WPS connectors**: ‎بعد ZATCA‎.

### Sprint الأبعد

8. **multi-currency activation** (التصميم جاهز).
9. **Sentry / Prometheus integration**.
10. **DR scripts** (`backup.sh` / `restore.sh`).

---

## المرفق — أرقام التحقق

```
$ pnpm typecheck                 → Done (3 projects)
$ pnpm lint:patterns             → clean
$ pnpm audit:routes              → OK (419 page files)
$ pnpm audit:schema              → OK (1484 cols / 318 tables, 0 unknown)
$ pnpm --filter api-server lint  → 0 permission errors, 2726 SQL calls / 0 offenders
$ pnpm --filter api-server test  → 3040 tests passing (77 files)
```

**كل النتائج خضراء على `main` بتاريخ هذا التقرير.**

---

## مراجع سابقة (للقراءة المتعمّقة)

- `docs/KNOWN_ISSUES.md` — Phase 1-9 (السياق التاريخي الكامل)
- `docs/PERMISSION_AUDIT_2026-05-09.md` — تدقيق RBAC السابق
- `docs/TRANSACTION_SAFETY_AUDIT_2026-05-09.md` — تدقيق المعاملات
- `docs/forms-migration-report.md` — توحيد النماذج (59 forms على FormShell + zod)
- `docs/CATALOG_RULES.md` — قواعد الكتالوج (موجود مسبقًا)
- `audit/system-review/INDEX.md` — مراجعة شاملة للنظام
- `GHAYTH_AUDIT_INDEX.md` — فهرس كل التدقيقات السابقة
