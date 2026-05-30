# تدقيق ظهور الصفحات وكشف الخدمات (Page Visibility & Service Exposure)

> **نوع التقرير:** تدقيق فقط — لا تعديلات على الكود.
> **النطاق:** الواجهة الأمامية (sidebar + route gates + page-level guards) مقابل الخادم (authorize/requireModule/requireMinLevel/requirePermission).
> **المراجع المؤسسية:** قضية #1418 (الأساس) وقضية #1413 (توحيد المستخدمين والأدوار والصلاحيات والرؤية).
> **مصادر الأدلة الرئيسية:**
> - `artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx` (1647 سطر — جدول `allNavSections` ومرشّح `useFilteredNavSections`).
> - `artifacts/ghayth-erp/src/contexts/app-context.tsx` (نمذجة الأدوار والوحدات + `canAccessModule`/`canAccessSubPage`/`isFeatureEnabled`/`can`).
> - `artifacts/ghayth-erp/src/App.tsx` (المكوّن `ModuleRoute` يطبّق الإقفال على مستوى الصفحة).
> - `artifacts/ghayth-erp/src/routes/*Routes.tsx` (تسجيل المسارات وربط الـ `module`/`minRoleLevel`/`subKey` بكل صفحة).
> - `artifacts/api-server/src/routes/index.ts` (تركيب الـrouter وتطبيق الـguards).
> - `artifacts/api-server/src/middlewares/roleGuard.ts` و `permissionMiddleware.ts` (سلوك الـguards الفعلي).

---

## مخطّط مستويات الأدوار الفعلي (مهم لقراءة باقي التقرير)

سياق المهمّة افترض السلّم الكلاسيكي (10/20/30/40/50/60/70/80/90/99). الواقع في الكود **مختلف** ومستويات قليلة فقط مأخوذة فعلًا من `user_roles.level`. الجدول التالي مأخوذ مباشرة من `artifacts/api-server/src/middlewares/roleGuard.ts:9-24`:

| المستوى | المفتاح في الـbackend | المقابل في الـsidebar |
|---:|---|---|
| 100 | `owner` | بايباس كامل (`scope.isOwner`) |
| 90 | `general_manager` | المسؤول (`/admin`، `/permissions`، `/rbac/v2`) |
| 70 | `hr_manager`, `finance_manager`, `fleet_manager`, `property_manager`, `projects_manager`, `warehouse_manager`, `legal_manager`, `support_manager`, `crm_manager`, `bi_manager` | الإعدادات (`/settings`)، الأحداث، التدقيق، لوحة التنفيذ |
| 60 | `branch_manager` | مرئي في الـsidebar كـ"تنفيذي" (`/exec-dashboard`، `/governance`، `/automation`) |
| 40 | — (لا يوجد دور بهذا المستوى افتراضيًا) | لوحات الإدارة، التقارير المجدولة، البريد الرسمي للإدارة |
| 30 | — | حد أدنى لتصدير البيانات |
| 20 | — | حد أدنى للتقويم ومركز القرارات |
| 10 | `employee` | الموظف العادي (المستوى الافتراضي) |

> **تنبيه أساسي للتقرير كله:** السلّم الفعلي يقفز من 10 (موظف) إلى 60 (مدير فرع) ثم 70 (مدراء وحدات) ثم 90 (مدير عام) ثم 100 (مالك). كل عتبات الـsidebar (`minRoleLevel: 40` / `50` / `30` / `20`) تعتمد على إسناد مخصّص في `user_roles.level` وليست موجودة بشكل افتراضي في `ROLE_LEVELS`. هذا أكبر مصدر مفاجآت في الرؤية: عبارة `minRoleLevel: 40` في الـsidebar تعني فعليًا «أي شخص لم يُسنَد له صف يدوي في `user_roles` بمستوى ≥40 لن يراها» — وليس «مدير».

---

## 1. ملخص (counts)

- **عدد الصفحات المسجّلة في المسجِّل المركزي** (`registry.ts`): مأخوذة من الـregistry والمسارات: ~**578 ملف صفحة** في `src/pages/**` و~**16 ملف توجيه** (`routes/*Routes.tsx`).
- **عدد الصفحات الظاهرة في الـsidebar (allNavSections)**: ~**245 مدخلًا** (بعد عدّ القائمة المسطّحة `getAllNavigationPages`)، موزّعة على **8 أقسام رئيسية**: الرئيسية / بوابة الموظف / الموارد البشرية / المالية والمحاسبة / العمليات / العلاقات / الإدارة والحوكمة / النظام.
- **الصفحات ذات بوابة صلاحيّة دقيقة (`perm` على مستوى المدخل)**: **~45 مدخلًا** — كلها تقريبًا في قسم "النظام / مدير النظام" (`/admin/*`)، إضافة إلى أربعة مداخل في الإعدادات وأربعة في "التقارير المجدولة/سجل المطبوعات/موافقات إعادة الطباعة/الأتمتة".
- **الصفحات بدون أي بوابة (لا `module`، لا `minRoleLevel`، لا `perm`)**: **~28 مدخلًا** — يشمل ذلك "كل الخدمات" (`/services`)، "مساحاتي" (`/my-space`/`/workspace`/`/notifications`)، "كل طلباتي" (`/my-requests`)، "حضوري وانصرافي" (`/my-attendance`)، "كشف راتبي" (`/my-payslip`)، "سلفي" (`/my-loans`)، "ساعاتي الإضافية" (`/my-overtime`)، "تقييمي" (`/my-performance`)، "مستنداتي" (`/my-documents`)، "مركز القرارات" (`/action-center` بدون مستوى)، و"التقويم الموحد".
- **تباين موثَّق بين الواجهة والـbackend**: **9 حالات تباين رئيسية** موضّحة في القسم 5 (سيدبار ≠ backend في مستوى أو في perm).
- **صفحات لا backend لها أصلًا**: **4 مداخل sidebar** (مثل `/manager-board`، `/services`، `/manager-workspace`)، تظهر للمستخدم لكن لا تقابلها API تحت نفس المسار — الصفحة تعمل ولكن نداءاتها الداخلية تذهب إلى نقاط أخرى وفق منطقها.

