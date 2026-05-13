# Al-Diyaa wal-Bayan — Tenant Setup Reference

دليل مرجعي مكتمل لإعداد بيانات **مؤسسة الضياء والبيان للمقاولات** ومجموعة فروعها في نظام غيث ERP، يجمع كل تغييرات الـ PRs التالية في صفحة واحدة قابلة للمراجعة.

## الكوميتات المساهمة (مدموجة على `main`)

| PR | SHA | الملف الرئيسي | السطور |
|---|---|---|---|
| [#376](https://github.com/barhom64/ghayth-erp/pull/376) | `d92a89fc` | `db/seed-aldiyaa-albayan.sql` | +320 |
| [#444](https://github.com/barhom64/ghayth-erp/pull/444) | `0e67dbd0` | `db/bootstrap.sh` (step 7c) | +7 |
| [#470](https://github.com/barhom64/ghayth-erp/pull/470) | `93f830ea` | `.github/workflows/guard.yml` | +6/-3 |
| [#473](https://github.com/barhom64/ghayth-erp/pull/473) | `b89264c2` | `db/seed-aldiyaa-company-defaults.sql` + `db/bootstrap.sh` (step 7d) | +539 |
| [#480](https://github.com/barhom64/ghayth-erp/pull/480) | `3e95ba3c` | `artifacts/ghayth-erp/src/components/shared/permission-gate.tsx` | +9/-7 |

## شجرة البيانات بعد التطبيق

```
companies (1)
└─ مؤسسة الضياء والبيان للمقاولات
   CR 4031188915  |  VAT 310369110700003
   📍 مكة المكرمة، حي التنعيم، سعد بن خيثمة 24224

branches (7 — مسطّحة، الـ schema لا يدعم parentId)
├─ مؤسسة الدور الحديثة للتطوير العقاري  (CR 4031255541، unified 7026091814)
├─ الدور الحديثة — نشاط النقل الثقيل   (رخصة 11/00086037)
├─ الدور الحديثة — نشاط التطوير العقاري (شهادة 2392866777)
├─ الدور الحديثة — نشاط العمرة           (PR #498)
├─ الدور الحديثة — نشاط الفنادق          (PR #498)
├─ مؤسسة الضياء والبيان للنقليات — مكة المكرمة (unified 7026091798)
└─ مؤسسة الضياء والبيان للنقليات — حفر الباطن (unified 7033364436)

employees (1)
└─ ولاء طلال بن صدقه شافعى  (هوية 1056272873، سعودية)
   employee_assignment: ربط بفرع الدور الحديثة بدور owner

users (1)
└─ door@door.sa  (role=owner، password bcrypt-hashed)

افتراضيات الشركة (المُدخلة عبر seed-aldiyaa-company-defaults.sql):
├─ 144  chart_of_accounts        (5 مستويات، parent linking by code)
├─ 98   role_permissions         (14 دور)
├─ 10   hr_leave_types
├─ 3    shifts                   (صباحية/مسائية/ليلية)
├─ 6    salary_components        (راتب أساسي، بدلات، GOSI، ضريبة)
└─ 174  system_settings          (vat 15%، gosi، fiscal year،
                                  6 violation types، 5 approval chains،
                                  8 numbering prefixes، 9-level penalty ladder)
```

## التطبيق

### تشغيل مباشر على قاعدة بيانات حيّة
```bash
git pull origin main
psql "$DATABASE_URL" -f db/seed-aldiyaa-albayan.sql
psql "$DATABASE_URL" -f db/seed-aldiyaa-company-defaults.sql
```

### Bootstrap كامل (يمسح ويعيد بناء قاعدة البيانات)
```bash
pnpm db:bootstrap
```

`db/bootstrap.sh` ينفّذ الخطوات بالترتيب التالي:
1. schema_pre.sql + schema_post.sql
2. seed.sql (reference rows)
3. seed-admin-user.sql (owner@local.test للاختبار)
4. seed-financial-periods.sql
5. **seed-aldiyaa-albayan.sql** (step 7c — PR #444)
6. **seed-aldiyaa-company-defaults.sql** (step 7d — PR #473)

## دخول النظام

| الحقل | القيمة |
|---|---|
| البريد | `door@door.sa` |
| الكلمة | `Door@2026Diaa` (يلزم تغييرها عند أول دخول) |
| الدور | `owner` (يتجاوز كل فحوصات الصلاحيات بـ legacy bypass) |

عند إقلاع API server، يقوم `autoMigrate.ts` بترجمة `role_permissions` تلقائياً إلى `rbac_roles` + `rbac_role_grants` (v2 RBAC)، ثم migration `141_admin_assign_all_rbac_roles.sql` يربط المستخدم بكل الأدوار المتاحة في الـ role-switcher.

## التحقّق

شغّل سكريبت التحقّق المرفق:
```bash
bash scripts/verify-aldiyaa.sh
```

العدّات المتوقّعة بعد التطبيق الناجح:

| الجدول | العدد |
|---|---|
| `companies` | 1 |
| `branches` | 7 |
| `employees` | 1 |
| `users` | 1 |
| `employee_assignments` | 1 |
| `chart_of_accounts` | 144 |
| `role_permissions` | 98 |
| `hr_leave_types` | 10 |
| `shifts` | 3 |
| `salary_components` | 6 |
| `system_settings` | 174 |

## الواجهات الداعمة

كل البيانات المبذورة لها صفحات إدارة في الواجهة:

| البيانات | الصفحة |
|---|---|
| الشركة + الفروع | `/settings/companies`, `/settings/branches` |
| شجرة الحسابات | `/finance/accounts` |
| المستخدم + الموظفون | `/admin/users`, `/employees` |
| الأدوار والصلاحيات | `/admin/roles`, `/admin/permissions`, `/rbac/v2/*` |
| أنواع الإجازات | `/hr/leaves` |
| الورديات | `/hr/shifts` |
| بنود الراتب | `/hr/payroll` |
| الإعدادات (vat, gosi, ...) | `/settings/system-controls`, `/settings/zatca`, … |
| سلسلة العقوبات | `/hr/violations` |

## تحسين تجربة الصلاحيات (PR #480)

`GuardedButton` أصبح يُخفي تلقائياً (لا يعرض كأيقونة قفل معطّلة) عندما لا يملك المستخدم الصلاحية. الـ default الجديد:

```tsx
<GuardedButton perm="finance:create" onClick={...}>إنشاء فاتورة</GuardedButton>
// قبل: زر معطّل بأيقونة قفل + tooltip للمستخدمين بدون "finance:create"
// بعد: لا يظهر شي للمستخدمين بدون "finance:create"
```

للعودة للسلوك القديم (إظهار قفل قابل للاستكشاف):
```tsx
<GuardedButton perm="finance:create" hideWhenDenied={false}>إنشاء فاتورة</GuardedButton>
```

## ملاحظات

- كل عمليات الإدخال idempotent عبر `WHERE NOT EXISTS` أو `ON CONFLICT DO NOTHING` — آمنة لإعادة التشغيل.
- إضافة مستخدمين إضافيين تُدار يدوياً من `/admin/users` (لم تُؤتمت بناءً على سياسة "خل الصلاحيات عندي").
- CR الحقيقي لفرعَي النقليات (مكة + حفر الباطن) لم يُذكر في وثائق الـ ZATCA المرفقة (فقط الرقم الموحد)، لذا تُركت `crNumber` فارغة لهما.
