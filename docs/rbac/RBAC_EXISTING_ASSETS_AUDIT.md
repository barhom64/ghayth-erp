# جرد أصول الصلاحيات القائمة — RBAC_EXISTING_ASSETS_AUDIT

> **النوع:** جرد ثابت + قرارات — المرحلة 1 من **Ghaith Operating Foundation** (Issue #1418) ومدخل تنفيذ **Issue #1413**.
> **التاريخ:** 2026-05-29 · **الفرع:** `claude/ghaith-foundation-audit-wdIUf`
> **القاعدة:** كل ادعاء مدعوم بدليل `file:line`. ممنوع بناء نظام صلاحيات جديد بجانب الموجود — يُجرَد الموجود ويُقرَّر مصيره.
> **مصادر سابقة يُبنى عليها:** `docs/RBAC_V2.md` · `docs/RBAC_USAGE_GUIDE.md` · `docs/RBAC_AUDIT_READINESS.md` · `docs/RBAC_COMPARISON.md` · `docs/audit/inventory/foundation.md` (عيب FND-010).

---

## 0. الخلاصة التنفيذية

غيث يملك **نظام RBAC v2 ناضجًا متعدد الطبقات** يدعم بالفعل **أغلب** متطلبات #1413 على مستوى المحرك والقاعدة. الفجوات الأساسية ليست في المحرك بل في: (1) **تجربة إدارية موحّدة سهلة لغير التقني**، (2) **تسجيل الدور النشط في التدقيق**، (3) **مسار إنشاء سريع موظف+حساب+أدوار**، (4) **تعايش كتالوجَي صلاحيات** (rbacCatalog المسطّح ↔ featureCatalog الشجري) يجب توحيدهما.

> **القرار الأعلى:** النظام **يُستخدم ويُطوَّر ويُدمَج** — لا يُستبدل. كل عمل في #1413 يبني فوق `authzEngine` + `featureCatalog` + جداول `rbac_*` الحالية.

---

## 1. جرد الأصول الخلفية (Backend)

| الأصل | المسار | ما يفعله | يُستخدم؟ | صالح؟ | مكرر؟ | القرار |
|---|---|---|---|---|---|---|
| `authzEngine.ts` | `lib/rbac/authzEngine.ts` (27.6KB) | محرك التفويض الأساسي `checkAccess` — 5 طبقات (module/feature/action/scope/field)، حساب الصلاحيات الفعّالة عبر CTE تكراري على شجرة الأدوار، deny/revoke، حدود اعتماد، كاش 30ث | نعم | صالح/إنتاجي | لا | **يُستخدم كما هو** (مع تطوير لتمرير الدور النشط للتدقيق) |
| `featureCatalog.ts` | `lib/rbac/featureCatalog.ts` (38.5KB) | فهرس الميزات الشجري — ~115 ميزة، actions/scopes/sensitiveFields/approvableActions/selfService لكل ميزة | نعم | صالح | **نعم (مع rbacCatalog)** | **يُعتمَد كمصدر وحيد** — يُشتق منه المسطّح (FND-010) |
| `rbacCatalog.ts` | `lib/rbacCatalog.ts` | كتالوج صلاحيات **مسطّح** + role→perm، يغذّي `requirePermission` | نعم | يعمل لكنه قديم | **نعم** | **يُدمَج/يُشتق من featureCatalog ثم يُهجَر تدريجيًا** (توثيق السبب: FND-010) |
| `authorize.ts` | `lib/rbac/authorize.ts` | middleware `authorize({feature,action,resource})` — عزل المستأجر، تطبيق fieldPolicy، تسجيل الرفض في security_log + SIEM | نعم | صالح | لا | **يُستخدم** — يُعمَّم على routers بلا حارس تركيب (FND-004) |
| `abacConditions.ts` | `lib/rbac/abacConditions.ts` | شروط ABAC: statusIn/amountMax/ownRecord/businessHours/ipPrefix… (AND) | نعم | صالح | لا | **يُستخدم** — أساس "الشروط" في #1413 §4 |
| `sodEnforcement.ts` | `lib/rbac/sodEnforcement.ts` | فصل المهام وقت التشغيل — يمنع self-approval للأزواج المتعارضة؛ 5 قواعد مزروعة | نعم | صالح (تنفيذ) | لا | **يُستخدم ويُطوَّر** — أساس Role Conflict Analyzer (#1413 §11) |
| `catalogSync.ts` | `lib/rbac/catalogSync.ts` | يزامن `FEATURE_CATALOG` (كود) → جدول `feature_catalog` (قاعدة) عند الإقلاع | نعم | صالح | لا | **يُستخدم** — يمكّن واجهة الأدوار من قراءة الميزات دون تغيير كود |
| `autoMigrate.ts` | `lib/rbac/autoMigrate.ts` (12.6KB) | ترحيل أول-تشغيل من `role_permissions` القديم → `rbac_role_grants`؛ ضمان selfService لكل موظف | نعم | صالح | لا | **يُستخدم** — جسر الهجرة |
| `distributedCache.ts` | `lib/rbac/distributedCache.ts` | إبطال الكاش عبر pub/sub (نشر متعدد العمليات) | نعم | صالح | لا | **يُستخدم** |
| `siemForwarder.ts` | `lib/rbac/siemForwarder.ts` | تمرير رفض التفويض لـ SIEM خارجي | نعم | صالح | لا | **يُستخدم** |

### 1.1 جداول قاعدة البيانات (Migration `109_layered_rbac_v2.sql`)

| الجدول | الغرض | دعم تعدد الأدوار/الميزات الحرجة |
|---|---|---|
| `feature_catalog` | مرآة الميزات للواجهة الإدارية | — |
| `rbac_roles` | تعريفات الأدوار (level 0–100، `parent_role_id` للوراثة، `is_system`/`is_template`، `color`) | شجرة أدوار |
| `rbac_role_grants` | (role × feature) → actions[] + scope + conditions(JSONB) | نواة الصلاحية الخماسية |
| `rbac_field_policies` | (role × feature × field) → visible/masked/hidden/readonly | **الحقول الحساسة** (#1413 §8) |
| `rbac_approval_limits` | (role × feature × action × currency) → max_amount + requires_dual_control | **حدود الاعتماد** (#1413 §4) |
| `rbac_user_grants` | منح/منع لكل مستخدم مع `expires_at` + reason | **استثناءات + صلاحيات مؤقتة + Deny** (#1413 §7) |
| `rbac_user_roles` | (userId × companyId × role_id) + branchId/departmentId + `is_primary` + `expires_at` | **تعدد الأدوار للمستخدم الواحد** ✅ (UNIQUE على الثلاثي) |
| `rbac_role_history` | سجل تغييرات الأدوار (before/after JSONB + reason) | سجل تعديل الصلاحيات (#1413 §7) |
| `rbac_sod_rules` | قواعد فصل المهام (feature_a/action_a ↔ feature_b/action_b + severity) | **محلل التعارض** |
| `rbac_cache_version` | علامة إبطال الكاش لكل شركة | — |

> **تأكيد متطلب #1413 الأساسي:** نموذج "مستخدم واحد بأدوار متعددة + نطاق لكل دور + Deny + صلاحيات مؤقتة + حدود اعتماد + حقول حساسة" **مدعوم بنيويًا بالكامل**. الفجوة في **التجربة والتدقيق**، لا النموذج.

---

## 2. جرد الأصول الأمامية (Frontend)

| الأصل | المسار | ما يفعله | القرار |
|---|---|---|---|
| `app-context.tsx` | `src/contexts/app-context.tsx` | يوفّر `selectedRole`, `setSelectedRoleKey`, `userRoles[]`, `can(perm)`, `rawPermissions`, مستويات؛ يحفظ الدور المختار في localStorage | **يُستخدم ويُطوَّر** — أساس تبديل الصفة (#1413 §10) |
| `permission-gate.tsx` | `src/components/shared/permission-gate.tsx` | `<PermissionGate>`, `<GuardedButton hideWhenDenied>`, `usePermission()` | **يُستخدم** — لا يُبنى بديل (قاعدة #1418) |
| `roleKeySubPages` (خرائط) | `app-context.tsx` | خرائط ثابتة دور→صفحات فرعية تغذّي `canAccessSubPage` | **يُطوَّر** — يُشتق من `featureCatalog`/الأدوار الفعلية بدل ثبات (MENU-005) |
| `pages/admin/roles.tsx` | الواجهة | قائمة أدوار + صلاحيات بالنموذج القديم (سلاسل module:action) | **يُطوَّر/يُدمَج** نحو واجهة v2 |
| `pages/admin/role-assignment-tab.tsx` | الواجهة | إسناد/إزالة أدوار متعددة للمستخدم (`/admin/user-roles`) | **يُستخدم ويُطوَّر** (إضافة نطاق/انتهاء) |
| `pages/admin/rbac-v2-tab.tsx` | الواجهة | واجهة v2 (موسومة WIP) | **يُراجَع ويُكمَل** ضمن #1413 |
| `pages/admin-rbac-matrix.tsx` | الواجهة | مصفوفة rbac/v2 | **يُدمَج** مع `/admin/roles` (تعايش كتالوجين) |

---

## 3. الإجابة على أسئلة الفحص الـ10 في #1413 §14

| # | السؤال | الحالة | الدليل |
|---|---|---|---|
| 1 | ما الموجود فعلًا؟ | نظام RBAC v2 خماسي الطبقات + 115 ميزة + 10 جداول | §1 |
| 2 | ما يدعم تعدد الأدوار حاليًا؟ | `rbac_user_roles` (UNIQUE ثلاثي) + CTE تكراري في المحرك + `userRoles[]` في الواجهة | `migration 109` + `authzEngine` |
| 3 | ما يحتاج تحسين؟ | التجربة الإدارية، تسجيل الدور بالتدقيق، توحيد الكتالوجين، الإنشاء السريع | §4 |
| 4 | هل الواجهة تسمح بسهولة بإضافة أكثر من دور؟ | جزئيًا — `role-assignment-tab` يضيف أدوارًا لكن بلا نطاق/انتهاء/ملخص واضح لغير التقني | §2 |
| 5 | هل يوجد Effective Permissions Viewer؟ | حساب خلفي موجود (`GET /permissions/my` يحترم `x-selected-role`)؛ **لا واجهة عرض مخصّصة per-role** | RBAC report Q2 |
| 6 | هل يوجد Role Conflict Analyzer؟ | تنفيذ SoD وقت التشغيل + قواعد مزروعة؛ **لا واجهة تحليل/إنشاء قواعد** | `sodEnforcement.ts` |
| 7 | هل يُسجَّل الدور المستخدم في Audit؟ | **لا** ❌ — `auditMiddleware` لا يمرّر `scope.selectedRoleKey` | **فجوة حرجة** (§4 RBAC-001) |
| 8 | هل تُربط كل حركة بالموظف+المستخدم+الدور؟ | الموظف+المستخدم نعم؛ **الدور لا** | RBAC-001 |
| 9 | هل يوجد إنشاء موظف+حساب+أدوار بخطوة؟ | **لا** ❌ — نقاط منفصلة (`/employees`, `/admin/users`, `/admin/user-roles`) | RBAC-002 |
| 10 | هل يمكن التحكم في الحقول الحساسة؟ | **نعم** ✅ — `rbac_field_policies` + `sensitiveFields` + تطبيق في `applyFieldPolicy` | `featureCatalog` + `authzEngine` |

---

## 4. سجل الفجوات (RBAC Defect Register)

| المعرّف | النوع | الوصف | الدليل | الخطورة | القرار |
|---|---|---|---|---|---|
| **RBAC-001** | تدقيق | الدور النشط `selectedRoleKey` **لا يُسجَّل** في `audit_logs` — يضيع "بأي صفة نُفّذت العملية" (#1413 §9 صراحة) | `auditMiddleware.ts` لا يستقبل scope الدور | 🔴 حرجة | يُطوَّر: تمرير `selectedRoleKey` + عمود `active_role_key` |
| **RBAC-002** | تجربة | لا مسار "إنشاء موظف + حساب + أدوار" ذرّي (#1413 §6) | نقاط منفصلة | 🟠 متوسطة | يُبنى `USER_QUICK_CREATE_FLOW` (مرحلة 3) |
| **RBAC-003** | تكرار | كتالوجا صلاحيات متوازيان (rbacCatalog مسطّح ↔ featureCatalog شجري) — نقطتا تفويض (`requirePermission` ↔ `authorize`) تخاطران بانحراف | FND-010 (`foundation.md:137`) | 🟠 متوسطة | يُدمَج: featureCatalog مصدر واحد، اشتقاق المسطّح، هجر التدريجي |
| **RBAC-004** | تجربة | لا Effective Permissions Viewer ولا Role Conflict Analyzer كواجهة لغير التقني (#1413 §8/§11) | لا صفحات | 🟠 متوسطة | يُبنى فوق الموجود (مرحلة 3 specs) |
| **RBAC-005** | حوكمة | `roleKeySubPages` ثابتة في الواجهة لا تُشتق من الأدوار الفعلية | `app-context.tsx` | 🟠 متوسطة | يُطوَّر للاشتقاق من featureCatalog |
| **RBAC-006** | حماية | routers حسّاسة بلا حارس تركيب (`requireModule`) تعتمد على `authorize` inline لكل route | FND-004 (`foundation.md:131`) | 🟠 متوسطة | يُعمَّم حارس التركيب (مرحلة تنفيذ) |
| **RBAC-007** | نموذج | `is_primary` في `rbac_user_roles` غير مُفعَّل في المحرك | `migration 109` | 🟡 منخفضة | يُفعَّل كافتراضي الصفة النشطة (#1413 §10) |

---

## 5. القرارات (استخدام / تطوير / دمج / إخفاء / حذف)

- **يُستخدم كما هو:** `authzEngine`, `authorize`, `abacConditions`, جداول `rbac_*`, `permission-gate`, `distributedCache`, `siemForwarder`, `catalogSync`, `autoMigrate`.
- **يُطوَّر:** تسجيل الدور بالتدقيق (RBAC-001)؛ اشتقاق `roleKeySubPages`/`perm` من الكتالوج؛ تفعيل `is_primary`؛ تعميم حارس التركيب؛ واجهة `role-assignment-tab` (نطاق/انتهاء/ملخص).
- **يُدمَج:** `rbacCatalog` ← `featureCatalog` (مصدر واحد)؛ `/admin/roles` + `/admin/rbac-matrix` (واجهة موحّدة).
- **يُبنى (لا بديل صالح):** Quick-Create flow؛ Effective Permissions Viewer؛ Role Conflict Analyzer UI — **فوق** المحرك الموجود، لا بجانبه.
- **يُهجَر بعد توثيق:** النموذج المسطّح `role_permissions`/`rbacCatalog` بعد اكتمال الاشتقاق (السبب: FND-010 انحراف صلاحيات).
- **لا يُحذف الآن:** لا حذف في المرحلة 1.

---

## 6. المرحلة التالية (تُفصَّل في مرحلة 3 — #1413)

`UNIFIED_USER_ROLE_MODEL` · `USER_QUICK_CREATE_FLOW` · `ROLE_COMPOSER_SPEC` · `EFFECTIVE_PERMISSIONS_SPEC` · `PERMISSION_EXPLAINER_SPEC` · `ROLE_CONFLICT_ANALYZER` · `RBAC_AUDIT_CONTEXT_SPEC` — كلها تبني فوق الأصول المجرودة هنا.
</content>