---

## 2. مصفوفة الأدوار والظهور

> الجدول يلخّص تقاطع مستوى الدور مع وحدات النظام. القراءة: "عدد المداخل المرئية" = عدد المداخل في الـsidebar التي يجتاز هذا المستوى (مع الوحدات المسموح بها لذلك الدور حسب `ROLE_DEFAULT_MODULES` في `roleGuard.ts:26-41`).

| الدور | المستوى | الوحدات المسموح بها (افتراضي) | الأقسام المرئية بالكامل | الأقسام المخفية كليًا | ملاحظات الرؤية |
|---|---:|---|---|---|---|
| `owner` | 100 | كل الـ20 وحدة | كل الأقسام (8) | لا شيء | بايباس كامل عبر `scope.isOwner` |
| `general_manager` | 90 | 19 وحدة (بدون admin/reports خاصة) | كل الأقسام بما فيها "مدير النظام" بنوع `admin:list`/`admin:view`/`admin:update` | — | يستحوذ على جميع المداخل الإدارية |
| `hr_manager` | 70 | `home, hr, requests, documents, comms` | الرئيسية + بوابة الموظف + HR كاملًا + مراكز التحكم + الإقفال اليومي + لوحة الإدارة + سجلات التدقيق (60-70) | المالية، الأسطول، الأملاك، العمرة، CRM، Store، BI، Governance، Legal، Admin | لن يرى "الإعدادات" (يتطلب 70 + module=settings — غير موجودة في وحداته) — **divergence محتمل** |
| `finance_manager` | 70 | `home, finance, requests, documents, comms` | المالية بالكامل + الإقفال اليومي + التقارير المالية + لوحة الإدارة + سجلات التدقيق | HR، الأسطول، الأملاك، العمرة، إلخ | لن يرى "الإعدادات" — لا يملك module=settings |
| `fleet_manager` | 70 | `home, fleet, requests, documents, comms` | الأسطول بالكامل + لوحة الإدارة | HR، المالية، إلخ | "إدارة الأسطول" + 21 صفحة فرعية |
| `property_manager` | 70 | `home, property, requests, documents, comms` | الأملاك بالكامل + لوحة الإدارة | HR، المالية، إلخ | 14 مدخلًا تحت "إدارة الأملاك" |
| `projects_manager` | 70 | `home, operations, requests, documents, comms` | المشاريع، العمرة (مرتبطة بـoperations في الـbackend)، مركز العمليات | غير ذلك | **تنبيه:** سترى العمرة لأن backend يربطها بـ"operations" — راجع القسم 5 |
| `warehouse_manager` | 70 | `home, warehouse, store, requests, documents, comms` | المستودعات + المتجر + لوحة الإدارة | غير ذلك | — |
| `legal_manager` | 70 | `home, legal, governance, requests, documents, comms` | الشؤون القانونية + الحوكمة (مستوى 60) + لوحة الإدارة | غير ذلك | — |
| `support_manager` | 70 | `home, support, requests, documents, comms` | الدعم الفني + لوحة الإدارة | غير ذلك | — |
| `crm_manager` | 70 | `home, crm, marketing, requests, documents, comms` | العلاقات (CRM + التسويق) + لوحة الإدارة | غير ذلك | — |
| `bi_manager` | 70 | `home, bi, reports, requests, documents, comms` | BI + التقارير + لوحة الإدارة + المجدولة | غير ذلك | — |
| `branch_manager` | 60 | `home, hr, finance, requests, documents, comms, support` | الرئيسية + بوابة الموظف + HR (محدود بـsubKeys `employees/attendance/leaves` فقط — راجع `roleKeySubPages` في `app-context.tsx:67`) + المالية + الدعم + الحوكمة (60) | الأسطول، الأملاك، العمرة، CRM، Marketing، Store، BI، Legal، Admin، Settings | **محدود في HR** عبر `canAccessSubPage` — لن يرى الرواتب والتقييم |
| `employee` | 10 | `home, requests, documents, comms` | بوابة الموظف فقط + "كل الخدمات" + "التقويم الموحد" (20؟) + المستندات + الطلبات + التواصل | الإدارة الكاملة، المالية، HR (تأخذ مسار `module=hr` لا توجد في وحدات الموظف) | راجع القسم 8 |

