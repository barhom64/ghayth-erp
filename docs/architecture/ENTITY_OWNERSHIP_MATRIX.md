# مصفوفة ملكية الكيانات — ENTITY_OWNERSHIP_MATRIX

> المرحلة 2 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **المبدأ:** كل كيان يملكه **مسار واحد** (المالك) المسؤول عن دورة حياته وقراراته. مسارات أخرى قد **تقرأ** أو **تخدم** لكنها لا تملك.
> **يُبنى على:** `ENTITY_CATALOG.md` (الفهرس) + `featureCatalog.ts` (الميزة → الوحدة المالكة).

---

## 1. قاعدة الملكية

- **المالك:** المسار الذي يُنشئ الكيان ويتحكم في دورة حياته وقراره (موجود في `moduleKey` بـ `featureCatalog`).
- **القارئ:** مسار يعرض الكيان (عبر صلاحية `view/list` ضمن نطاق) دون تعديل دورة حياته.
- **الخادم:** خدمة مشتركة تتصرف على الكيان بطلب المالك (تدقيق/إشعار/مستند/قيد).
- **عمود "ميزة RBAC":** المفتاح في `featureCatalog` الذي يحكم الكيان.

---

## 2. المصفوفة (الكيانات الأساسية)

| الكيان | المالك | ميزة RBAC | القرّاء النموذجيون | الخوادم |
|---|---|---|---|---|
| companies/branches/departments | Foundation | `settings`, `admin` | الكل (للنطاق) | الترقيم، التدقيق |
| employees | HR | `hr.employees` | المالية/الأسطول/العمرة (كمنفّذ) | التدقيق، الوثائق، الإشعارات |
| users/rbac_user_roles | Foundation/Admin | `admin.users`, `admin.roles` | — | التدقيق |
| journalEntries/chartOfAccounts | Finance | `finance.journal`, `finance.accounts` | كل المسارات (أثرها) | التدقيق، الترقيم |
| invoices | Finance | `finance.invoices` | العميل/العمرة/العقارات | الترقيم، الاعتماد، الطباعة، ZATCA |
| payrollRuns | HR | `hr.payroll.runs` | Finance (القيد) | GL، التدقيق، الإشعارات |
| fleet_vehicles/trips | Fleet | `fleet.vehicles`, `fleet.trips` | العمرة (نقل) | GL، Warehouse، الإشعارات |
| umrah_groups/sales_invoices | Umrah | `umrah` (+ فرعية) | Finance (القيد) | GL، الأسطول، الوثائق، العمولة |
| rental_contracts/rent_payments | Properties | `properties.contracts`, `properties.payments` | Finance، القانوني (تعثر) | GL، الالتزامات، الترقيم |
| legal_cases/judgments | Legal | `legal.cases` | HR (تأديب)، العقارات | الالتزامات، الإشعارات، GL |
| clients/opportunities | CRM | `crm.clients`, `crm.opportunities` | Finance (فوترة) | الاتصالات، التدقيق |
| documents | الوثائق (خادم) | `documents` | الكل (entityType) | — |
| tasks/notifications/audit_logs | خوادم عامة | `tasks`, `notifications`, `admin.audit` | الكل | — |

---

## 3. قواعد منع تنازع الملكية

1. **مالك واحد فقط لكل كيان** — أي تعديل على دورة حياة الكيان يمرّ عبر ميزة المالك في RBAC.
2. **القارئ لا يكتب** — العمرة تنفّذ على المعتمر لكنها لا تملك جدول `employees`؛ تستهلكه عبر صلاحية القراءة/التنفيذ.
3. **الخادم لا يقرر** — GL يرحّل لكن لا يقرر اعتماد الفاتورة؛ القرار للمالك (Finance).
4. **الأثر العابر مرئي عند المالك والمنشئ** — قيد رحلة الأسطول يملكه Finance (journal) لكنه مرتبط بكيان Fleet (trip) عبر مرجع.

---

## 4. القرارات

- **المصفوفة متّسقة مع `featureCatalog.moduleKey`** — تُعتمَد كمرجع، ويُشتق منها حكم الظهور (`canAccessModule` يطابق المالك).
- **لا تكرار كيانات أعمال بين المسارات** (مؤكَّد من المرحلة 1) — استثناء المرفقات يُدمَج (DOC-VIOLATION).
- **التفصيل لكل كيان** (أعمدة، حالات) في `ENTITY_LIFECYCLE_CATALOG.md`.
</content>
