# تقرير الاختبار الشامل المبني على الجرد — غيث ERP
# Ghaith Exhaustive Inventory-Driven System Test Report

**تاريخ التشغيل:** 2026-06-18
**البيئة:** التطوير المحلي (`DATABASE_URL` المحلي، بيانات اختبار مزروعة قابلة للحذف)
**الوكيل:** Main agent — Build mode
**عقد الأمانة (Honesty Contract):** لا يُعلَن نجاح/فشل دون دليل تجريبي مباشر. كل رقم في هذا التقرير ناتج عن طلب HTTP فعلي مُسجَّل، أو استعلام DB فعلي، أو تشغيل متصفّح بلا واجهة. ما لم يُختَبر مُعلَّم صراحةً «لم يُنفَّذ» في القسم 9.

> **هذا هو التقرير الموثوق الوحيد لهذا التحقّق.** يطوي بداخله نتائج تدقيق الواجهة الأمامية (كان سابقًا في `FRONTEND_RUNTIME_AUDIT.md`) مع نتائج RBAC وعزل المستأجرين وتحقّق مسارات الكتابة، ليقدّم إشارة إكمال واحدة لا لبس فيها.

---

## 0. ملخّص تنفيذي

| البند | النتيجة |
|---|---|
| جرد الواجهة الخلفية | **1500** نقطة نهاية (منها **726** GET) |
| جرد مسارات الواجهة الأمامية | **648** مسار (المُدقَّق منها في المتصفّح: **642**) |
| Phase 1 — فحص GET (owner، 492 مسار بلا معاملات) | 477×200 · 0×404 · 2×401 (careers) · 10×422 (تتطلّب معاملات) · 3×500 (أُصلِحت) |
| Phases 2–6 — مسارات الكتابة (CRUD/RBAC) | **مُتحقَّق تجريبيًا** — دورة إنشاء→تعديل→قراءة→حذف على DB + حظر كتابة حسب الدور (4×403) + ضوابط CSRF/جلسة |
| Phase 7 — مصفوفة RBAC للقراءة | **22 مبدأ × 492 نقطة** — تدرّج صلاحية أقل نظيف ومؤكَّد |
| Phase 8 — عزل المستأجرين | **نجاح** — وصول c2 لموارد c1 = 404؛ التحكّم c1 = 200 |
| Phases 9–12 — تدقيق الواجهة في متصفّح فعلي | **642 مسار** — **446 سليم** · **195 إيجابية كاذبة للأداة** · **1 خطأ حقيقي (مُصلَح ومدموج)** |
| البلاغ الحرج | عائلة `classification-center` كانت 500 — **أُصلِح وتم التحقّق** (PR #2622) |
| الخطأ الحقيقي الوحيد بالواجهة | صفحة WPS كانت 404 — **أُصلِح ومدموج** (PR #2617) |
| ضوابط أمنية مؤكَّدة | قفل الحساب · حدّ المصادقة · حدّ المستأجر · حدّ الصلاحيات · CSRF |
| Phase 13 — طباعة PDF (Print Engine v2) | **176 حالة** (88 نوع كيان × {أصلي، إعادة طباعة}) — **176 PASS · 0 فشل** ببايتات PDF حقيقية |
| Phase 14 — رفع الملفات (object storage) | PDF→200+uploadURL · ملف تنفيذي محظور→422 · 50MB تجاوز الحجم→422 — القائمة البيضاء + سقف الحجم مُنفَّذان |
| Phase 15 — الإشعارات متعدّدة القنوات | 212 إشعار (64 آخر 24س) · `outbound_queue`=11 (email، فشل صريح: SMTP غير مُهيّأ بالتطوير — DLQ يعمل) |
| Phase 16 — حدود المعدّل تحت الضغط | تسجيل دخول 16× بلا علامة E2E → **10×403 ثمّ 6×429**، أوّل حظر عند المحاولة 11 (loginLimiter=10/دقيقة) |
| Phase 17 — مهام cron | 100 مهمّة مُسجَّلة · تشغيل 10 تمثيلية → كلها 200/success · `cron_logs` نمت **بالضبط +10** · عمل فعلي (تنبيهات/تدقيق ذاتي/KPI) |
| Phase 18 — التقارير ببيانات مصدر | **مُتحقَّق 200 ببيانات**: trial-balance (179 صف) · income-statement · balance-sheet · bi/(overview,kpis,dashboards 3421B,ceo-dashboard,admin-reports/daily,operations/bottleneck) · umrah/dashboard · support/tickets (6) · hr/employees-status · finance/invoices (0 صف). _ملاحظة أمينة: 8 مسارات dashboard خمّنها الهارنس خطأً أعادت 404 (ليست المسارات الأساسية)_ |
| Phase 19 — حالات سير العمل | `approval_requests` {معلّق3/مقبول1/مرفوض1} · `journal_entries` {مسودّة2/بانتظار اعتماد2} — توزيعات آلة-حالات حقيقية |
| Phase 20 — رحلات E2E الكاملة | 18 ملف / 59 اختبار Playwright — **✅ 59/59 نجاح · 0 فشل · 0 flaky · 2.8 دقيقة · 0× HTTP 500** (مُثبَت تجريبيًا عبر الهارنس المعزول `E2E Isolated Run`: `E2E_EXIT=0`, `59 passed (2.8m) using 1 worker`). الإصلاحات مدموجة في main عبر **PR #2626** (SHA `3e26a22`) بعد اجتياز `guard` ومراجعة المعمار. تفصيل حالة الحماية في القسم 11 |

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
| 500 | 3 | عائلة `classification-center` — **بلاغ حرج، أُصلِح (القسم 7)** |
| 404 | 0 | — |

**مسارات 422 (تتطلّب معاملات):** `assert-postable`, `entity-ranking`, `public-holidays/check`, `mailboxes/oauth/microsoft365/authorize`, `numbering/preview`, `numbering/scheme-lookup`, `parties/resolve`, `settings/resolve`, `umrah/calendar/events`, `umrah/sales-wizard/uninvoiced-groups`.

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
| hr_manager | 1 | 140 | 348 |
| department_manager | 1 | 99 | 390 |
| bi_manager | 1 | 87 | 402 |
| fleet_manager | 1 | 87 | 401 |
| legal_manager | 1 | 82 | 407 |
| payroll_officer | 1 | 81 | 408 |
| warehouse_manager | 1 | 81 | 408 |
| property_manager | 1 | 79 | 410 |
| finance_manager | 1 | 76 | 408 |
| crm_manager | 1 | 73 | 416 |
| branch_manager | 1 | 71 | 418 |
| projects_manager | 1 | 71 | 418 |
| support_manager | 1 | 68 | 421 |
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

**الاختبار:** مبدأ من الشركة 2 (`qa.owner.c2@qa.test`، owner كامل الصلاحية في شركته) يحاول الوصول لموارد مملوكة للشركة 1 عبر المعرّف، مع ضبط تحكّم (owner شركة 1 على نفس المعرّف).

| المورد (c1) | owner-c1 (تحكّم) | owner-c2 (عبر-المستأجر) | الحكم |
|---|---|---|---|
| `GET /api/support/tickets/1` | **200** (`companyId:1`) | **404** `السجل غير موجود` | معزول |
| `GET /api/employees/1` | **200** (`companyId:1`) | **404** `السجل غير موجود` | معزول |

**الاستنتاج:** owner كامل الصلاحية في شركته **لا يستطيع** قراءة صفّ من شركة أخرى — مُحمِّل الموارد في `authorize` (`resource:{table,idParam}`) يحصر بالشركة ويُرجِع 404 لا 403 (لا يكشف الوجود).

---

## 5. Phases 2–6 — تحقّق مسارات الكتابة (CRUD + RBAC للكتابة) — مُتحقَّق تجريبيًا

عيّنات كتابة فعلية عبر `localhost:80`، مع عزل **التفويض** عن حماية **CSRF** (ترويسة `X-CSRF-Token` المطابقة لملف `erp_csrf`).

### 5.1 دورة CRUD كاملة كـowner (هذه الجلسة)
| الخطوة | النتيجة |
|---|---|
| `POST /api/support/tickets` (إنشاء) | **201** → `id=7`, `ref=TKT-BR-2026-00007`, `companyId=1` |
| `PATCH /api/support/tickets/7` (تعديل `priority`) | **200** → `priority: low → high` |
| `GET /api/support/tickets/7` (تأكيد الحفظ) | **200** → `priority=high` (مُثبَّت)، `companyId=1` |
| `DELETE /api/support/tickets/7` (تنظيف) | **200** → «تم حذف التذكرة بنجاح» |

دورة CRUD ثانية مؤكَّدة سابقًا على `warehouse_categories` (PR-era) مع تأكيد من قاعدة البيانات مباشرةً: إنشاء (`201 id=7`) → تعديل (`200`) → `SELECT name` يطابق الاسم المُعدّل → حذف ناعم (`deletedAt` مضبوط).

### 5.2 حظر الكتابة حسب الدور — موظّف عادي (هذه الجلسة)
المبدأ `qa.employee.c1@qa.test` (دور `employee`) حاول كتابات مُمتازة:

| العملية | النتيجة | الدلالة |
|---|---|---|
| `POST /api/settings/companies` | **403** `requiredModule:["settings"]` | حظر إنشاء على مستوى الإعدادات |
| `POST /api/admin/users` | **403** `requiredModule:["admin"]` | حظر إنشاء مستخدمين |
| `POST /api/finance/journal-entries` | **403** `requiredModule:["finance"]` | حظر القيود المحاسبية |
| `POST /api/hr/recruitment/postings` | **403** `requiredModule:["hr"]` | حظر إنشاء وظائف |

### 5.3 ضوابط الكتابة السلبية (هذه الجلسة)
| الحالة | النتيجة |
|---|---|
| `PATCH` بجلسة صحيحة لكن **بلا CSRF** | **403** `CSRF_INVALID` |
| `POST` **بلا جلسة** | **401** `AUTH_MISSING` |

**الاستنتاج:** الكتابة تُحفظ فعليًا وتُسترجع؛ التفويض يُطبَّق على الخادم (`requiredModule`)؛ وحماية CSRF والمصادقة فعّالة ومستقلّة عن RBAC.

> الأداة: `artifacts/api-server/scripts/qa-write-rbac.mjs` (تبذر موظّفًا واحدًا؛ تُنظَّف بـ`qa-rbac-matrix.mjs --teardown`).

---

## 6. Phases 9–12 — تدقيق الواجهة الأمامية في متصفّح فعلي (642 مسار)

شُغِّل تدقيق وقت التشغيل (Chromium بلا واجهة عبر `localhost:80`) يفحص لكل صفحة **٥ محاور**: العرض · جلب البيانات · الزر الأساسي · التنقّل · أخطاء وقت التشغيل. الأدلّة: لقطات الشاشة في `audit/screenshots/` (385 لقطة) + `audit/runtime-audit-results.json` + سجلّ التشغيل.

### 6.1 الملخّص
| المؤشّر | العدد |
|---|---|
| إجمالي المسارات المفحوصة | **642** |
| ✅ صفحات سليمة | **446** |
| ⚙️ إيجابيات كاذبة من أداة التدقيق (ليست أخطاءً) | **195** |
| 🐞 أخطاء حقيقية | **1** (مُصلَح ومدموج) |

> **تأكيد إضافي (هذه الجلسة):** أُعيد تشغيل تدقيق وقت التشغيل في هذه الجلسة (workflow `Runtime Audit`، `run-dir=/tmp/runtime-audit/`) بعد إصلاح `classification-center` للتحقّق من عدم وجود انحدار جديد. يُكتب التقدّم إلى `progress.json`.

### 6.2 تصنيف الإيجابيات الكاذبة (195) — مؤكَّد من سجلّ الأداة
| السبب | النسبة التقريبية | الشرح |
|---|---|---|
| ارتداد لتسجيل الدخول (login-bounce) | ~٥٨٪ | إعادة تشغيل المتصفّح كل ٤٠ مسارًا تمسح `localStorage` فترتدّ الصفحة لتسجيل الدخول — ليست مشكلة مصادقة. |
| انتهاء مهلة الانتقال (goto-timeout) | ~٢٢٪ | تجويع المتصفّح/البروكسي تحت الحمل؛ إعادة المرور تنجح. |
| إرشادات شكلية | الباقي | صفحة بلا جدول/حقل بحث (لوحات معلومات، صفحات إجراء) — تصميم مقصود. |

أمثلة إنذار كاذب مؤكَّد كسلوك صحيح: `/umrah/pilgrims/create` → `POST` يُرجع **400** (رفض تحقّق نموذج فارغ)؛ `/fleet/transport/bookings/:id/confirmation` → **404** (معرّف وهمي غير موجود في قاعدة التطوير).

### 6.3 الخطأ الحقيقي الوحيد بالواجهة — مُصلَح ✅
**صفحة إعدادات قنوات بنوك WPS** `/hr/saudi-compliance/wps/settings`:
- **السبب (١):** تمرير `/api/...` إلى `apiFetch`/`useApiQuery` اللذين يضيفان `/api` تلقائيًا → بادئة مكرّرة `/api/api/...` = 404.
- **السبب (٢):** غياب مسار **مجموعة** في الخادم (كان فقط `/saudi/wps/credentials/:bankCode`).
- **الإصلاح:** إزالة البادئة المكرّرة + إضافة `GET /saudi/wps/credentials` يُرجع `{data:[],fieldSpecs:{}}`. **مدموج في main عبر PR #2617 بـguard أخضر.** (مؤكَّد بالكود: المسار موجود في `wiring-stubs.ts`؛ لا توجد بادئة `/api/api` متبقّية.)
- **خارج النطاق (موثَّق):** `PUT/DELETE /saudi/wps/credentials/:bankCode` يبقيان 501 مؤقّتين (كتابة بيانات اعتماد بنكية مشفّرة).

---

## 7. البلاغ الحرج وإصلاحه — عائلة `classification-center` (500 → 200)

### 7.1 الجذر
معالِجات عائلة `/classification-center` في `artifacts/api-server/src/routes/accounting-engine.ts` قرأت السياق عبر `(req as any).user.*`. لكن `authMiddleware` يُرفِق `req.scope` **وليس** `req.user` → `req.user` غير معرّف → `Cannot read properties of undefined` → **500 على كل استدعاء**:
- **6 معالِجات** قرأت `req.user.companyId` → كسرت القراءة لكل مبدأ مالي.
- **معالِجَا كتابة** (PATCH `/analytic-accounts/:id/link`, POST `/posting-failures/:id/classify`) قرآ `req.user.id` (اكتُشِف في مراجعة الكود).

### 7.2 الإصلاح
استبدال المُلحِق بالقانوني المستخدَم في باقي الكود: `req.scope.companyId` و`req.scope.userId`.

### 7.3 التحقّق (post-fix)
```
200  GET   /api/finance/classification-center
200  GET   /api/finance/classification-center/analytic-accounts
200  GET   /api/finance/classification-center/posting-failures
500→ PATCH /api/finance/classification-center/analytic-accounts/1/link
       :: "Analytic account #1 not found in company 1"  ← خطأ منطقي، لا انهيار undefined
422  POST  /api/finance/classification-center/posting-failures/1/classify
       :: VALIDATION_ERROR (وصل للتحقّق) ← سطر userId نُفِّذ بنجاح
```
الانهيار القديم (`undefined`) زال. **مدموج في main عبر PR #2622 بـguard أخضر.**

> ملاحظة: `rbac-read-matrix.json` لقطة **قبل** الإصلاح (تُظهر 3×500)؛ الإصلاح تُحقِّق منه منفصلًا أعلاه.

---

## 8. ضوابط أمنية مؤكَّدة (نتائج إيجابية)

1. **قفل الحساب (Account Lockout):** الحدّ 5 محاولات فاشلة / قفل 15 دقيقة (`authSession.ts`) — تأكَّد عمليًا.
2. **حدّ المصادقة:** 487/492 نقطة GET تُرجِع 401 بلا جلسة (القسم 3.2).
3. **حدّ المستأجر:** القسم 4.
4. **حدّ الصلاحيات (قراءةً وكتابةً):** الأقسام 3 و5.2.
5. **حماية CSRF:** القسم 5.3 — الكتابة بلا توكن CSRF = 403.

---

## 9. Phases 13–20 — تنفيذ تجريبي للأطوار المتبقّية (هذه الجلسة)

الأطوار التي كانت مُفصَحًا عنها سابقًا كـ«لم تُنفَّذ» نُفِّذت الآن بأدلّة حقيقية عبر الحزمة الحيّة (HTTP عبر `localhost:80` + لقطات `pg`). الأداة: `artifacts/api-server/scripts/qa-phase13-20.mjs` → `/tmp/qa-phase13-20.json`.

### 9.1 Phase 13 — طباعة PDF (Print Engine v2) — 176/176 PASS

شُغِّل workflow «Print PDF Audit» حتى النهاية (`audit/print-pdf-audit-results.json`, generatedAt `2026-06-18T20:11:30Z`, Chromium 138):
- **88 نوع كيان × {أصلي، إعادة طباعة} = 176 حالة** — **176 PASS · 0 فشل**.
- كل حالة مرّت عبر مسار Print Engine v2 الحقيقي وأنتجت **بايتات PDF حقيقية** (`pdfBytes`/`pdfPages`) + تحقّق محورَي HTML و PDF (verify-QR/علامة مائية).
- يشمل: invoice · payroll · employee_contract · official_letter · umrah_statement/runsheet · quotation · sales/delivery/credit · vouchers · statements · purchase_* · journal_entry · pos_receipt · stock_* · legal_* · fleet_* … (القائمة الكاملة في JSON).

### 9.2 Phase 14 — رفع الملفات (object storage) — مُنفَّذ

`POST /api/storage/uploads/request-url`:
- ملف PDF (نوع مسموح) → **200** + `uploadURL` + `objectPath` ✅
- ملف تنفيذي (`application/x-msdownload`) → **422** (مرفوض بالقائمة البيضاء) ✅
- ملف 50MB (تجاوز السقف) → **422** (مرفوض، الحدّ الأقصى 20MB) ✅

القائمة البيضاء لأنواع المحتوى + سقف الحجم مُنفَّذان فعليًا على الخادم.

### 9.3 Phase 15 — الإشعارات متعدّدة القنوات — مُنفَّذ (بأمانة)

- `notifications`: **212** إجمالًا، **64** خلال آخر 24 ساعة — محرّك الإشعارات يُنتج صفوفًا حقيقية.
- `outbound_queue`: **11** صفًّا، كلها `channel=email status=failed` — **إفصاح صريح**: SMTP غير مُهيّأ في بيئة التطوير، فالمحرّك يُدرِج الرسالة ويحاول الإرسال ويُسجّل الفشل (طابور DLQ يعمل كما صُمّم). لا يُدَّعى نجاح إرسال البريد فعليًا في التطوير.

### 9.4 Phase 16 — حدود المعدّل تحت الضغط — مُثبَت

`POST /api/auth/login` (بلا ترويسة `X-E2E-Test`، ببريد وهمي) ١٦ محاولة متتالية:
- النتائج: **10×403** (بيانات خاطئة) ثمّ **6×429** (محظور).
- أوّل حظر `429` عند المحاولة رقم **11** بالضبط = `loginLimiter` بحدّ **10/دقيقة** لكل IP. إثبات تجريبي مباشر لحدّ المعدّل تحت الضغط.

### 9.5 Phase 17 — مهام cron — مُنفَّذ

- **100 مهمّة** مُسجَّلة في المُجدوِل (`cronScheduler.ts` / `JOB_DEFINITIONS`).
- شُغِّلت **10 مهام تمثيلية** عبر `POST /api/automation/cron-jobs/:id/trigger` → كلها **200 / success=true**.
- `cron_logs` نمت **بالضبط +10** (89694 → 89704) — لا تشغيل وهمي.
- عمل فعلي مُسجَّل: `daily_smart_alert_scan` أطلق تنبيهَين · `daily_self_audit` وجد 5 مخالفات عبر 3 شركات · `daily_kpi_snapshot` حفظ 5 موظّفين.

### 9.6 Phase 18 — التقارير ببيانات مصدر — مُنفَّذ (بدقّة)

**نقاط أعادت 200 ببيانات فعلية (مُتحقَّقة):**
- `finance/reports/trial-balance` → 200، **179 صف** · `income-statement` → 200 · `balance-sheet` → 200
- `bi/overview` → 200 · `bi/kpis` → 200 · `bi/dashboards` → 200 (**3421 بايت**) · `bi/ceo-dashboard` → 200 (528B) · `bi/admin-reports/daily` → 200 (245B) · `bi/operations/bottleneck` → 200 (115B)
- `umrah/dashboard` → 200 (570B) · `support/tickets` → 200 (**6 صفوف**) · `hr/employees-status` → 200 · `finance/invoices` → 200 (0 صف — فارغ صالح)

**ملاحظة أمينة (عقد الأمانة):** الهارنس `qa-phase13-20.mjs` جرّب أيضًا 8 مسارات dashboard بتخمينات خاطئة أعادت **404** (`/api/bi/dashboard` · `/api/finance/dashboard` · `/api/hr/dashboard` · `/api/fleet/dashboard` · `/api/warehouse/dashboard` · `/api/properties/dashboard` · `/api/dashboard/overview` · `/api/finance/reports/general-ledger`). هذه **تخمينات مسار خاطئة من الهارنس، ليست المسارات الأساسية ولا تُحسب أعطالًا** — المسارات الأساسية الصحيحة (bi/* أعلاه) أعادت 200. (المصدر: `/tmp/qa-phase13-20.json` للمالية/الدعم/HR + إعادة تحقّق حيّة بـcurl لـbi/* وumrah/dashboard.)

### 9.7 Phase 19 — حالات سير العمل — مُنفَّذ

توزيعات آلة-الحالات الحقيقية من DB:
- `approval_requests`: **معلّق 3 · مقبول 1 · مرفوض 1** (محرّك سلاسل الاعتماد).
- `journal_entries`: **مسودّة 2 · بانتظار اعتماد 2** (دورة ترحيل القيود المحاسبية).

### 9.8 Phase 20 — رحلات E2E الكاملة (إفصاح أمين عن حدود البيئة)

حزمة Playwright تضمّ **18 ملف مواصفات / 59 اختبار** تغطّي رحلات شخصيّات كاملة: `auth` (دخول → لوحة) · `dashboard` · `persona-employee/finance/hr/fleet-umrah/legal-comms-docs/property` · `rbac-protection` · `admin-journeys/outbox/infra-alert-paging` · `import-csv-upload` · `onboarding-blocker` · `vehicle-subsidiary-accounts` · `double-click-idempotency`.

**ما حدث تجريبيًا:** أُطلِقت الحزمة عبر `localhost:80` ضدّ الحزمة الحيّة. تعلّقت على إعداد الدخول العام / تجهيزات اختبارات `admin` التشغيلية. **السبب الجذري (مُوثَّق):** هذه الحزمة مُصمَّمة لتعمل داخل بيئة CI المعزولة الخاصّة بها (workflow `e2e.yml` يُقلِع PostgreSQL خاصًّا + يُطبّق الهجرات على DB طازجة + يُمهّد admin اختبار من `ADMIN_EMAIL/ADMIN_PASSWORD`)؛ تشغيلها ad-hoc ضدّ DB التطوير الحيّة (ببيانات وحالات مختلفة) لا يُطابِق محدِّدات/تجهيزات الاختبارات فتتعلّق. هذا قيد بيئة الاختبار، **ليس عطلًا في المنتج**.

**ما أُثبِت بدلًا منه (تكافؤ الرحلات على طبقات أدنى):**
- رحلة الدخول مؤكَّدة تجريبيًا: `POST /api/auth/login` → **200** + كوكي `erp_access`/`erp_refresh` (هذا القسم).
- رحلات RBAC وعزل المستأجرين والكتابة (CRUD) أُثبِتت تجريبيًا في الأقسام 3–5.
- طبقة الواجهة (تصيير + CTA + تنقّل + smoke) أُدقِّقت عبر **642 مسار** في متصفّح فعلي (القسم 6) — وأُعيد تشغيل تدقيق الواجهة الكامل هذه الجلسة كتعزيز (بلغ 310/642 وقت كتابة التقرير).

**الخلاصة الأمينة:** رحلات E2E الكاملة في المتصفّح مبوّبة على workflow `e2e.yml` المعزول (مرجع `e2e/README.md`)، ولا تُشغَّل نظيفًا ad-hoc ضدّ التطوير الحيّ. لا يُدَّعى «59/59 PASS» في هذه الجلسة؛ يُدَّعى فقط ما أُثبِت أعلاه.

### 9.9 إفصاح متبقٍّ صريح (عقد الأمانة)

- الإشعارات: إرسال البريد الفعلي عبر SMTP لم يُختبَر (الموفّر غير مُهيّأ بالتطوير) — أُثبِت التوليد والطابور والفشل المُسجَّل فقط.
- **عزل المستأجرين** عُمِّم على مسارَي `:id` تمثيليّين؛ لم يُعمَّم على كل مسارات `:id`.
- عيّنات الكتابة غطّت دورة CRUD + حظر دور عبر 4 وحدات؛ لم تُعمَّم على كل نقاط الكتابة.

---

## 10. الأدوات والمخرجات الدائمة

- `artifacts/api-server/scripts/qa-build-paths.mjs` — مُعيد بناء المسارات (يتفادى بتر الماسح المدمج).
- `artifacts/api-server/scripts/qa-rbac-matrix.mjs` — حصّاد مصفوفة RBAC (قابل للاستئناف؛ teardown: `--teardown`).
- `artifacts/api-server/scripts/qa-write-rbac.mjs` — مُحقِّق الكتابة حسب الدور.
- `artifacts/api-server/scripts/qa-phase13-20.mjs` — هارنس الأطوار 13–20 (رفع/إشعارات/حدّ معدّل/cron/تقارير/حالات سير العمل) → `/tmp/qa-phase13-20.json`. لا يبذُر مستخدمين دائمين (يستخدم بيانات وهمية غير مُخزَّنة).
- `docs/testing/generated/GHAITH_MASTER_TEST_INVENTORY.json` — الجرد الكامل (1500 + 648).
- `docs/testing/generated/backend-getpaths.json` — 492 مسار GET مُتحقَّق.
- `docs/testing/generated/rbac-read-matrix.json` — مصفوفة 22×492 (لقطة قبل-الإصلاح).
- `audit/runtime-audit-results.json` + `audit/screenshots/` — أدلّة تدقيق الواجهة.

### تنظيف بيانات الاختبار
```bash
cd artifacts/api-server && node scripts/qa-rbac-matrix.mjs --teardown
rm -rf docs/testing/generated/.rbac-parts
psql "$DATABASE_URL" -c "UPDATE users SET \"lockedUntil\"=NULL,\"failedLoginAttempts\"=0 WHERE email LIKE 'qa.%@qa.test';"
```

---

## 11. حالة حماية main بعد الاختبارات (Protection Status)

**آخر تحديث:** 2026-06-18 · **الوكيل:** Main agent — Build mode · **عقد الأمانة سارٍ:** كل ادّعاء أدناه مدعوم بطلب GitHub API فعلي مُسجَّل في هذه الجلسة.

### 11.1 إثبات أن main يحوي PR #2626 والحزمة خضراء

| البند | الدليل التجريبي | النتيجة |
|---|---|---|
| PR #2626 مدموج | `GET /repos/barhom64/ghayth-erp/pulls/2626` → `state=closed, merged=true` | ✅ مدموج |
| SHA الدمج = رأس main | `merge_commit_sha = 3e26a222c5894896436d065ee8bd63c0a3c3b86b` = `GET /commits/main` HEAD | ✅ مطابق |
| حزمة E2E خضراء | الهارنس المعزول `E2E Isolated Run`: `/tmp/e2e_isolated/e2e.exit = E2E_EXIT=0` · `Running 59 tests using 1 worker → 59 passed (2.8m)` | ✅ 59/59 · 0 فشل · 0 flaky |
| لا أخطاء خادم | `grep -c " 500 " /tmp/e2e_isolated/api.log` = **0** | ✅ 0× HTTP 500 |
| `workers:1` في CI مقصود وموثَّق | `e2e/playwright.config.ts` سطر 46–52: تعليق يشرح سباق دوران refresh-token لحساب الأدمن المشترك بين العمّال المتوازين | ✅ مقصود |
| مساعد login يفشل بصدق | `e2e/tests/_helpers/login.ts`: حلقة محاولتين تُعيد فقط عند ارتداد `/login` النادر، وترمي استثناءً عند فشل المحاولتين — لا تُخفي عطلًا حقيقيًا (أقرّه المعمار: PASS) | ✅ لا إخفاء |
| لا عيب منتج مُخفى بحيلة اختبار | مراجعة المعمار (includeGitDiff) على الملفات الثمانية: **PASS** صريح، «لا إخفاء لأي خطأ منتج» | ✅ |

### 11.2 الحدّ الصلب للصلاحيات — لماذا لم تُؤتمت الحماية

تطبيق GitHub المربوط عبر موصّل Replit **يفتقر صلاحية `workflows`** (وعلى الأرجح صلاحية الإدارة على الـrulesets). أُثبت ذلك تجريبيًا في هذه الجلسة، لا تخمينًا:

| المحاولة | الطلب | النتيجة |
|---|---|---|
| قراءة مجلد الworkflows | `GET /contents/.github/workflows?ref=main` | **403** |
| إنشاء فرع اختبار | `POST /git/refs` (`agent/e2e-workflow-install` من رأس main) | 201 ✅ (لإثبات أن الكتابة العادية تعمل) |
| **كتابة ملف الworkflow** | `PUT /contents/.github/workflows/e2e.yml` | **403 (محجوب بـ Cloudflare/GitHub)** ← هذا هو الحدّ |
| تنظيف فرع الاختبار | `DELETE /git/refs/heads/agent/e2e-workflow-install` | 204 ✅ (لم يبقَ أثر) |

**الخلاصة:** يمكنني إنشاء فروع وملفات عادية، لكن **أي ملف تحت `.github/workflows/` محجوب بـ 403**. لذا لا يمكن تثبيت `e2e.yml` على main برمجيًا، ولا يظهر فحص `e2e` على GitHub، وبالتالي **لا يجوز ولا يمكن** إضافته للفحوص المطلوبة بعد. إضافته قبل ظهوره على main ستُجمّد **كل** عمليات الدمج المستقبلية.

### 11.3 حالة الحماية الحالية (مقروءة من الـruleset فعليًا)

`GET /repos/barhom64/ghayth-erp/rulesets` →

- **`main-protection`** (id `16281889`) — الإنفاذ: **active**. القواعد: `deletion` (محظور) · `non_fast_forward` · `pull_request` (PR إلزامي) · **`required_status_checks` = [`guard`]** · `required_linear_history`.
- `no-branch-creation` (id `16422006`) — **معطّل**.

| سؤال الحماية | الإجابة الأمينة |
|---|---|
| هل workflow الـe2e مثبَّت على main؟ | **لا** — محجوب بـ 403 (صلاحية workflows مفقودة) |
| هل e2e ظاهر كفحص GitHub؟ | **لا** (لن يظهر قبل تثبيت الملف وتشغيله مرّة) |
| هل e2e مطلوب للدمج؟ | **لا** (مُعَدّ كمصدر-حقيقة `e2e/e2e.proposed.yml` فقط) |
| هل `guard` ما يزال مطلوبًا؟ | **نعم** — الفحص المطلوب الوحيد، سليم لم يُمَسّ |
| هل الحماية القائمة محفوظة؟ | **نعم** — لم تُضعَّف ولم تُحذَف أي قاعدة |
| هل أُجري PR/اختبار تحقّق للحماية؟ | جزئيًا — تحقّق إنفاذ الـruleset بالقراءة المباشرة؛ تحقّق «لا يمكن الدمج بدون e2e» يتعذّر قبل وجود الفحص |
| ما المتبقّي يدويًا؟ | تثبيت `e2e.yml` + إضافته للفحوص المطلوبة (خطوات 11.4) |

### 11.4 خطوات المالك اليدوية الدقيقة (مطلوبة لإكمال الحماية)

**الملف المصدر (جاهز ومدموج على main):** `e2e/e2e.proposed.yml`
**الوجهة:** `.github/workflows/e2e.yml`
المحتوى المطلوب = كتلة `e2e.proposed.yml` بدءًا من سطر `name: e2e` حتى نهاية الملف (احذف فقط كتلة التعليق التوضيحي الأولى أسطر 1–46). اسم الـworkflow `name: e2e` ⇒ **اسم الفحص الذي سيظهر على GitHub هو `e2e`** (اسم الوظيفة `e2e` أيضًا).

**الخطوة 1 — تثبيت الملف (تحتاج صلاحية `workflows`):** أيٌّ مما يلي:
- عبر واجهة GitHub: `Add file → Create new file` باسم `.github/workflows/e2e.yml`، الصق المحتوى أعلاه، Commit عبر PR إلى main، انتظر `guard` يصبح أخضر، ثم Squash-merge.
- أو ادفعه من جهاز/توكن يحمل صلاحية `workflows` OAuth.

**الخطوة 2 — تشغيله مرّة على main:** بعد الدمج، شغّله من تبويب Actions (`workflow_dispatch` متاح) أو سيُشغَّل تلقائيًا على أوّل push/PR. تأكّد من: النتيجة `success`، 59/59، 0 فشل، 0 flaky، 0× HTTP 500. سجّل: رابط التشغيل، run id، المدّة.

**الخطوة 3 — إضافته للفحوص المطلوبة (تحتاج صلاحية إدارة):**
1. GitHub → المستودع `barhom64/ghayth-erp`.
2. `Settings → Rules → Rulesets` (أو `Settings → Branches`).
3. افتح الـruleset النشط **`main-protection`** (id `16281889`).
4. ضمن **Require status checks to pass** أضف الفحص باسمه الحرفي: **`e2e`** — **مع إبقاء `guard` كما هو**.
5. Save.
6. تحقّق بـ PR تجريبي بسيط أن الدمج محظور حتى ينجح `e2e` + `guard` معًا.

> ⚠️ **تحذير حرج:** لا تُضِف `e2e` للفحوص المطلوبة **قبل** أن يكون قد ظهر ونجح على main مرّة واحدة على الأقل. الفحص المطلوب غير الموجود لا يصبح أخضر أبدًا ⇒ سيُجمّد **كل** الدمج.

### 11.5 إعادة فحص الـPRs المفتوحة (15 PR — لم يُدمَج أيٌّ منها أعمى)

سياسة: **لا دمج أعمى.** كلّها متخلّفة عن main وتحتاج rebase + `guard` أخضر (و`e2e` لاحقًا) قبل أي دمج. التصنيف من قراءة فعلية للملفات:

| PR | العنوان | التصنيف | التوصية |
|---|---|---|---|
| **#2614** | de-flake login + حارس bare-root `goto("/")` | **ليس مكرَّرًا لـ#2626** — يلمس `auth.spec`/`dashboard.spec`/`idempotency.spec` + حارس guard.sh جديد، لا `login.ts`. حالة `behind` | قيّم المالك: rebase + guard؛ تحقّق أن `login.ts` (#2626) يجتاز حارس `check-e2e-login-pattern` الجديد قبل الدمج |
| **#2610** | hr-wps: شرط `companyId` على UPDATE | **ما يزال صالحًا** — تعزيز عزل مستأجر دفاعي صغير (2 ملف) | rebase + guard (+ e2e) ثم دمج |
| **#2608** | rbacV2/finance: شروط `companyId` دفاعية | **ما يزال صالحًا** — نفس صنف #2610 | rebase + guard (+ e2e) ثم دمج |
| **#2583** | finance: تجربة إدخال المصروفات (#2230) | **ذو قيمة** — ميزة + 8 اختبارات smoke (13 ملف). `behind` | rebase + إعادة اختبار + مراجعة المالك قبل الدمج |
| **#2580** | "vigilant pasteur" | **نطاق مُحدَّد الآن:** حزمة كبيرة (48 ملف، +4082) — صفحات finance فرعية (amortization/CIP/classification-center/deferred-revenue/insurance-premium/misparented) + خريطة تنقّل canonical + حواس guard جديدة | **قرار المالك** — كبيرة وعالية المخاطر؛ لا دمج دون مراجعة + guard + e2e |
| #2560 | finance: محوّل product-revenue | صالح، refactor | rebase + guard، قرار المالك |
| #2531 | org: روابط مؤسسية في إنشاء الموظف | صالح | rebase + guard |
| #2520/#2516/#2515 | umrah-routes U-07 نحت (مراحل 4/3/2) | سلسلة refactor متتالية | دمج بالترتيب بعد guard، قرار المالك |
| #2021 | deps: تحديث pnpm-lock لـyaml@2.9.0 | تحقّق إن ما زال لازمًا بعد main الحالي | قد يكون قديمًا — قرار المالك |
| #2009 | mobile-deploy `/mobile/` | **[محظور]** ينتظر PR الأساس | يبقى محظورًا |
| #1992 | mobile: تصحيح حقول 4 أقسام كتابة | صالح | rebase + guard |
| #1978 | fleet: متابعة تدقيق (#1812) | صالح | rebase + guard |
| #1771 | comms: ملاحظات داخلية على المحادثات | صالح | rebase + guard |

### 11.6 حادثة e2e على GitHub Actions: timeout 30m — السبب الجذري والإصلاح (2026-06-19)

ثبّت المالك `.github/workflows/e2e.yml` على GitHub وشغّله، فـ**فشل بـ timeout (الوظيفة أُلغيت عند 30m20s)** — لا بفشل اختبار. فحصتُ تشغيلات Actions الفعلية عبر الـAPI (لا تخمين) فظهر السبب الجذري بدقّة:

**التشغيلات الملغاة:**
- run #8772 (push/main, sha `b3ff798e`) — `cancelled` بعد 30.3m — https://github.com/barhom64/ghayth-erp/actions/runs/27800636012
- run #8771 (workflow_dispatch/main, sha `fb04ed1c`) — `cancelled` بعد 30.3m — https://github.com/barhom64/ghayth-erp/actions/runs/27800503867

**تفكيك زمن الخطوات (من Actions API — الدليل الحاسم):**

| # | الخطوة | الزمن | النتيجة |
|---|---|---|---|
| 3 | Checkout | 0.03m | ✅ |
| 6 | Install dependencies | 0.05m | ✅ |
| 7 | Load DB schema (441 جدول) | 0.12m | ✅ |
| 8 | Build api-server | 0.02m | ✅ |
| 9 | Build frontend | 0.53m | ✅ |
| **10** | **Install Playwright browsers** | **29.15m** | **❌ cancelled (علِق)** |
| 13 | **Run Playwright tests** | 0.00m | **⏭️ skipped — لم تُشغَّل إطلاقًا** |

**السبب الجذري (مُثبَت):** سكربت `install-browsers` كان `playwright install --with-deps chromium`. الجزء `--with-deps` يستدعي `apt-get` الذي **علِق 29 دقيقة** على عداء ubuntu-latest حتى قُتِل عند سقف 30m — **قبل أن تبدأ أي اختبارات**. أي أن مجموعة E2E نفسها لم تكن السبب (محليًا 59/59 في 2.8m)؛ السبب خطوة تثبيت المتصفّح وحدها. للمقارنة: `audit-runtime.yml` (وظيفة CI القائمة التي تشغّل Chromium headless على نفس صورة العداء) لا تستخدم `--with-deps` إطلاقًا وتعمل بـ `timeout-minutes: 60`.

**الإصلاح المطبَّق (هذا الـPR):**
1. `e2e/package.json` → `install-browsers` صار `playwright install chromium` (حُذف `--with-deps`): صورة ubuntu-latest تشحن مكتبات Chromium الزمنية أصلًا، فلا حاجة لخطوة apt المعلِّقة. **يُشحَن عبر الـPR** ⇒ إن كانت خطوة الworkflow تستدعي هذا السكربت، يُصلَح تلقائيًا دون لمس YAML.
2. `e2e/e2e.proposed.yml` (مصدر-الحقيقة): إضافة `actions/cache` لمتصفّحات Playwright (يتخطّى التنزيل في الإعادات) + `timeout-minutes: 10` على خطوة التثبيت (تفشل سريعًا وبوضوح بدل ابتلاع الميزانية) + رفع ميزانية الوظيفة `timeout-minutes` من 30 إلى 45 + توثيق الحادثة في التعليقات.

**ما لا أستطيع فعله بنفسي (حدّ الصلاحيات):** لا أستطيع دفع `.github/workflows/e2e.yml` (PUT يُرجِع 403 — الموصّل بلا صلاحية `workflows`؛ مُعاد إثباته هذه الجلسة). لذا **إن كانت خطوة «Install Playwright browsers» في الworkflow المثبَّت تكتب الأمر سطرًا مباشرًا** بدل استدعاء سكربت npm، يجب أن يطبّق المالك يدويًا التعديل التالي على `.github/workflows/e2e.yml`:

```diff
       - name: Install Playwright browsers
-        run: playwright install --with-deps chromium      # أو ما يعادله مع --with-deps
+        timeout-minutes: 10
+        run: pnpm --filter @workspace/e2e run install-browsers   # صار بلا --with-deps
```
(واختياريًا: ارفع `timeout-minutes` للوظيفة إلى 45، وأضف خطوة `actions/cache` كما في `e2e/e2e.proposed.yml`.)

**التحقّق التجريبي — النتيجة المؤكَّدة (بعد دمج الإصلاح):**

1. **e2e لا يعمل على أحداث `pull_request` إطلاقًا.** فحصتُ تشغيلات الworkflow فتبيّن أن كل تشغيلات `pull_request` (على جميع الفروع) نتيجتها `skipped`؛ الworkflow يشغّل الاختبارات فعليًا على حدث `push` إلى main فقط. لذا فتح PR لا يُعطي إشارة عن e2e — التحقّق الحقيقي يأتي من تشغيل push-to-main بعد الدمج.
2. **بعد دمج إصلاح package.json إلى main** (squash SHA `590a3b7`)، انطلق تشغيل push-to-main رقم `27802512469` (https://github.com/barhom64/ghayth-erp/actions/runs/27802512469). الخطوات 1–9 مرّت بسرعة (<1m لكلٍّ)، ثم **خطوة [10] «Install Playwright browsers» علِقت من جديد بنفس التوقيع** (17.9m فأكثر دون تقدّم، مطابِقة لتوقيع التشغيلات السابقة 29m→cancelled). الاختبارات لم تبدأ.
3. **الاستنتاج المُثبَت:** خطوة [10] في الworkflow المثبَّت **تكتب الأمر سطرًا مباشرًا** (`playwright install --with-deps chromium`) ولا تستدعي سكربت npm — لذا إصلاح `e2e/package.json` **ضروري لكنه غير كافٍ بمفرده** لهذا الworkflow. لإخضرار e2e على Actions يجب أن يطبّق المالك يدويًا تعديل الـdiff أعلاه على `.github/workflows/e2e.yml` (حذف `--with-deps` + إضافة `timeout-minutes` للخطوة؛ والكاش/ميزانية الوظيفة اختياريان). لا يمكنني فعل ذلك بنفسي (الموصّل بلا صلاحية `workflows` — 403).

> **e2e ليس أخضر على GitHub Actions حتى الآن** — بانتظار تعديل المالك اليدوي على الworkflow YAML. لا يُضاف `e2e` إلى الفحوص المطلوبة قبل نجاحه مرّة واحدة على Actions.

### 11.7 تصنيف الجاهزية (Readiness Verdict)

> **النظام جاهز Pilot قوي تقنيًا، لكنه ليس «جاهزًا بالكامل من ناحية الحماية» حتى يخضرّ e2e على GitHub Actions ثم يُضاف كفحص مطلوب.**

الحالة الأمينة بعد الحادثة:
- ✅ الحزمة الفنية خضراء محليًا (59/59) ومدموجة في main، و`guard` يحرس main كفحص مطلوب.
- ✅ workflow الـe2e **مثبَّت** على GitHub الآن (لم يعُد ناقصًا).
- ❌ لكنه **لم ينجح بعد على GitHub Actions** — فشل بـ timeout بسبب تعليق تثبيت المتصفّح (القسم 11.6). الإصلاح مُعَدّ في هذا الـPR، وينتظر إمّا الالتقاط التلقائي (إن كانت الخطوة سكربت-المصدر) أو تطبيق المالك لتعديل سطر واحد على الworkflow.
- ⛔ **لا يُضاف `e2e` إلى الفحوص المطلوبة** حتى ينجح مرّة واحدة على Actions — إضافته الآن (وهو أحمر) ستُجمّد كل الدمج.

لا أُعلِن «جاهز للإنتاج/الحماية كاملة» قبل تشغيل e2e أخضر مُثبَت على GitHub Actions.
