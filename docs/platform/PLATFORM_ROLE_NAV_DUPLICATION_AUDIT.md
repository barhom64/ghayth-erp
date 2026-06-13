# جرد منصة غيث — تجربة الأدوار + القائمة + الـdashboards + التكرار (PR-0)

> **Issue**: #2163 — الموجة الثانية: توحيد تجربة الأدوار وتنظيف التكرار بين الصفحات والخدمات
> **النوع**: PR-0 — جرد فقط · بلا أي تعديل تشغيلي
> **التاريخ**: 2026-06-12 · **الفرع**: `claude/platform-duplication-audit-pr0-AOfO7`
> **القاعدة الذهبية المُلزِمة**: «لا تظهر صفحة أو خدمة أو عنصر قائمة إلا وله مالك مسار واضح، وصلاحية واضحة، ويفتح فعليًا للدور الذي يراه.»

---

## 1. ما لم يحدث في PR-0 (الالتزام بنطاقك)

| ❌ ممنوع | تأكيد |
|---|---|
| حذف صفحة | لم يحدث |
| نقل صفحة | لم يحدث |
| تعديل authMiddleware | لم يحدث |
| إعادة بناء القائمة | لم يحدث |
| تعديل صلاحية إنتاجية | لم يحدث |
| دمج خدمات backend | لم يحدث |
| فتح PR علاج | لم يحدث — انتظار اعتمادك |

كل التغييرات في هذا الـPR وثائق + بيانات + سكربت رحلة READ-ONLY (لا POST/PATCH/DELETE).

---

## 2. المصادر الأربعة المُمسوحة

كما طلبت، الجرد لا يعتمد على مصدر واحد:

1. **Routes الفعلية** — `artifacts/ghayth-erp/src/routes/*.tsx` (15 ملف، 611 path).
2. **عناصر القائمة الجانبية** — `navigation.registry.ts` (472 nav item بعد إصلاح الـregex الخاص بالـnested children).
3. **لوحات المسارات (dashboards)** — كل path يبدأ بـ `/dashboard`، `/module-dashboards`، `/manager-board`، `/manager-workspace`، `/workspace`، `/my-space`، `/my/`، `/services`، `/work-inbox`، `/calendar` (12 سطح فريد).
4. **Backend endpoints + wiring audit** — استُهلكت مخرجات `scripts/src/check-frontend-backend-wiring.mjs` الموجودة سابقًا (96 endpoint بلا مستهلك UI).

---

## 3. الأرقام الكبيرة

| المقياس | القيمة |
|---|---|
| Routes في الـrouter | **611** |
| عناصر nav في القائمة | **472** |
| سطوح dashboards فريدة | **12** |
| مسارات فريدة بعد تطبيع المعاملات | **611** |
| Backend endpoints غير مستهلَكة من الواجهة | **96** عبر 20 وحدة |
| مجموعات «نفس الصفحة على مسارات متعددة» | **16** |
| ⤷ منها cross-module-duplicate (قرار مطلوب) | **4** |
| ⤷ منها tabbed-page (مقبولة معماريًا — توثيق) | **12** |
| Personas جاهزة في الـtenant الحي | **4 من 10** (seed gap في 6) |

### توزيع التصنيفات (لكل path فريد)

```
canonical                 417
deep-link-only            189    (details/create — لا تحتاج nav بالتصميم)
tabbed-page                36    (مقبولة — توثيق فقط)
cross-module-duplicate      8
orphan                      5    (مفصَّلة بـ4 sub-categories في §6)
dead-link                   0    ✅
forbidden-visible           ❓   انظر §10a
```

**§10a — `forbidden-visible` غير محسوم في PR-0** (لا «صفر»): القياس
يتطلب login لكل دور قياسي ثم محاولة فتح كل path يراه في nav والتحقق
أن الـbackend يُرجِع 200 لا 403. اليوم 5 من 10 personas مفقودة من
الـseed (§10)، فلا يمكن إجراء القياس الكامل. **سيُحسَم في PR-6
(إكمال seed personas) ثم PR-8 (الرحلة الشاملة) من الموجة الثانية**؛
الـ`?` في الجدول أعلاه يعكس عدم الحساب لا عدم الوجود.

