# خطة تعميم نمط AllowCreateDrawer على المسارات المتبقية

> **التوجيه:** عمّم نمط AllowCreateDrawer على المسارات المتبقية.
> **التاريخ:** 2026-06-18 · **المدير:** الجلسة الرئيسية (وضع تعميم التوجيهات) · **الحالة:** ✅ **مكتمل بالكامل** — 10 محدِّدات على نمط الدرج: الإعدادات (قسم+فرع) + المشاريع + العملاء + المركبات (سائق+مركبة) + المالية (حساب + مورّد + مركز تكلفة) + HR-الموظف. **مُتخطّى موثّقًا:** المستودع-مورّد و HR-التنظيم (لا صفحة إنشاء غنية → إنشاؤها السريع = الكامل).

## سجلّ التنفيذ

- **2026-06-18 — الدفعة 0 (الأساس) + طيّار القسم:** بنيت المكوّن العرضي العام
  `components/shared/allow-create-drawer.tsx` (سجلّ `ENTITY_CREATE_FORMS` كسول +
  عقد `EmbeddedCreateFormProps`)، واستخرجت نموذج القسم الكامل إلى
  `pages/settings/department-form.tsx` (اسم + فرع + قسم أب + مدير + حالة)،
  وأعدت تركيب `DepartmentsTab` ليستهلكه (مصدر واحد، بلا تكرار)، وأضفت
  `createEntityKind` للمصنع ووصّلت `DepartmentSelect`. اختبار رندرة جديد
  `allow-create-drawer.test.tsx`.
  - **التحقق:** typecheck ✅ · vitest كامل 84/84 ✅ · ratchet (api-server) 23/23 ✅ ·
    audit-domain-boundaries ✅ · check-audit-coverage (0 فجوات جديدة) ✅ · wiring ✅.
  - **الفرع (Branch):** مؤجَّل للدفعة التالية — يحتاج `companyId` إلزامي + استخراج
    نموذج FormShell من `BranchesTab`.

- **2026-06-19 — الدفعة B1 (الفرع) — مكتملة:** استخراج `pages/settings/branch-form.tsx`
  (النموذج الكامل **مع `companyId` الإلزامي** الذي كان الإنشاء السريع يُسقطه → كان يُنتج
  فرعًا نصف منشأ)، وإعادة تركيب `BranchesTab` ليستهلكه، وتسجيل `branch` في
  `ENTITY_CREATE_FORMS`، وتوصيل `BranchSelect`. **بهذا اكتمل مسار الإعدادات** (القسم + الفرع).
  - **التحقق:** typecheck ✅ · vitest 85/85 ✅ · ratchet (api-server) 23/23 ✅ ·
    audit-domain-boundaries ✅ · wiring ✅ · check-audit-coverage (0 فجوات جديدة) ✅.

- **2026-06-19 — الدفعة B2 (المشاريع) — مكتملة:** استخراج `pages/create/project-create-form.tsx`
  (النموذج الكامل: عميل/مدير/ميزانية/تواريخ/وصف + بطاقات السياق ومعاينة الأثر) وتحويل
  `projects-create.tsx` إلى غلاف رفيع يستهلكه، وتسجيل `project` في `ENTITY_CREATE_FORMS`،
  وتوصيل `ProjectSelect` (وإسقاط حقل `code` الوهمي الذي يتجاهله الخادم).
  - **التحقق:** typecheck ✅ · vitest 85/85 ✅ · audit-domain-boundaries ✅ · wiring ✅.
  - **ملاحظة:** نموذج المشروع مشتقّ من صفحة ويعتمد مزوّدات التطبيق (AuthProvider/DatePicker)،
    فيُتحقَّق منه بـtypecheck + إعادة استخدام الصفحة له، لا باختبار رندرة معزول.