---

## 3. صفحات بمستوى أعلى من اللازم (over-gated)

> هذه الصفحات يصعب الوصول إليها على الطبقة التي ينبغي أن تشاهدها وفق غرضها العملي.

| الصفحة | الموقع الحالي في الـsidebar | المستوى/الصلاحية الفعلية | لماذا يُعتبر زيادة |
|---|---|---|---|
| `/exec-dashboard` (لوحة القيادة التنفيذية) | `sidebar-layout.tsx:100` — `minRoleLevel: 60` تحت "لوحات الإدارة" | الـbackend (`routes/index.ts:455`) يفرض **70** (`requireMinLevel(70)`) | السيدبار يَعِد المدير الفرعي (60) بأن يراه، لكن الـAPI ترفض. وصول الصفحة دون بيانات. |
| `/automation` | `sidebar-layout.tsx:608` — `minRoleLevel: 60` + perm `["admin:update","automation:write"]` (any) | الـbackend (`routes/index.ts:367`) يحتاج `module=automation` فقط (لا مستوى) — لكن وحدة "automation" غير ممنوحة افتراضيًا لأي دور في `ROLE_DEFAULT_MODULES` | الصفحة لن تظهر إلا لـowner أو من يُسنَد له `automation:write` يدويًا. خدمة كبيرة محبوسة بصمت. |
| `/governance` (الحوكمة والامتثال) | `sidebar-layout.tsx:528` — `minRoleLevel: 60` | الـbackend (`routes/index.ts:374`) يحتاج فقط `module=governance` | المدير الفرعي (60) يستوفي مستوى السيدبار لكن وحداته الافتراضية لا تشمل governance إلا لـlegal_manager/general_manager — العاملون في الحوكمة لن يصلوها إن لم تُمنح وحداتهم. |
| `/manager-board` / `/manager-workspace` | sidebar 40 / 40 | لا route backend مطابق — **client-only** | الـsidebar يربط البوابة بمستوى 40 لكن لا يوجد مستوى 40 في `ROLE_LEVELS`. النتيجة: لن يراها أحد بين `employee:10` و`branch_manager:60` بدون إسناد مستوى يدوي. |
| `/reports/scheduled` (التقارير المجدولة) | sidebar 40 + perm `["bi:read","reports:read"]` any | backend **50** (`routes/index.ts:447`) | divergence — السيدبار يرفع بوابة العرض إلى 40 لكن الـAPI يطلب 50. |
| `/manager-board/reprint-approvals` (موافقات إعادة الطباعة) | sidebar 40 + perm `print:reprint:approve` | backend `requirePermission("print:reprint:approve")` في `print.ts:886` — لا مستوى | divergence — السيدبار يضيف عتبة 40 بدون داعٍ، يكفي امتلاك الـperm. |
| `/operations-center` | sidebar 40 | backend 40 + module operations | متوافق لكن **لا يوجد دور افتراضي عند 40** — يتطلّب إسنادًا يدويًا في `user_roles.level`. عمليًا مرئي فقط للمدراء (60+). |
| `/calendar` (التقويم الموحد) | sidebar 20 | backend بلا حماية على `routes/index.ts:457` — متاح لأي مصادَق | divergence معكوس: السيدبار يخفي عن مستوى <20 لكن الـAPI متاح للجميع. |
| `/events` (سجل الأحداث، غير موجود في sidebar) | لا مدخل sidebar | backend 70 | غير معرَّضة في الواجهة رغم أنها مهمة للمراقبة. |

---

## 4. صفحات بمستوى أقل من اللازم (under-gated)