---

## 4. الـ4 cross-module duplicates (مكسوبة بدقة)

كل واحدة = نفس مكوّن React مسجَّل في الـrouter تحت segment أعلى مختلف.
كل واحدة تتطلب قرار «من المالك؟».

| المكوّن | المسارات | القرار المقترح |
|---|---|---|
| `pages/admin/attendance-categories` | `/admin/attendance-categories` + `/hr/attendance-categories` | تثبيت `/admin/*` كـcanonical، إعادة توجيه الـHR mirror |
| `pages/admin/scoring-weights` | `/admin/scoring-weights` + `/hr/scoring-weights` | نفس نمط 1 |
| `pages/create/finance/vendors-create` | `/finance/vendors/create` + `/warehouse/suppliers/create` | **يحتاج قرار صاحب منتج**: vendor (مالي) و supplier (لوجستي) كيانان مختلفان معماريًا، شراكة المكوّن خلط مفهوم |
| `pages/properties-guide` | `/guide/properties` + `/properties/guide` | تثبيت `/properties/guide`، حذف `/guide/properties` كـlegacy alias |

---

## 5. الـ12 tabbed-page groups (لا تُلامَس)

نمط معماري شائع: صفحة واحدة تخدم عدّة tabs، وكل tab له URL مستقل للـdeep-linking. **ليست bugs**.
أمثلة: `/governance` + `/governance/{audits,compliance,policies,risks}` كلها تذهب لـ`pages/governance` الذي يقرأ الـURL ليعرض الـtab الصحيح. مثلها: `/legal`، `/warehouse`، `/settings`، `/store`، `/requests`، `/documents`، `/crm`، `/fleet/telematics`، `/umrah/commission-plans/...`.

كاملها في صفحة Tabbed Pages في الـxlsx.

---

## 6. الـ5 orphans — مُفصَّلة بـ4 sub-categories

المصفوفة وسمت **5 paths فقط** بـtag `orphan`. التقرير الأول لـPR-0 خلط
معها 4 paths هي canonical فعلًا في nav (تأكيد بـgrep: `/admin/users`،
`/finance/ar-collection-workbench`، `/finance/bank-accounts-watch`،
`/finance/purchase-requests`، `/me/driver`، `/umrah/reports/agent-balances`
كلها لها صفوف nav). أُزيلت من هذا القسم. أدناه الـ5 الحقيقية مفصَّلة:

### 6.A — actual orphan routes (route موجود، nav غير موجود، وغير deep-link بالتصميم)

| المسار | لماذا «حقيقي» |
|---|---|
| _لا شيء_ | بعد الفلترة، كل الـ5 ينتمي لإحدى الـ3 categories التالية — لا يوجد path مفقود-بالنية المعمارية |

**العدد**: 0.

### 6.B — deep-link-only candidates (يجب أن لا يُضاف لـnav — يُفتح من سياق أبيه)

| المسار | السياق الصحيح للفتح |
|---|---|
| `/umrah/commission-plans/new` | من قائمة العمولات `/umrah/commission-plans` (زر «جديد») — نمط `/create` |

**العدد**: 1. **القرار**: لا nav-add. توثيق في صفحة الـlist.

### 6.C — back-compat / legacy aliases (مرشَّحة للحذف الآمن أو الإخفاء بعد redirect)

| المسار | بديله الحالي | حالة |
|---|---|---|
| `/my/work-queue` | `/work-inbox` (PR-5) | الـcanonical الجديد يستوعب كل ما كان يخدمه — يحتاج تأكيد صاحب المنتج قبل الحذف |

**العدد**: 1. **القرار**: redirect → `/work-inbox` ثم إزالة (PR منفصل).

### 6.D — nav-add candidates (route صالح، nav فقدته)