- **2026-06-19 — الدفعة B3 (العملاء) — مكتملة:** استخراج `pages/create/client-create-form.tsx`
  (النموذج الكامل + حساب بوابة اختياري)، غلاف رفيع للصفحة، تسجيل `client`، توصيل `ClientSelect`
  (مع الحفاظ على serverSearch #2134). نُقلت حالة «بتر الحقول الفارغة #2134» في الاختبار إلى
  `VendorSelect` (لأن ClientSelect صار على الدرج). تحقق: typecheck ✅ · vitest 85/85 ✅ · حدود ✅ · wiring ✅.

- **2026-06-19 — الدفعة B4 (المركبات/Fleet) — مكتملة:** استخراج `fleet/driver-create-form.tsx`
  (هوية رخصة KSA + ربط موظف) و`fleet/vehicle-create-form.tsx` (الملف الفني الكامل)، غلافان رفيعان،
  تسجيل `driver`+`vehicle`، توصيل `DriverSelect`+`VehicleSelect`.
  تحقق: typecheck ✅ · vitest 85/85 ✅ · حدود ✅ · wiring ✅ · audit-coverage 0 جديدة ✅.

- **تخطٍّ مبدئي (موثّق):** `SupplierSelect` (/warehouse/suppliers) و HR-التنظيم
  (`JobTitle`/`Position`/`Team`/`Committee`) **لا تملك صفحة إنشاء غنية** — إنشاؤها السريع
  (QuickCreateDialog) يساوي نموذجها الكامل، فالتحويل تجميلي ويُنشئ مكوّنًا بلا داعٍ (مخالف
  لقاعدة 5: لا تنشئ مكوّنًا جديدًا إن وُجد أصل). تُترك على QuickCreateDialog ما لم يُطلب غير ذلك.

- **2026-06-19 — التيل الثقيل/الحسّاس (المالية + HR-الموظف) — مكتمل باعتماد إبراهيم:**
  - **الحساب:** `account-create-form.tsx` (يعيد استخدام `AccountFormFields`) + **إصلاح صحّة**
    `handleCreated` ليختار بـ`getValueField` (حسابات الدليل قيمتها `code` لا `id`) + تحديث ratchet.
  - **المورّد:** وضع `embedded` إضافي في `vendor-party-form.tsx` المشترك + `vendor-create-form.tsx`؛
    نُقل اختبار «بتر #2134» إلى `SupplierSelect`.
  - **مركز التكلفة:** `cost-center-form.tsx` + صفحة الإدارة تستهلكه (إزالة تكرار الـDialog).
  - **HR-الموظف:** `git mv` صفحة 964 سطرًا → `employee-create-form.tsx` بوضع `embedded`
    (يخفي wizard + شاشة النجاح، يعطّل `allowCreate` المتداخل لمنع تكرار الأدراج) +
    `EmployeeCreateDrawerForm` للدرج + صفحة رفيعة. الصفحة تحتفظ بالتجربة الكاملة.
  - **التحقق (لكل دفعة):** typecheck ✅ · vitest 85/85 ✅ · ratchet 23/23 ✅ · حدود ✅ · wiring ✅.
  - **حدود معروفة (وافق عليها إبراهيم بـ«فرض الموظف في الدرج»):** درج الموظف لا يعرض شاشة
    الاعتماد/بيانات الدخول (تبقى للصفحة)، ويُعطَّل الإنشاء المتداخل داخله.

---

## 1) المواصفة (Phase 1)

### القاعدة بالضبط
أي محدِّد كيان (`*Select`) فيه إجراء «+ جديد» يجب أن يفتح **نموذج الإنشاء الموحّد الكامل لذلك الكيان داخل درج (Drawer/Sheet)** — نفس مكوّن صفحة الإنشاء بكل محرّكاته والتحقق وAudit/Event — لا نموذجًا مصغّرًا. عند الحفظ يعيد معرّف الكيان للأب فيُحدَّد تلقائيًا. المبدأ: **«لا كيان نصف منشأ»**.

### علامة الانطباق (Applies marker)
- مكوّن `*Select` (أو منتقٍ مضمَّن) فيه `allowCreate` / `onCreateNew` / زر «+ ... جديد».

### علامة المخالفة (Violation marker)
- الإجراء يفتح **`QuickCreateDialog`** (مودال مصغّر ببضعة حقول من `createFields`) بدل النموذج الكامل في درج.
- الخطورة الأعلى حين تكون حقول الإنشاء السريع **أقل** من حقول النموذج الكامل للكيان (بتر حقول مهمة → كيان ناقص).

### شكل الموضع المُصحَّح (Fixed shape)
- المنتقي يفتح `AllowCreateDrawer(entityKind)` الذي يحمّل (lazy) **نموذج الإنشاء الكامل المضمَّن** للكيان عبر سجلّ `ENTITY_CREATE_FORMS`.
- النموذج المضمَّن يحترم عقد `embedded?: boolean` + `onCreated?: (id) => void`، ويستخدم `draftKey` مستقلًّا حتى لا يصطدم بمسودة الصفحة.
- يُحافَظ حرفيًا على سلوك #2134 (ظهور الكيان المُنشأ فورًا عبر `mergeEntityOptions` + `serverSearch`).

### العيوب كقيود اختبار (Flaws → test constraints) — مملوءة من قِبل المدير
1. **انحدار #2134:** الكيان المُنشأ من الدرج يجب أن يظهر فورًا ويُحدَّد قبل اكتمال refetch. → اختبار: بعد `onCreated`، يحوي المنتقي الخيار الجديد ومحدَّدًا.
2. **بتر الحقول:** الدرج يجب أن يقدّم نفس حقول صفحة الإنشاء (لا أقل). → اختبار: عدد/مفاتيح حقول النموذج المضمَّن = صفحة الإنشاء.
3. **تصادم المسودات:** `draftKey` الدرج ≠ `draftKey` الصفحة. → اختبار: مفتاحان مختلفان.
4. **RBAC:** إظهار «+ جديد» مشروط بصلاحية إنشاء ذلك الكيان (مثل `finance.vendors:create`)؛ والإنشاء يمرّ بنفس endpoint الذي يفرض الصلاحية خادميًا. → قيد: لا توسيع صلاحيات؛ إخفاء الزر عند انعدام الصلاحية (تحسين، ليس توسعة).
5. **Audit/Event:** الإنشاء من الدرج يمرّ بنفس POST endpoint للصفحة فيُصدر نفس Audit/Event. → بوّابة: `check:audit-coverage` يبقى أخضر.
6. **opt-out مقصود:** كيانات عطّلت الإنشاء السريع عمدًا (مثل `EmployeeCategorySelect`) لا تُحوَّل تلقائيًا — تبقى كما هي حتى قرار مالكها.
7. **حجم الحزمة:** السجلّ يحمّل النماذج عبر `React.lazy` فقط، حتى لا ينتفخ كل نموذج بكل نماذج الكيانات.
8. **حدود المسار:** استخراج النموذج المضمَّن لكل كيان يتم **داخل المسار المالك فقط**؛ التعديل في `entity-selects.tsx` يقتصر على ربط `entityKind` (سطر إعداد)، بلا منطق أعمال.

---

## 2) نتيجة المسح (Phase 2 — قراءة فقط)

### التنفيذ المرجعي (الوحيد المكتمل)
- `artifacts/ghayth-erp/src/components/shared/product-select.tsx` — يفتح `Sheet` يحمل النموذج الكامل.
- `artifacts/ghayth-erp/src/components/shared/product-create-form.tsx` — النموذج المضمَّن (عقد `onCreated`/`draftKey`/`showAttachments`).
- اختبار رندرة: `artifacts/ghayth-erp/src/components/shared/product-select.test.tsx`.
- مُتبنّى في: `pages/create/finance/invoices-create.tsx` و `pages/create/warehouse/movements-create.tsx`.
- **غير مُتبنّى** في `purchase-orders-create.tsx` (خطوة وثيقة التصميم §3 ناقصة).

### الفجوة
- **لا يوجد** مكوّن عرضي عام `allow-create-drawer.tsx`، ولا سجلّ `ENTITY_CREATE_FORMS`.
- جميع محدِّدات `entity-selects.tsx` تفتح `QuickCreateDialog` المصغّر (السطر 33 تعريفًا، 298 استخدامًا).
- لا يوجد نموذج إنشاء مضمَّن لأي كيان غير المنتج (منطق الإنشاء الكامل يعيش في صفحات الإنشاء المستقلة).

### البنية التحتية للاختبار (تصحيح لوثيقة التصميم)
- وثيقة `docs/finance/FINANCE_PRODUCTSELECT_AND_ALLOWCREATE_DRAWER_PLAN.md` تقول «لا harness رندرة». **هذا قديم**: `artifacts/ghayth-erp/vitest.config.ts` موجود و`"test": "vitest run"` موجود. فبوّابة §4 صارت متاحة.

### خريطة التغطية (المحدِّدات في entity-selects.tsx)

| المحدِّد | المسار المالك | endpoint | الحالة | فجوة البتر |
|---|---|---|---|---|
| ProductSelect | المستودع | /warehouse/products | ✅ مُحوّل (مرجع) | — |
| BranchSelect | الإعدادات | /settings/branches | ❌ QuickCreate | صغيرة |
| DepartmentSelect | الإعدادات | /settings/departments | ❌ QuickCreate | صغيرة |
| ProjectSelect | المشاريع | /projects | ❌ QuickCreate | متوسطة |
| ClientSelect | العملاء (CRM) | /clients | ❌ QuickCreate (serverSearch) | متوسطة |
| DriverSelect | المركبات | /fleet/drivers | ❌ QuickCreate | متوسطة |
| VehicleSelect | المركبات | /fleet/vehicles | ❌ QuickCreate | كبيرة |
| SupplierSelect | المستودع | /warehouse/suppliers | ❌ QuickCreate | متوسطة |
| EmployeeSelect | الموارد البشرية | /employees | ❌ QuickCreate | كبيرة |
| JobTitleSelect | الموارد البشرية | /employees/job-titles | ❌ QuickCreate | صغيرة |
| PositionSelect | الموارد البشرية/التنظيم | /org/positions | ❌ QuickCreate | متوسطة |
| TeamSelect | الموارد البشرية/التنظيم | /org/teams | ❌ QuickCreate | صغيرة |
| CommitteeSelect | الموارد البشرية/التنظيم | /org/committees | ❌ QuickCreate | صغيرة |
| EmployeeCategorySelect | الموارد البشرية/التنظيم | /org/employee-categories | ⏸️ opt-out مقصود | — |
| VendorSelect | المالية | /finance/vendors | ❌ QuickCreate | متوسطة |
| AccountSelect / PostingAccountSelect / AccountIdSelect | المالية | /finance/accounts | ❌ QuickCreate | متوسطة (إعداد حسّاس) |
| CostCenterMasterSelect | المالية | /finance/cost-centers | ❌ QuickCreate | متوسطة (إعداد حسّاس) |
| CostCenterSelect (مركّب) | المالية | — | غير منطبق (لا إنشاء) | — |

### تصنيف «يمس الدفتر؟»
- **كل** الإنشاءات أعلاه **بيانات أساسية/إعداد** (عميل/مورد/منتج/حساب/مركز تكلفة…). إنشاؤها **لا يُرحِّل قيدًا محاسبيًا** → **تشغيلية، لا تمس الدفتر**.
- ملاحظة حسّاسية: حساب دليل الحسابات ومركز التكلفة (المالية) إعداد يعتمد عليه الترحيل لاحقًا → تشغيلي لكنه **يتطلّب عناية إضافية** ومراجعة مالك المالية. (لا يحتاج بوّابة «نعم» المحاسبية لأنه ليس قيدًا.)

---

## 3) التصنيف والدفعات (Phase 3)

> القيد البنيوي: المحدِّدات كلها تُبنى من مصنع واحد `buildEntitySelect` في ملف مشترك. للتحويل **دفعة دفعة** نضيف في الأساس حقلًا اختياريًا `createEntityKind` إلى `EntitySelectConfig`؛ عند وجوده يفتح المصنع `AllowCreateDrawer(kind)` بدل `QuickCreateDialog`. هكذا نحوّل محدِّدًا واحدًا في كل دفعة ويبقى `QuickCreateDialog` احتياطيًا لغير المحوَّل.

### الدفعة 0 — الأساس (عرضي/معماري) ⛔ تحتاج اعتماد إبراهيم
- **العمل:** بناء `components/shared/allow-create-drawer.tsx` + سجلّ `ENTITY_CREATE_FORMS` (React.lazy) + عقد `embedded`/`onCreated` + حقل `createEntityKind` في المصنع.
- **المالك:** بنية عرضية مشتركة (components/shared).
- **النوع:** معماري عرضي — يفرض عقدًا على نماذج كل المسارات.
- **المخاطرة:** عالية (cross-cutting). يقع تحت «أمور يجب إيقافها: تغيير معمارية المسارات» + قاعدة 15 (لا refactor واسع داخل مهمة صغيرة) → **وقف واعتماد**.
- **البوّابة:** اعتماد معماري صريح + اختبار رندرة للمكوّن + `audit-domain-boundaries` أخضر.

### دفعات لكل مسار مالك (تشغيلية — تبدأ بعد اعتماد الأساس وتأكيد عام)
كل دفعة = استخراج نموذج الإنشاء الكامل المضمَّن لكيان واحد **داخل مسار مالكه** + تسجيله + ضبط `createEntityKind` لمحدِّده. مرتّبة من الأقل خطرًا:

| # | الدفعة | المسار المالك | الكيانات | المخاطرة |
|---|---|---|---|---|
| B1 | الإعدادات | الإعدادات | Branch, Department | منخفضة (مرشّح تجربة) |
| B2 | المشاريع | المشاريع | Project | منخفضة |
| B3 | العملاء | العملاء (CRM) | Client (احفظ #2134) | متوسطة |
| B4 | المركبات | المركبات | Driver, Vehicle | متوسطة |
| B5 | المستودع | المستودع | Supplier | متوسطة |
| B6 | الموارد البشرية | الموارد البشرية | Employee, JobTitle, Position, Team, Committee | متوسطة-عالية |
| B7 | المالية | المالية | Vendor, Account(×3), CostCenter | عالية (إعداد مالي حسّاس — مراجعة مالك المالية) |

- **opt-out:** `EmployeeCategorySelect` يبقى كما هو (إنشاء سريع معطّل عمدًا) حتى قرار مالكه.

### بوّابة كل دفعة (Phase 6)
1. `npm --prefix artifacts/ghayth-erp run typecheck`
2. `npm --prefix artifacts/ghayth-erp run test` (يشمل اختبار رندرة للمحدِّد المحوَّل: ظهور+تحديد الكيان الجديد، وتطابق حقول النموذج المضمَّن مع الصفحة)
3. `node scripts/src/audit-domain-boundaries.mjs`
4. `node scripts/src/check-audit-coverage.mjs`
- أي فشل → **تراجُع فوري عن الدفعة**، لا تُترك نصف مطبّقة.

---

## 4) الفرز والاعتماد (Phase 4)

- **نقطة الوقف الحالية:** الدفعة 0 (الأساس) معمارية → **لا تُنفَّذ بلا اعتماد صريح من إبراهيم**.
- الدفعات B1–B7 **تشغيلية لا تمس الدفتر** → تبدأ بعد اعتماد الأساس + تأكيد عام، دفعة دفعة مع تقرير بعد كلٍّ.
- لا توجد دفعة «تمس الدفتر» في هذا التوجيه (كلها بيانات أساسية/إعداد).

## القيود الصارمة المطبّقة
- ⛔ لا تطبيق شامل دفعة واحدة — دفعة دفعة.
- ⛔ لا كتابة خارج المسار المالك (عدا سطر ربط `createEntityKind` في الملف المشترك).
- ⛔ لا توسيع RBAC؛ فقط إخفاء زر الإنشاء عند انعدام الصلاحية.
- ✅ كل تغيير يحمل أثره (actor + وقت + سبب + diff + موضع).
- ✅ سلامة المعمارية مقدّمة على السرعة.