| الصفحة | بوابة السيدبار | بوابة الـbackend الفعلية | المخاطرة |
|---|---|---|---|
| كل صفحات `/admin/*` الفرعية (السياسات، PDPL، التوقيع الرقمي، التكاملات، AI Governance) | sidebar يفرض `perm: "admin:list"`/`"admin:view"`/`"admin:update"` على كل مدخل فرعي | backend يفرض فقط `requireMinLevel(90) + requireModule("admin")` على `/admin` و`/admin/observability` و`/admin/ai-governance` و`/admin/communication-control` و`/admin/pbx-control` و`/admin/master-plan` و`/admin/notification-routing` و`/admin/vendor-settings`. **لا يوجد `requirePermission` داخل routers الإدمن** | أي مستخدم بمستوى ≥90 ومعه وحدة admin يستطيع استدعاء أي endpoint إدمن مباشرة. السيدبار يخفي المدخل عن من لا يملك الـperm لكن الـDirect-URL يصل. **عرضة لـbypass عبر الـURL المباشر.** |
| `/admin/logs` (سجل المراجعة) | sidebar يفرض `perm: ["audit:read","admin:read"]` any | backend `/audit-logs` يفرض فقط `requireMinLevel(70)` (`routes/index.ts:418`) | **منخفض جدًا** — أي مدير وحدة عند 70 يصل لكامل سجل المراجعة دون الـperm. سيدبار يموّه بإخفائه. |
| `/activity-log` | لا minRoleLevel في sidebar (متاح للجميع تحت "سجلات التدقيق") | backend `requireMinLevel(70)` | السيدبار لا يحمي = موظف 10 سيرى المدخل ثم يستلم 403. |
| `/automation` | sidebar 60 + perm | backend `module=automation` بلا مستوى | **بايباس URL** ممكن لأي صاحب وحدة automation وإن كان مستوى <60. |
| `/permissions/my` و`/rbac/v2` (إدارة الأدوار) | لا مدخل sidebar (مرئية ضمن `/admin/rbac-matrix` + sidebar perm `admin.roles:view`/`admin.roles:update` any) | backend `requireMinLevel(90)` فقط | السيدبار يفرض perm، الـbackend يكتفي بالمستوى — divergence: مستوى 90 بدون الـperm يصل. |
| كل صفحات `/finance/*` التي تتعامل مع GL أو reverse | لا منع خاص في السيدبار سوى `module=finance` | backend `requireModule("finance") + requireGuards("financial")` (راجع `routes/index.ts:330-346`) | متطابق ظاهريًا، لكن **لا يوجد فحص level**. أي شخص بـ`module=finance` (مثلاً موظف يحاسبة منخفض رتبيًا) يصل لإقفال السنة وأرصدة افتتاحية — **خطر مالي**. ينبغي رفع `minRoleLevel` على الصفحات الحساسة (year-end-close، opening-balances، journal-manual) أو إضافة `requireMinLevel(70)` على الـbackend. |
| `/notifications`، `/calendar`، `/my-space`، `/workspace`، `/action-center` | لا minRoleLevel | لا حماية backend | متعمَّد ولكن `/action-center` يحتوي قائمة الموافقات الإدارية — موظف يراها كقائمة فارغة. **انطباع غير دقيق**. |

---

## 5. تباين بين الواجهة والـbackend (Sidebar/Backend Mismatch)

| المسار | بوابة السيدبار | بوابة الـbackend | نوع التباين |
|---|---|---|---|
| `/exec-dashboard` | `minRoleLevel: 60` | `requireMinLevel(70)` | **سيدبار أوسع** — مدير فرعي يرى الرابط ثم يحصل 403. |
| `/automation` | `minRoleLevel: 60` + perm `admin:update\|automation:write` (any) | `requireModule("automation")` فقط | **تفاوت كامل**: السيدبار يستخدم الـlevel، الـbackend يستخدم الـmodule. وحدة "automation" غير ممنوحة لأي دور افتراضي. |
| `/reports/scheduled` | `minRoleLevel: 40` + perm `bi:read\|reports:read` | `requireMinLevel(50)` | السيدبار أوسع بمستوى. |
| `/admin/*` (كل الـ45 مدخلًا) | كل مدخل له `perm` دقيق (`admin:list`, `admin:view`, `admin:update`, `audit:read`, `admin.roles:view`, إلخ) | router يفرض فقط `requireMinLevel(90)+requireModule("admin")` — **لا أحد من الـperms مفروض في الـbackend** | السيدبار يحاول إخفاء بدقة، لكن لا backend enforcement. **direct-URL bypass خطر**. |
| `/admin/logs` ⇄ `/api/audit-logs` | sidebar perm `audit:read\|admin:read` | backend `requireMinLevel(70)` | الـbackend أوسع: مدير وحدة (70) بلا الـperm يصل. |
| `/permissions/*` و`/rbac/v2` (تستخدمها صفحة `/admin/rbac-matrix` و`/admin/roles`) | sidebar perm `admin.roles:view\|admin.roles:update` (any) | backend `requireMinLevel(90)` فقط | divergence: السيدبار يفرض perm، الـbackend مستوى. |
| `/umrah` | sidebar `module: "umrah"` | backend `requireModule("operations")` | **تفاوت دلالي**: الواجهة تتحدث عن وحدة "umrah" مستقلّة لكن backend يجمعها مع "operations". الموظف الذي يملك وحدة "operations" يحصل على الـAPI ولكن لا يرى المدخل لو لم تُمنح له وحدة "umrah" أيضًا. |
| `/manager-board`, `/services`, `/manager-workspace` | sidebar يفرض `minRoleLevel: 40` على الإدارة | لا route backend مماثل (مكوّن React محلي بالكامل) | السيدبار يصف منطقًا للوصول لا يقابله API. |
| `/calendar` | sidebar `minRoleLevel: 20` | backend بلا حماية | divergence: السيدبار يخفي عن المستوى <20 (إن وُجد)، الـbackend يكشف لأي مصادَق. |
| `/finance/year-end-close`, `/finance/opening-balances`, `/finance/journal-manual` | sidebar `module: "finance"` فقط بدون عتبة مستوى | backend `requireModule("finance") + requireGuards("financial")` بدون عتبة مستوى | **مخاطرة:** عمليات مدمّرة مالياً، أي مستخدم بـmodule=finance يصل. |

---

## 6. صفحات يجب أن تكون مساندة فقط (currently shown as standalone but conceptually belong inside another service)

