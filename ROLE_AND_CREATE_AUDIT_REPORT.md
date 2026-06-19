# تقرير التدقيق: الأدوار + الإضافة/التعديل (الجزءان أ و ب)

> منهج صادق: لا ادّعاء PASS/FAIL دون دليل تجريبي. كل نتيجة أدناه مبنية على استدعاء HTTP حقيقي عبر `localhost:80` (نفس البروكسي الذي يراه المستخدم) أو استعلام DB مباشر.

تاريخ التشغيل: 2026-06-19 · البيئة: dev DB · الأدوات: `scripts/src/role-rbac-audit.cjs` (أ) + `scripts/src/create-smoke.cjs` (ب).

---

## الجزء أ — تدقيق العزل حسب الدور (RBAC)

تمت **تهيئة ١٥ حساب تدقيق** (`audit_<role>@local.test`) لأدوار الشركة ١، تسجيل دخول فعلي لكل واحد، قراءة الوحدات من `/api/auth/me`، ثم فحص نقطة قراءة واحدة لكل وحدة للتحقق من العزل.

### الخلاصة: العزل سليم جوهريًا ✅
| الدور | عدد الوحدات | ملاحظات |
|------|-----------|---------|
| owner | 27 | وصول كامل (صحيح) |
| general_manager | 21 | — |
| hr_manager | 6 | عزل نظيف |
| finance_manager | 8 | — |
| fleet_manager | 6 | عزل نظيف |
| property_manager | 6 | عزل نظيف |
| warehouse_manager | 7 | عزل نظيف |
| crm_manager | 7 | عزل نظيف |
| support_manager | 6 | عزل نظيف |
| legal_manager | 7 | عزل نظيف |
| branch_manager | 7 | عزل نظيف |
| projects_manager | 7 | — |
| bi_manager | 7 | عزل نظيف |
| employee | 5 | عزل نظيف |
| driver | 6 | شذوذ واحد (أدناه) |

### الإشارات التي ظهرت ثم جرى التحقق منها (صدق):
1. **`projects:LEAK` لـ owner/gm/projects_manager** = **إيجابي كاذب**. الوحدة تُسمّى `operations` في النظام (منح `operations%` = ٠؛ تأتي من canonicalize لا من بادئة feature_key)، والثلاثة يملكون الوحدة ووصولهم لـ`/api/projects` مشروع — خصوصًا projects_manager (هذا عمله). ليست تسريبًا.
2. **`finance_manager → crm 403`** = **تحكّم دقيق سليم**. يملك منحة `crm.clients` فقط (لذا تظهر وحدة CRM في القائمة) لكن `/api/crm/leads` مرفوض بحق. سلوك صحيح.
3. **`driver → documents 403`** = **سليم**. يملك `documents.my` فقط (مستنداته)، وقائمة كل المستندات مرفوضة بحق.
4. **`driver → fleet.vehicles 403`** = ⚠️ **شذوذ حقيقي واحد يستحق التحقيق**. منحة السائق `fleet.vehicles` تحمل `actions={view,list}` و`scope=branch` صراحةً، ومع ذلك `GET /api/fleet/vehicles` (الذي يتطلب `authorize({feature:"fleet.vehicles", action:"list"})`) يرجع 403. المنحة تسمح list لكن المسار يرفض — تعارض بين المنحة وتطبيق الصلاحية في مسار السائق. **لم أتعمّق في الجذر** (المطلوب جرد) لكنه موثّق بدقة للمتابعة.

الناتج الخام: `/tmp/role-rbac-audit.json`.

---

## الجزء ب — اختبار الإضافة الفعلي (create/edit) كـ owner

POST فعلي (جسم فارغ + جسم أدنى) إلى ٢٨ نقطة إنشاء رئيسية. **اكتشاف حرج أثناء التنفيذ**: المصادقة تستخدم CSRF (double-submit: كوكي `erp_csrf` = ترويسة `x-csrf-token`)؛ التشغيل الأول أعاد 403 على الكل — وهي رفض CSRF لا RBAC. بعد إرسال الترويزة، النتائج الحقيقية:

### الإشارة الحقيقية = 500 (عطل) مقابل 422 (تحقّق سليم)
- **HEALTHY (422 تحقّق سليم):** leave-requests, loans, overtime, invoices, expenses, journal-manual, purchase-orders, accounts, vouchers, vehicles, drivers, maintenance, properties/units, legal/cases — المسار موصول ويتحقق من المدخلات.
- **CREATED (201 إنشاء فعلي + تحقّق من الحفظ):** suppliers, fleet/fuel-logs, clients, support/tickets, governance/policies, governance/risks, projects, documents, marketing/campaigns — *تم تنظيف كل الصفوف المُنشأة بعد التحقق*.
- **PATH-UNKNOWN (404 — مسار التخمين خاطئ، غير حاسم لا عطل):** hr/employees-status (قراءة فقط)، warehouse/items، crm/leads — مسار الإنشاء يختلف عن مسار القراءة لهذه الوحدات.

### 🔴 عطلان حقيقيان (500) — جرى إصلاحهما والتحقق
صنف واحد: استخدام `Schema.parse(req.body)` (يرمي استثناء → يصل للمعالج العام → **500 "حدث خطأ غير متوقع"**) بدل النمط القياسي السائد في الكود `zodParse(Schema.safeParse(req.body))` (يرجع **422** نظيفًا). أي خطأ تحقّق بسيط من المستخدم كان يظهر كعطل خادم.

| المسار | الملف | الإصلاح |
|-------|------|---------|
| `POST /api/correspondence` | `correspondence.ts:193` | `parse` → `zodParse(...safeParse())` ✅ |
| `POST /api/hr/contracts` | `hr-contracts.ts:136` | `parse` → `zodParse(...safeParse())` ✅ |
| `POST /api/rbac/jit/request` | `rbacV2.ts:1191` | `parse` → `zodParse(...safeParse())` ✅ (نفس الصنف؛ خارج قائمة الفحص لكنه مكتشف بالبحث) |

**التحقق بعد الإصلاح:** إعادة الفحص → `BUG-500 count: 0`؛ المساران يرجعان الآن 422. typecheck لـ api-server يمر. الناتج الخام: `/tmp/create-smoke.json`.

---

## توصية (لم تُنفّذ — خارج نطاق الطلب)
إضافة فحص guard يرصد `Schema.parse(req.body)` العاري في `routes/**` ويفرض نمط `zodParse(safeParse())` يمنع تكرار هذا الصنف مستقبلًا.

## حالة الدمج
الإصلاحات الثلاثة مطبّقة ومُتحقّق منها **محليًا في بيئة العمل فقط**. لإنزالها على main تحتاج PR عبر `scripts/_pr_push.mjs` + اجتياز guard — لم أفتح PR بعد بانتظار موافقتك.
