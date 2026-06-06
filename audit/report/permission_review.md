# مراجعة الصلاحيات وتصنيف نقاط النهاية
# Permission Review

> **المرجع:** #1606 (تحت #1594). يصنّف نقاط النهاية ويوثّق سبب كل قرار حماية.

## الإنفاذ مؤتمت (لا اعتماد على المراجعة اليدوية)
`artifacts/api-server/scripts/lintPermissions.mjs` يعمل ضمن بوابة `guard` في CI ويفحص **106 ملفات و178 صلاحية** في الكتالوج. أي endpoint يحتاج صلاحية ولا يحملها (أو يستخدم صلاحية خارج الكتالوج) **يُفشِل CI**. النتيجة الحالية: `OK`.

نمط الحماية الموحّد: `authorize({ feature, action, resource? })` من `lib/rbac/authorize.js` (يربط الصلاحية + ملكية المورد + tenant scope)، أو فحص صلاحية صريح داخل المعالج عند الحاجة لمنطق أدق (مثل «بياناتي الشخصية»).

## التصنيف
| الفئة | المعنى | أمثلة |
| --- | --- | --- |
| **public by design** | بلا مصادقة بقصد + rate-limit | `health.*`، `publicData.*`، `pdpl/privacy-notice`، `careersPortal.*` (بوابة عامة) |
| **auth only** | تتطلب جلسة فقط (المساحة الشخصية = صاحب الحساب) | `auth/me`، `mySpace.*`، `dashboard.*` |
| **permission required** | `authorize({feature,action})` | غالبية مسارات المالية/HR/العمرة/الأسطول… |
| **admin only** | إداري حصرًا (+ requireMinLevel أحيانًا) | `admin/system-stops`، `pdpl/processing-log` (مستوى ≥90) |
| **tenant scoped** | محمي + مقيّد بـ company/branch عبر `requireOwnership` | الترحيل المالي، تحديث/حذف الكيانات |

## حماية PDPL (بيانات شخصية) — مُتحقَّقة
| Endpoint | الحماية | تدقيق |
| --- | --- | --- |
| `GET /pdpl/privacy-notice` | public by design + IP rate-limit | — |
| `GET /pdpl/retention-policies` | `authorize(admin.pdpl, list)` | — |
| `GET /pdpl/employee-data-export/:id` | auth + فحص صريح: **بياناتي** أو `admin.pdpl:export` أو `hr:read` | ✅ يكتب `processing_activities_log` (actor=performedBy، purpose، legalBasis=PDPL، dataCategories، dataSubjects، timestamp) |
| `POST /pdpl/data-request` | `authorize(admin.pdpl, create)` | ✅ `createAuditLog` |
| `GET /pdpl/processing-log` | `authorize(admin.pdpl, view)` + `requireMinLevel(90)` | — |

> خلافًا لتقرير مايو («4 نقاط PDPL بلا صلاحية»)، جميع نقاط PDPL محميّة الآن، وتصدير البيانات الشخصية يُسجَّل في سجل أنشطة المعالجة.

## منهجية القرار
- **لا صلاحية عشوائية:** كل نقطة إما عامة بقصد (موثّق أعلاه)، أو تتطلب جلسة، أو محميّة بصلاحية من الكتالوج يفرضها الـlinter.
- **الأدلة:** `lint:permissions` (CI) + `audit/report/auth_coverage.csv`.

## متابعة
- مراجعة دورية تلقائية لأي نقطة عامة جديدة تُضاف (الـlinter يغطّي المحمية؛ العامة بقصد تحتاج توثيق سبب عند الإضافة).