| الصفحة | الوضع الحالي | المنطق | الانتماء المنطقي |
|---|---|---|---|
| `/finance/customer-360-sheet`, `/finance/vendor-360-sheet` | مداخل sidebar مستقلة | ملفات تجميعية لعميل/مورد | مساندة داخل صفحة العميل/المورد (`/finance/vendors/:id`) — تُفتح من سياق الجهة وليس من القائمة |
| `/finance/customer-statement-print`, `/finance/vendor-statement-print` | مدخلان sidebar | شاشات طباعة | مساندة لـ`/finance/receivables` و`/finance/vendors` على التوالي |
| `/finance/journal-quick-templates`, `/finance/journal-templates` | مدخلان sidebar مستقلان | قوالب لقيود | مساندة داخل "القيود اليدوية" (`/finance/journal-manual`) |
| `/finance/cash-position-calculator` | مدخل sidebar | حاسبة سياقية | مساندة داخل "لوحة التدفق النقدي" (`/finance/cashflow`) |
| `/finance/account-recon-workpaper`, `/finance/bank-accounts-watch` | مداخل مستقلة | شاشات سياقية للتسوية | مساندة داخل "مركز التسويات" (`/finance/reconciliation-hub`) |
| `/finance/allocation-override-log`, `/finance/overrides-report`, `/finance/allocation-results` | مداخل sidebar مستقلة (تحت "محرك التوجيه المحاسبي") | سجلات تجميعية | مساندة لكاشف التغطية (`/finance/allocation-coverage`) |
| `/finance/expense-bulk-approvals`, `/finance/expenses/multi-line`, `/finance/expenses/split` | مداخل sidebar | شاشات إدخال متقدّمة للمصروفات | مساندة داخل "المصروفات" (`/finance/expenses`) |
| `/hr/leaves/management`, `/hr/leaves/approval-chains` | مداخل sidebar | إدارة | مساندة داخل "الإجازات" |
| `/hr/attendance/reports`, `/hr/attendance/field-tracking`, `/hr/attendance/qr-scanner`, `/hr/attendance-policy` | كل واحدة مدخل مستقل | كلها تكميلية | مساندة داخل "الحضور والانصراف" |
| `/hr/recruitment/advanced`, `/hr/training/advanced`, `/hr/performance/advanced`, `/hr/violations/management` | مداخل مستقلة وُسمت "متقدم" | شاشات داخلية لخدمتها الرئيسية | مساندة داخل الخدمة الرئيسية، تظهر كنافذة "متقدّم" داخلها |
| `/fleet/telematics/*` (10 مداخل) | كل واحدة مدخل sidebar | كلها فروع telematics | يجب تجميعها كمساندة داخل "إدارة الأسطول" مع شريط tabs، وإلا تنتفخ القائمة بـ10 صفوف فرعية |
| `/umrah/sales-wizard`, `/umrah/import/legacy`, `/umrah/attachments` | مداخل مستقلة | أدوات سياقية | مساندة داخل خدمة العمرة الرئيسية |
| `/properties/owners/statement`, `/properties/guide`, `/guide/properties` | مداخل sidebar | أدلة وكشوف سياقية | مساندة — `/guide/properties` و`/properties/guide` يبدو أنهما يخدمان نفس الغرض (تكرار) |
| `/finance/reports/cash-flow-statement`, `/finance/reports/yoy`, `/finance/reports/is-trend`, `/finance/reports/is-vs-budget`, `/finance/reports/zatca`, `/finance/reports/vat-reconciliation`, `/finance/reports/wht-summary`, `/finance/reports/gl-integrity-gaps`, `/finance/reports/unmapped-lines` | كل تقرير مدخل sidebar | كلها تقارير | مساندة داخل "التقارير المالية" (`/finance/reports`) كقائمة |

---

## 7. صفحات تحتاج إخفاء حتى يكتمل الإعداد (Conditional visibility — hide until tenant setup completes)

| الصفحة | المعيار المقترح للإخفاء | لماذا |
|---|---|---|
| `/hr/wps` (نظام حماية الأجور) | إخفاء حتى يُكوَّن بنك المنشأة في `/settings/banks` + يُفعَّل ZATCA | تظهر فارغة أو خطأ "no bank configured" بدون إعداد بنكي |
| `/hr/saudi-compliance`, `/hr/saudization` | إخفاء حتى تُحدَّد بلد المنشأة = SA في settings | لا قيمة لتنانت غير سعودي |
| `/finance/wht-categories`, `/finance/wht-filing-workbench`, `/finance/reports/wht-summary` | إخفاء حتى تفعيل WHT في إعدادات الضريبة | تظهر فارغة |
| `/finance/reports/zatca`, `/finance/vat-filing-readiness`, `/admin/zatca-audits` | إخفاء حتى تكتمل بيانات ZATCA (CR، نشاط ضريبي، شهادة) | كلها تتطلّب اكتمال ZATCA onboarding |
| `/fleet/telematics/*` (الـ10 مداخل) | إخفاء حتى ربط بوابة CMSV6 في `/fleet/telematics/settings` | شاشات فارغة بدون أجهزة مربوطة |
| `/finance/fx-rates`, `/finance/fx-revaluation` | إخفاء حتى تفعيل multi-currency في settings | غير ذي صلة لمنشأة بعملة واحدة |
| `/finance/intercompany` | إخفاء حتى تكون هناك ≥2 شركة فعّالة | لا معنى لمنشأة وحيدة |
| `/umrah/*` (29 مدخلًا) | إخفاء حتى تفعيل وحدة umrah في `company_feature_flags` | معروضة الآن لكل من يملك وحدة "operations" بسبب التداخل الـbackend |
| `/properties/*` | إخفاء حتى يكون هناك مبنى/وحدة واحدة على الأقل | لوحات فارغة |
| `/store/*` | إخفاء حتى يكون هناك منتج واحد على الأقل | — |
| `/marketing` | إخفاء حتى تفعيل وحدة CRM (لأنها تعتمد على عملاء) | بدون CRM، الحملات بلا جمهور |
| `/admin/data-import`, `/admin/digital-signature` | إخفاء عن التنانت الذي لا يفعّل feature flag مناسب | خدمات مساندة محدودة |

