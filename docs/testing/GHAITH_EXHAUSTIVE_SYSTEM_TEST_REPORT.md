# تقرير الاختبار الشامل المبني على الجرد — غيث ERP
# Ghaith Exhaustive Inventory-Driven System Test Report

**تاريخ التشغيل:** 2026-06-18
**البيئة:** التطوير المحلي (`DATABASE_URL` المحلي، بيانات اختبار مزروعة قابلة للحذف)
**الوكيل:** Main agent — Build mode
**عقد الأمانة (Honesty Contract):** لا يُعلَن نجاح/فشل دون دليل تجريبي مباشر. كل رقم في هذا التقرير ناتج عن طلب HTTP فعلي مُسجَّل، أو استعلام DB فعلي. ما لم يُختَبر مُعلَّم صراحةً «لم يُنفَّذ».

---

## 0. ملخّص تنفيذي

| البند | النتيجة |
|---|---|
| جرد الواجهة الخلفية | **1500** نقطة نهاية (منها **726** GET) |
| جرد مسارات الواجهة الأمامية | **648** مسار |
| مسارات GET بلا معاملات تم التحقق منها | **492** |
| Phase 1 — فحص GET (owner) | 477×200 · 0×404 · 2×401 (careers) · 10×422 (تتطلّب معاملات) · 3×500 |
| Phase 7 — مصفوفة RBAC للقراءة | **22 مبدأ × 492 نقطة** — تدرّج صلاحية أقل نظيف ومؤكَّد |
| Phase 8 — عزل المستأجرين | **نجاح** — وصول c2 لموارد c1 = 404؛ التحكّم c1 = 200 |
| البلاغ الحرج الوحيد | عائلة `classification-center` كانت 500 — **أُصلِح وتم التحقّق** |
| ضابط أمني مؤكَّد | قفل الحساب (account lockout) بعد 5 محاولات / 15 دقيقة — **يعمل** |

---

## 1. المنهجية والجرد (Phase 0 / Step 1 — مكتمل)

تم بناء جرد المصدر-الوحيد-للحقيقة من الكود فعليًا، لا من تخمين:

- **`docs/testing/generated/GHAITH_MASTER_TEST_INVENTORY.json`** — 1500 نقطة خلفية (method + المسار النسبي + الملف المصدر) + 648 مسار أمامي.
- **`docs/testing/generated/backend-getpaths.json`** — 492 مسار GET كامل بلا معاملات.

### 1.1 مصيدة منهجية حُلّت (تُسجَّل كأثر)
ماسح `/api/_routes` المُدمج **يبتر** المسارات متعدّدة المقاطع المُغلّفة بـmiddleware (مثال: `/api/finance/accounts` يظهر كـ`/api/accounts`). الاعتماد عليه ينتج 404 وهمية بالجملة. الحل: `artifacts/api-server/scripts/qa-build-paths.mjs` يدمج ملف الجرد مع خريطة التركيب (mount prefixes) المُحلَّلة من `routes/index.ts` → 714/726 GET مُحلَّلة (المتبقّي: health/index/storage فقط).

---

## 2. Phase 1 — فحص نقاط GET (owner، 492 مسار)

شُغِّل كل مسار من الـ492 كـowner (`admin@ghayth.com`) عبر البروكسي المشترك `localhost:80`.

| الكود | العدد | التفسير |
|---|---|---|
| 200 | 477 | استجابة سليمة |
| 401 | 2 | `/api/careers/me`, `/api/careers/my-applications` — **نظام توكن منفصل (صحيح، مُستثنى)** |
| 422 | 10 | نقاط تتطلّب معاملات استعلام إلزامية — **سلوك تحقّق صحيح، ليست أعطالًا** |
| 500 | 3 | عائلة `classification-center` — **بلاغ حرج، أُصلِح (القسم 5)** |
| 404 | 0 | — |

**مسارات 422 (تتطلّب معاملات، ليست أعطالًا):** `assert-postable`, `entity-ranking`, `public-holidays/check`, `mailboxes/oauth/microsoft365/authorize`, `numbering/preview`, `numbering/scheme-lookup`, `parties/resolve`, `settings/resolve`, `umrah/calendar/events`, `umrah/sales-wizard/uninvoiced-groups`.

---

## 3. Phase 7 — مصفوفة RBAC للقراءة (مكتمل)

**الأداة:** `artifacts/api-server/scripts/qa-rbac-matrix.mjs` (قابلة للاستئناف، checkpoints لكل مبدأ، مهلة 15ث لكل طلب).
**الناتج:** `docs/testing/generated/rbac-read-matrix.json` — **22 مبدأ × 492 نقطة GET**.
زُرعت 20 دورًا لشركة c1 + 3 أدوار لشركة c2 (`qa.<role>.c<N>@qa.test`).