| المسار | nav-section المقترح |
|---|---|
| `/umrah/transport-requests` | «العمرة → النقل» |

**العدد**: 1. **القرار**: إضافة nav item تحت السكشن المقترح.

### 6.E — orphan + cross-module-duplicate (تُحَل بحل الـduplicate)

| المسار | ملاحظة |
|---|---|
| `/admin/attendance-categories` | الـ`/hr/attendance-categories` المرآة في nav؛ بعد تثبيت canonical في §4، هذا الـorphan يختفي تلقائيًا |
| `/admin/scoring-weights` | نفس النمط |

**العدد**: 2. **القرار**: لا قرار مستقل — يُحَل ضمن PR-3 (تنظيف الـduplicates).

### مجموع §6

**5 orphans = 0 actual + 1 deep-link-only + 1 back-compat + 1 nav-add + 2 cross-duplicate-resolved**

(يطابق التوزيع في §3 ويطابق صف #4 في جدول القرار §11.)

---

## 7. أكبر صداع dashboards — `/module-dashboards/*` خلف `bi`

نطاق #2163 §1 ينص على هذا حرفيًا: «بعض لوحات المسارات خلف `requireModule("bi")`، فتُحجب لوحة المسار عن مدير المسار».

**ما وجده الجرد**:
- نـ`/module-dashboards` كـrouting واحد يستضيف 5 nav items: «لوحة المسارات»، «لوحة HR»، «لوحة المالية»، «لوحة الأسطول»، «لوحة المبيعات».
- كل واحدة في nav سُجِّلت بـ`module: "bi"` بدلًا من `module: "hr" / "finance" / "fleet" / "crm"`.
- النتيجة: مدير HR (الذي يملك hr لا bi) يرى الرابط (لأن البوابة الفعلية في `/permissions/my` العامة الآن مفتوحة بعد PR-10) لكنه يفتح صفحة تطلب bi → 403 عند جلب البيانات.

العلاج (PR-1 من الموجة 2): كل tab خلف `module` المسار صاحب اللوحة، لا `bi`. `bi` يبقى وحدة تحليلات تخدم BI الخاصة فقط.

---

## 8. مصدر «وحدات الدور» المزدوج — رصد مباشر من الرحلة

اكتشفته الرحلة لمّا حاولت تطابق الـmodule key المُستخدم في الـbackend (`home`، `property`، `operations`) مع الـmodules المُعَلَنة في `/auth/me` (`dashboard`، `properties`، `projects`).

**شواهد من الرحلة الحيّة على tenant الضياء**:

```
owner    /auth/me modules: [dashboard, properties, projects, …]   (27 module)
وفي backend روتر:           requireModule("home"|"property"|"operations")
```

النتيجة: المنحاز لكلا الاسمين (الـRBAC v2 → modules projection) و(`ROLE_DEFAULT_MODULES` في `roleGuard.ts`) لا يتفقان على القاموس. اليوم يحرسهما parity مسمار في `hrStandardRoleGrantsSmoke`، لكن الجذر مصدران.

العلاج (PR-2 من الموجة 2): مصدر واحد ينتج modules لكلا الـmount-gate وlسايدبار.

---

## 9. الـ96 endpoint غير مستهلَكة من الواجهة

موزّعة على 20 وحدة:

| الوحدة | عدد | ملاحظة سريعة |
|---|---|---|
| `/finance` | 36 | أكبر شريحة |
| `/umrah` | 28 | أكبر ثانية |
| `/transport` | 25 | معظمها ops/integration |
| `/fleet` | 18 | rental-contracts بالكامل |
| `/org` | 8 | أساسية: legal-entities/positions/teams/committees PATCH |
| `/admin` | 7 | observability/communication-control |
| `/documents` | 6 | ACL surface |
| `/settings` | 5 | departments + administrations CRUD |
| `/export` | 3 | PDF endpoints |
| `/parties` | 3 | backfill + resolve |
| `/tasks` | 3 | assignees surface |
| `/auth` | 2 | mobile login/refresh |
| 7 وحدات أخرى | 6 | كل واحدة 1 endpoint |

الكاملة في `PLATFORM_BACKEND_UNUSED_ENDPOINTS.csv` + شيت Unused Endpoints في الـxlsx. كل واحد له suggested decision أولي (wire / internal-service / remove).

---

## 10. فجوة personas seed

كما توقعت في تعليمات PR-0 («إذا بعض الأدوار غير جاهزة، يسجل ذلك كفجوة seed، لا يتم ترقيعها داخل PR-0»):

| الدور | users في الـtenant الحي | جاهز للرحلة؟ |
|---|---|---|
| owner | 3 | ✅ |
| hr_manager | 24 | ✅ |
| department_manager | 11 | ✅ |
| payroll_officer | 11 | ✅ |
| employee | 40 | ⚠️ (موجود لكن login يفشل بـpassword مختلف لـ`fleet@ghayth.com`) |
| general_manager | 0 | ❌ seed gap |
| finance_manager | 0 | ❌ seed gap |
| fleet_manager | 0 | ❌ seed gap |
| property_manager | 0 | ❌ seed gap |
| warehouse_manager | 0 | ❌ seed gap |

**5 من 10 personas الإلزامية لاختبار «تجربة الأدوار على النظام كاملًا» مفقودة من الـseed.** سُجِّلت كفجوة تُعالج في PR-6 من الموجة الثانية قبل PR-8 (رحلة تجربة الأدوار الشاملة).

سكربت الرحلة READ-ONLY محفوظ في `scripts/verify-platform-role-nav-journey.sh` — JSON output في `/tmp/platform-role-nav-journey.json`، قابل لإعادة التشغيل أي وقت.

---

## 11. جدول القرار الأولي

| # | البند | قرار مقترح | PR مرشَّح | الأولوية |
|---|---|---|---|---|
| 1 | `/module-dashboards/*` خلف `bi` | فصل كل لوحة خلف `module` صاحب المسار | PR-1 (الموجة 2) | عالية |
| 2 | مصدر «وحدات الدور» المزدوج | توحيد مصدر واحد | PR-2 (الموجة 2) | عالية |
| 3 | الـ4 cross-module duplicates | تثبيت canonical + redirect + إزالة الـduplicate | PR-3 (الموجة 2) | متوسطة |
| 4 | الـ5 orphans = 0 actual + 1 deep-link + 1 back-compat + 1 nav-add + 2 يُحَلّان بـPR-3 | تنفيذ 3 قرارات صغيرة (انظر §6.B/C/D) | PR-4 (الموجة 2) | منخفضة (نطاق أصغر بكثير من المتصوَّر) |
| 5 | الـ96 unused endpoints | تصنيف لكل واحد: wire / internal-service / remove | PR-5 (الموجة 2) | متوسطة |
| 6 | seed gap في 5 personas | إضافة users تجريبية للأدوار الخمسة | PR-6 (الموجة 2) | عالية (يسبق PR-8) |
| 7 | شاشة orphans للبيانات التنظيمية | بناء شاشة قراءة فقط | PR-7 (الموجة 2) | متوسطة |
| 8 | اختبار تجربة الأدوار شامل النظام | بناء `verify-platform-role-experience.sh` لـ10 personas × 12 dashboards × 472 nav | PR-8 (الموجة 2) | عالية |
| 9 | الـ12 tabbed-page groups | توثيق فقط — لا تغيير | — | منخفضة |
| 10 | مسامير anti-regression للقاعدة الذهبية | guard pin يمنع dead-link/forbidden-visible/orphan جديد | PR-9 (الموجة 2) | عالية |

---

## 12. قائمة PRs مقترحة للموجة الثانية (مرتبة)

| # | PR | الـoutput | الاعتمادية | أولوية |
|---|---|---|---|---|
| 1 | فصل `/module-dashboards/*` عن `bi` | كل لوحة مسار خلف module المسار صاحب اللوحة + مسمار | — | عالية |
| 2 | توحيد مصدر «وحدات الدور» جذريًا | مصدر واحد ينتج modules لكلا mount-gate و sidebar | — | عالية |
| 3 | تنظيف الـ4 cross-module duplicates | canonical + redirects + إزالة الـduplicates | — | متوسطة |
| 4 | تنظيف الـ5 orphans (نطاق ضيق بعد التصنيف) | 1 nav-add + 1 deep-link doc + 1 back-compat redirect (الـ2 الباقيان يُحَلَّان بـPR-3) | — | منخفضة |
| 5 | تصنيف الـ96 unused endpoints | كل endpoint قراره | — | متوسطة |
| 6 | seed users للأدوار الخمسة الناقصة | users + توثيق طريقة إضافة persona | — | عالية |
| 7 | شاشة orphans للبيانات التنظيمية | صفحة قراءة فقط ترصد الناقص | — | متوسطة |
| 8 | رحلة تجربة الأدوار الشاملة على النظام كاملًا | `verify-platform-role-experience.sh` + تقرير شامل | PR-1 + PR-6 | عالية |
| 9 | مسامير guard للقاعدة الذهبية | `platform-nav-integrity` smoke pin | بعد PR-8 | عالية |

---

## 13. المخرجات الكاملة لهذا الـPR

| الملف | ماذا يحوي |
|---|---|
| `docs/platform/PLATFORM_ROLE_NAV_DUPLICATION_AUDIT.md` | هذا التقرير |
| `docs/platform/PLATFORM_ROLE_NAV_DUPLICATION_MATRIX.xlsx` | 13 ورقة: Summary، Routes، Sidebar Nav، Matrix (join+tags)، Cross-Module Duplicates، Tabbed Pages، Dashboards، Unused Endpoints، Orphans، Persona Seed Gap، Decision Table، Ranked PR List، Out of Scope |
| `docs/platform/PLATFORM_ROLE_NAV_DUPLICATION_MATRIX.csv` | الـmatrix الخام (611 صف) للتدقيق النصي |
| `docs/platform/PLATFORM_CROSS_MODULE_DUPLICATES.csv` | الـ4 الـduplicates الحقيقية |
| `docs/platform/PLATFORM_TABBED_PAGES.csv` | الـ12 tabbed-page groups (للمرجعية) |
| `docs/platform/PLATFORM_DASHBOARDS.csv` | الـ12 سطح dashboard فريد |
| `docs/platform/PLATFORM_BACKEND_UNUSED_ENDPOINTS.csv` | الـ96 endpoint |
| `docs/platform/_inventory_raw.json` | المخزون الذري لكل المصادر |
| `scripts/verify-platform-role-nav-journey.sh` | الرحلة READ-ONLY لـ10 personas (يُسجِّل seed-gap للناقص) |

---

## 14. القاعدة الذهبية — كيف ستُحرَس في الموجة 2

من #2163: **«لا تظهر صفحة أو خدمة أو عنصر قائمة إلا وله مالك مسار واضح، وصلاحية واضحة، ويفتح فعليًا للدور الذي يراه.»**

تترجم لـ3 شروط على كل عنصر nav:

1. **مالك مسار واضح**: nav item له `path` يتطابق مع route مسجَّل (لا dead-link).
2. **صلاحية واضحة**: nav item له `perm` (أو `module` يكفي وحده إذا الـmount يحرسه)، والـbackend ينفذ نفس الـperm.
3. **يفتح فعليًا للدور الذي يراه**: لكل دور قياسي يرى الـitem، تجربة الفتح ترجع 200 (لا forbidden-visible).

ستتحول هذه القاعدة إلى مسمار guard في PR-9 من الموجة الثانية (`platform-nav-integrity smoke`).

---

## 15. التوصية

اعتمد هذا الجرد ثم ابدأ الموجة الثانية بـPR-1 (فصل module-dashboards عن bi) — أعلى أثر يومي وأبسط نطاقًا.