> **آلية الإخفاء الموجودة (`isFeatureEnabled`)** في `app-context.tsx:450-453` تدعم default-ON model: أي مفتاح غير مذكور في `apiData.disabledFeatures` يكون مفعّلًا. هذا يفتح بابًا واسعًا لتطبيق هذه الإخفاءات دون تغيير الكود — فقط ملء `disabledFeatures` من خادم الإعدادات. **السيناريو الموصى به في #1413: تحويل العلاقة إلى default-OFF لتنانت جديد، مع تفعيل تدريجي.**

---

## 8. صفحات لا يجب أن يراها الموظف العادي (level 10)

> الموظف يحمل `level=10` وله افتراضيًا الوحدات `home, requests, documents, comms`. الجدول التالي يحدد الصفحات الإدارية/المالية/الأسطول/العمرة التي **يجب التأكد** أن `canAccessModule`/`isFeatureEnabled` يحجبها عنه.

| المسار | الحجب الحالي | يكفي؟ |
|---|---|---|
| `/admin/*` كل المداخل | `module=admin` + `minRoleLevel: 90` | ✅ — موظف 10 محجوب بقوة |
| `/permissions/*`, `/rbac/v2` | sidebar perm + backend min 90 | ✅ مرئي عبر `/admin/users` فقط |
| `/finance/*` كل المداخل | `module=finance` فقط | ⚠️ — أي حساب يُمنح `module=finance` (مثل محاسب مساعد عند level 10) سيرى كل المالية بما فيها إقفال السنة. **يجب إضافة `minRoleLevel: 50` على الصفحات الحساسة** |
| `/fleet/*` كل المداخل | `module=fleet` فقط | ⚠️ مشابه — لا يفصل سائق عن مدير الأسطول |
| `/properties/*` كل المداخل | `module=property` فقط | ⚠️ مشابه |
| `/umrah/*` كل المداخل | `module=umrah` (frontend) + `module=operations` (backend) | ⚠️ **تباين**: موظف بـ`operations` يصل لـAPI، وموظف بـ`umrah` يرى الـsidebar — كلاهما طريق مختلف |
| `/hr/payroll`, `/hr/gratuity`, `/hr/wps`, `/hr/loans` | `module=hr` + `subKey=payroll` | ⚠️ — `branch_manager` (60) محجوب صراحة عبر `roleKeySubPages` لكن `hr_manager` (70) يرى. للموظف 10 بدون module=hr محجوب. |
| `/hr/saudization`, `/hr/saudi-compliance` | `module=hr` فقط | ⚠️ — يفترض أن يُحدَّد بـperm أدق (Saudi data sensitive) |
| `/exec-dashboard`, `/manager-board`, `/manager-workspace` | `minRoleLevel: 60/40` | ✅ موظف 10 محجوب |
| `/action-center`, `/operations-center` | `/action-center` بدون مستوى، `/operations-center` 40 | ⚠️ — موظف 10 يرى مدخل "مركز القرارات" لكنه فارغ — انطباع سيئ |
| `/governance/*` | `module=governance` + level 60 | ✅ محجوب |
| `/bi/*` | `module=bi` + level 40 | ✅ محجوب |
| `/legal/*` | `module=legal` + level 40 | ✅ محجوب |
| `/communications` (مراقبة الاتصالات) | sidebar 40 + page redirect إلى `/inbox` لو 10 (راجع `communications.tsx:34`) | ✅ احتياط مزدوج |
| `/calendar` | sidebar 20، backend مفتوح | ⚠️ — موظف 10 محجوب من السيدبار لكن قد يصل عبر URL مباشر؛ بدون بيانات حساسة، الخطر منخفض |
| `/notifications`, `/my-*` | بلا حجب | ✅ مقصودة للموظف |

**خلاصة لـlevel 10:** الأكثر إثارة للقلق هو أن **منح module=hr/finance/fleet/property/umrah للموظف يفتح كامل القسم** بسبب اعتماد الـsidebar على `module=...` فقط. الحل المقترح في #1413: إضافة طبقة perm fine-grained داخل كل قسم (مثل `finance:journal_manual:write`) وليس الاكتفاء بـ`module=finance` كصفر/واحد.