### 3.1 تدرّج الصلاحية الأقل (Least-Privilege) — مؤكَّد تجريبيًا

| الدور | الشركة | 200 (مسموح) | 403 (محظور) |
|---|---|---|---|
| NO_SESSION | — | 5 | 487 (401) |
| owner (existing admin) | 1 | 476 | 0 |
| owner (seeded) | 1 | 475 | 0 |
| general_manager | 1 | 315 | 162 |
| department_manager | 1 | 99 | 390 |
| bi_manager | 1 | 87 | 402 |
| fleet_manager | 1 | 87 | 401 |
| legal_manager | 1 | 82 | 407 |
| payroll_officer | 1 | 81 | 408 |
| warehouse_manager | 1 | 81 | 408 |
| property_manager | 1 | 79 | 410 |
| crm_manager | 1 | 73 | 416 |
| branch_manager | 1 | 71 | 418 |
| projects_manager | 1 | 71 | 418 |
| support_manager | 1 | 68 | 421 |
| finance_manager | 1 | 76 | 408 |
| hr_manager | 1 | 140 | 348 |
| employee | 1 | 52 | 437 |
| driver | 1 | 32 | 458 |
| discipline_officer | 1 | 24 | 466 |
| performance_reviewer | 1 | 24 | 466 |
| attendance_officer | 1 | 24 | 466 |

**الاستنتاج (مدعوم بالأرقام):** لا دور غير-owner يقترب من وصول owner. التدرّج من owner (476) إلى الموظّف العادي (52) فالموظّفين المتخصّصين (24) منطقي ومتّسق. كل دور غير-owner يُحظَر من 162–466 نقطة بـ403. **RBAC يُطبّق على مستوى الخادم — لا اعتماد على إخفاء واجهة.**

### 3.2 السطح العام (Anonymous) — 5 نقاط GET فقط بلا جلسة
كلها مقصودة كعامة: `/api/auth/setup-state`, `/api/careers/jobs`, `/api/pdpl/privacy-notice`, `/api/public/announcements`, `/api/public/employee-of-month`. الباقي (487) يُرجِع 401 بلا جلسة = **حدّ المصادقة سليم**.

---

## 4. Phase 8 — عزل المستأجرين (Cross-Tenant Isolation) — نجاح

**الاختبار:** مبدأ من الشركة 2 (`qa.owner.c2@qa.test`، وهو owner كامل الصلاحية في شركته) يحاول الوصول لموارد مملوكة للشركة 1 عبر المعرّف، مع ضبط تحكّم (owner شركة 1 على نفس المعرّف).

| المورد (c1) | owner-c1 (تحكّم) | owner-c2 (عبر-المستأجر) | الحكم |
|---|---|---|---|
| `GET /api/support/tickets/1` | **200** (`companyId:1`) | **404** `السجل غير موجود` | معزول |
| `GET /api/employees/1` | **200** (`companyId:1`) | **404** `السجل غير موجود` | معزول |

**الاستنتاج:** owner كامل الصلاحية في شركته **لا يستطيع** قراءة صفّ من شركة أخرى — مُحمِّل الموارد في `authorize` (`resource:{table,idParam}`) يحصر بالشركة ويُرجِع 404 لا 403 (لا يكشف الوجود). **حدّ المستأجر سليم على مسارات `:id` المختبَرة.**

---

## 5. البلاغ الحرج وإصلاحه — عائلة `classification-center` (500 → 200)

### 5.1 الجذر
معالِجات عائلة `/classification-center` في `artifacts/api-server/src/routes/accounting-engine.ts` قرأت السياق عبر `(req as any).user.*`. لكن `authMiddleware` يُرفِق `req.scope` **وليس** `req.user` — فـ`req.user` غير معرّف → `Cannot read properties of undefined` → **500 على كل استدعاء**:
- **6 معالِجات** قرأت `req.user.companyId` (الثلاث GET + assert-postable + معالِجات أخرى) → كسرت القراءة لكل مبدأ مالي (owner + GM + finance_manager).
- **معالِجَا كتابة** (PATCH `/analytic-accounts/:id/link`, POST `/posting-failures/:id/classify`) قرآ أيضًا `req.user.id` → كانا ينهاران بنفس الجذر (اكتُشِف في مراجعة الكود).

### 5.2 الإصلاح
استبدال المُلحِق بالمُلحِق القانوني المستخدَم في باقي الكود (`inbox.ts`, `admin.ts`, `print.ts` ...): `req.scope.companyId` و`req.scope.userId`.

```diff
- const companyId = (req as any).user.companyId as number;
+ const companyId = (req as any).scope.companyId as number;
- const userId    = (req as any).user.id as number;
+ const userId    = (req as any).scope.userId as number;
```