---

## 9. التوصيات (Recommendations)

### 9.1 توصيات معمارية (لـ#1413)

1. **توحيد سلّم الأدوار**: المستويات `20/30/40/50` المذكورة في الـsidebar غير موجودة في `ROLE_LEVELS` بالـbackend. إما إضافة أدوار افتراضية بهذه المستويات، أو إعادة كتابة جميع `minRoleLevel` لتستخدم القيم الفعلية `10/60/70/90/100`.
2. **توحيد منطق العمرة**: الواجهة تُعرّف وحدة `"umrah"` مستقلة (`ModuleType`) لكن الـbackend يدمجها في `"operations"`. اختيار واحد: إما فصل كامل (وحدة umrah بـrouter منفصل) أو دمج كامل (إلغاء `module: "umrah"` من الـsidebar).
3. **إنفاذ الـperms على الـbackend في `/admin/*`**: السيدبار يحدد perm لكل مدخل (`admin:list`/`admin:view`/`admin:update`/`audit:read`/`admin.roles:view`)، لكن routers `/admin/*` لا تستخدم `requirePermission` إطلاقًا. يجب أن يُضاف `requirePermission(...)` داخل كل router إدمن مطابقًا للـsidebar.
4. **إنفاذ مستوى داخلي للمالية الحساسة**: `/finance/year-end-close`, `/finance/opening-balances`, `/finance/journal-manual`, `/finance/fiscal-periods-v2` يجب أن تحصل على `requireMinLevel(70)` على الـbackend إضافة لـ`module=finance`، لمنع موظف محاسبة منخفض الرتبة من إقفال سنة عبر URL مباشر.
5. **توحيد `effectiveRoleLevel` vs `roleLevel`**: `App.tsx` يستخدم `roleLevel` (الدور المختار) لإنفاذ `minRoleLevel`، لكن السيدبار يستخدم `effectiveRoleLevel` (أعلى مستوى من كل أدوار المستخدم) في `useFilteredNavSections`. إذا اختار المستخدم دورًا أدنى من أعلى دور لديه، سيرى مداخل في الـsidebar (لأنها مستندة لـ`effectiveRoleLevel`) ثم تُحجب على الـroute (لأنها مستندة لـ`roleLevel`). يجب توحيد المرجع.

### 9.2 توصيات تشغيلية (يمكن تنفيذها قبل #1413)

| الصفحة | التوصية بالعربية | الأولوية |
|---|---|---|
| `/exec-dashboard` | **يحتاج صلاحية إضافية**: رفع `minRoleLevel` في الـsidebar إلى 70 ليطابق الـbackend (`routes/index.ts:455`). | عالية |
| `/reports/scheduled` | **يحتاج صلاحية إضافية**: رفع `minRoleLevel` في الـsidebar إلى 50 ليطابق الـbackend (`routes/index.ts:447`). | عالية |
| `/admin/logs` ⇄ `/api/audit-logs` | **تباين بين الواجهة والخادم**: إما رفع backend إلى 90 + إضافة `requirePermission("audit:read")`، أو خفض sidebar perm. | عالية |
| `/admin/*` (كل الـ45 مدخلًا) | **عرض فقط مع إنفاذ خادمي**: إضافة `requirePermission(...)` داخل routers admin مطابقًا للـsidebar؛ بدون ذلك، direct-URL bypass ممكن. | حرجة |
| `/automation` | **مخفي / غير مفعّل**: إضافة وحدة "automation" إلى `ROLE_DEFAULT_MODULES` لـowner/general_manager، أو حذف الـsidebar entry. حاليًا غير قابلة للوصول إلا لـowner. | متوسطة |
| `/finance/year-end-close`, `/finance/opening-balances`, `/finance/journal-manual`, `/finance/fiscal-periods-v2` | **يحتاج صلاحية إضافية**: إضافة `requireMinLevel(70)` على الـbackend + رفع `minRoleLevel` في sidebar. | حرجة |
| `/calendar` | **تباين بين الواجهة والخادم**: إما إضافة `requireMinLevel(20)` على الـbackend أو حذف `minRoleLevel: 20` من sidebar. | منخفضة |
| `/manager-board`, `/services`, `/manager-workspace` | **خدمة مساندة**: لا API مرتبط، يجب التأكد أن المكونات لا تحاول fetch لـAPI غير موجود. | منخفضة |
| `/umrah/*` | **مخفي حتى يكتمل الإعداد**: إضافة feature flag `umrah` ضمن `disabledFeatures` افتراضيًا لتنانت جديد. | عالية |
| `/hr/wps`, `/hr/saudi-compliance` | **مخفي حتى يكتمل الإعداد**: feature flag `wps` و`saudi_compliance`. | متوسطة |
| `/fleet/telematics/*` (10 مداخل) | **خدمة مساندة**: تجميعها كـtab واحد داخل "إدارة الأسطول"، وإخفاء حتى ربط CMSV6. | متوسطة |
| `/finance/customer-360-sheet`, `/finance/vendor-360-sheet`, `/finance/journal-templates`, `/finance/journal-quick-templates`, `/finance/cash-position-calculator`, `/finance/account-recon-workpaper`, `/finance/bank-accounts-watch`, `/finance/allocation-override-log`, `/finance/overrides-report`, `/finance/allocation-results` | **خدمة مساندة**: حذفها كمداخل مستقلة من sidebar وعرضها داخل سياقها فقط. | متوسطة |
| `/hr/leaves/management`, `/hr/leaves/approval-chains`, `/hr/attendance/reports`, `/hr/attendance/field-tracking`, `/hr/attendance/qr-scanner`, `/hr/attendance-policy`, `/hr/recruitment/advanced`, `/hr/training/advanced`, `/hr/performance/advanced`, `/hr/violations/management` | **خدمة مساندة**: نقلها كـsub-tabs داخل الصفحة الرئيسية. | متوسطة |
| `/finance/reports/*` (9 تقارير منفصلة) | **خدمة مساندة**: تجميعها داخل "التقارير المالية" كقائمة. | منخفضة |
| `/admin/data-import`, `/admin/digital-signature`, `/admin/pdpl`, `/admin/zatca-audits` | **مخفي حتى يكتمل الإعداد**: ربطها بـfeature flags. | متوسطة |
| `/finance/intercompany`, `/finance/fx-rates`, `/finance/fx-revaluation` | **مخفي حتى يكتمل الإعداد**: ربطها بـfeature flags `multi_company` و`multi_currency`. | متوسطة |
| `/action-center` | **تباين بين الواجهة والخادم**: السيدبار بلا مستوى لكنه يعرض موافقات إدارية. إما إضافة `minRoleLevel: 30` أو فلترة المحتوى داخل الصفحة وفق `roleLevel`. | منخفضة |
| `/properties/*` بدون `minRoleLevel` | **عرض فقط للموظف 10 المنخرط في عقار**: إضافة `minRoleLevel: 30` على المداخل التشغيلية (إيجارات، فحوصات) أو الاكتفاء بـmodule لكن مع تأكيد عدم منح module=property للموظفين العاديين. | منخفضة |