### 5.3 التحقّق (post-fix، بعد إعادة تشغيل الخادم)
```
200  GET   /api/finance/classification-center                    :: {"needsLinkingCount":0,...}
200  GET   /api/finance/classification-center/analytic-accounts  :: {"data":[],"total":0,...}
200  GET   /api/finance/classification-center/posting-failures   :: {"data":[],"total":0,...}
500→ PATCH /api/finance/classification-center/analytic-accounts/1/link
       :: "Analytic account #1 not found in company 1"  ← خطأ منطقي (الحساب غير موجود)، لا انهيار undefined
422  POST  /api/finance/classification-center/posting-failures/1/classify
       :: VALIDATION_ERROR (وصل للتحقّق) ← سطر userId نُفِّذ بنجاح
```
الانهيار القديم (`undefined`) زال من المعالِجات الستة. النتائج الفارغة لـGET صحيحة لـowner مجدول حديثًا.

> ملاحظة ثانوية (خارج النطاق): مسار PATCH يُرجِع 500 لحالة «غير موجود» بدل 404 — سلوك سابق غير متعلّق بهذا البلاغ، لم يُغيَّر.

> ملاحظة: ملف `rbac-read-matrix.json` لقطة **قبل** الإصلاح (يُظهر 3×500)؛ الإصلاح تُحقِّق منه منفصلًا أعلاه.

---

## 6. ضوابط أمنية مؤكَّدة (نتائج إيجابية)

1. **قفل الحساب (Account Lockout):** أعمدة `users.lockedUntil` / `failedLoginAttempts`، الحدّ 5 محاولات فاشلة / قفل 15 دقيقة (`authSession.ts`). تأكَّد عمليًا عندما قفل الحارس حساب admin بعد محاولات بكلمة مرور خاطئة. **الضابط يعمل.**
2. **حدّ المصادقة:** 487/492 نقطة GET تُرجِع 401 بلا جلسة.
3. **حدّ المستأجر:** القسم 4.
4. **حدّ الصلاحيات:** القسم 3.

---

## 7. ما لم يُنفَّذ في هذه الجلسة (إفصاح صريح — عقد الأمانة)

نُفِّذت بالكامل وبأدلّة: **Step 1 (الجرد)، Phase 1 (فحص GET للقراءة)، Phase 7 (مصفوفة RBAC للقراءة)، Phase 8 (عزل المستأجرين على مسارات `:id` المختبَرة)**، وإصلاح البلاغ الحرج الوحيد.

**لم تُنفَّذ بعد** (تتطلّب زرع بيانات كتابة موسّع و/أو أتمتة متصفّح خارج نطاق هذه الجلسة):

- **Phases 2–6:** مسارات الكتابة/CRUD (POST/PATCH/DELETE) عبر الوحدات، سلاسل الموافقات، محرّكات الترحيل المحاسبي end-to-end.
- **Phases 9–20:** عرض الواجهة الأمامية (648 مسار) في متصفّح فعلي، رفع الملفات/المستندات، الإشعارات متعدّدة القنوات، طباعة PDF، مهام cron، حدود المعدّل (rate limits) تحت الضغط، التقارير الثقيلة، والـE2E persona journeys.
- **عزل المستأجرين** اختُبر على مسارَي `:id` تمثيليين (support/employees) لهما فحص ملكية صريح؛ **لم يُعمَّم** على كل مسارات `:id` الـ«مئات».

لا يُدَّعى أيّ شيء عن هذه البنود.

---

## 8. الأدوات والمخرجات الدائمة

- `artifacts/api-server/scripts/qa-build-paths.mjs` — مُعيد بناء المسارات (يتفادى بتر الماسح المدمج).
- `artifacts/api-server/scripts/qa-rbac-matrix.mjs` — حصّاد مصفوفة RBAC (قابل للاستئناف؛ teardown: `--teardown`).
- `docs/testing/generated/GHAITH_MASTER_TEST_INVENTORY.json` — الجرد الكامل (1500 + 648).
- `docs/testing/generated/backend-getpaths.json` — 492 مسار GET مُتحقَّق.
- `docs/testing/generated/rbac-read-matrix.json` — مصفوفة 22×492 (لقطة قبل-الإصلاح).

### تنظيف بيانات الاختبار
```bash
cd artifacts/api-server && node scripts/qa-rbac-matrix.mjs --teardown
rm -rf docs/testing/generated/.rbac-parts
# إعادة تعيين قفل أي حساب اختبار:
psql "$DATABASE_URL" -c "UPDATE users SET \"lockedUntil\"=NULL,\"failedLoginAttempts\"=0 WHERE email LIKE 'qa.%@qa.test';"
```