### 9.3 توصيات تحقق آلي (للـsweep المستقبلي)

1. كتابة سكربت يقارن جدول `allNavSections` في `sidebar-layout.tsx` مع `routes/index.ts` للـbackend ويُخرج كل `minRoleLevel` غير متطابق و`perm` غير مفروض على الخادم.
2. اختبار e2e يدور على كل دور افتراضي ويتحقق:
   - عدد المداخل المرئية في الـsidebar.
   - أن كل URL مرئي يُرجع 200 من الـbackend (لا 403).
   - أن كل URL مخفي يُرجع 403 من الـbackend (direct URL bypass test).
3. إضافة عمود `requiredPermissions` في mocking لـ`/permissions/my` ليُختبر السيناريوهات حيث `disabledFeatures` غير فارغة.

---

## ملخص نهائي (5 أسطر)

1. السيدبار يطبّق فلترة دقيقة عبر `useFilteredNavSections` (module + isFeatureEnabled + minRoleLevel + subKey + perm + isRegisteredRoute)، لكنّه يعتمد سلّم أدوار يتضمن قيم وسيطة (20/30/40/50) غير موجودة في `ROLE_LEVELS` بالـbackend (الذي يعرف 10/60/70/90/100 فقط) — مما يخلق مفاجآت رؤية.
2. أكبر تباين خطر هو في `/admin/*`: السيدبار يحدد `perm: "admin:list"`/`"admin:view"`/`"admin:update"`/`"audit:read"` لكل مدخل فرعي، لكن routers الإدمن في الـbackend تكتفي بـ`requireMinLevel(90)+requireModule("admin")` — أي مستخدم بمستوى 90+ يستطيع تجاوز الـsidebar عبر URL مباشر للوصول لجميع endpoints الإدارة. **هذا هو الـbypass الأخطر** الموثَّق هنا.
3. ثلاث صفحات لها تباين مستوى موثّق: `/exec-dashboard` (sidebar 60 vs backend 70)، `/reports/scheduled` (40 vs 50)، و`/admin/logs↔/audit-logs` (perm vs level 70). كلها تخلق إما 403 صامتة أو تسرّب وصول.
4. الصفحات المالية الحساسة (`/finance/year-end-close`, `/finance/opening-balances`, `/finance/journal-manual`) لا تحمل `minRoleLevel` في الـsidebar ولا `requireMinLevel` في الـbackend — أي صاحب وحدة `finance` يصل لها. هذه أولوية حرجة لـ#1413.
5. الـfeature flag mechanism (`isFeatureEnabled` بنمط default-ON) جاهز ومستخدَم لكن `disabledFeatures` فارغة افتراضيًا — تحويل الإعداد إلى default-OFF للتنانت الجديد + ضبط 25+ مدخلًا (`/umrah/*`, `/hr/wps`, `/hr/saudi-compliance`, `/fleet/telematics/*`, `/finance/wht-*`, `/finance/fx-*`, `/finance/intercompany`) يقلّص الـsidebar للموظف الجديد إلى ما هو مفعّل فعلًا في عقده.
