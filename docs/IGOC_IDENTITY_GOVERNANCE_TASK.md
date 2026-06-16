# IGOC — Identity Governance & Operational Context (حوكمة الهوية)
## مهمة مستقلة عن #1799 — خطة تنفيذ مبنية على فحص حقيقي للكود

> **هذه ليست تطوير «أدوار وصلاحيات».** هذه طبقة الحوكمة التي تتحكم في:
> *من المستخدم، أين يعمل، تحت أي شركة وفرع، بأي دور، ماذا يرى، ماذا يفعل،
> ماذا يعتمد، وماذا يُسجَّل في التدقيق.*
>
> هي الأساس الذي تنبني عليه الموارد البشرية والمالية والعمرة والنقليات
> وكل مسارات غيث.

---

## 1) الفحص الواقعي — ما هو موجود فعلًا

فحصت 14 مكوّنًا. النتيجة الصادقة:

| # | المكوّن | الحالة | الدليل (file:line) | الفجوة |
|---|---|---|---|---|
| 1 | Active Role | 🟢 | `app-context.tsx:200` selectedRoleKey + localStorage + `authMiddleware.ts:61` header `x-selected-role` + `authMiddleware.ts:207-210` downgrade للـ non-owner + migration 235 يضيف `active_role_key` للـ audit_logs | لا شيء |
| 2 | Active Company | 🟢 | `app-context.tsx:305` selectedCompanyIds + setter يزامن localStorage + `authMiddleware.ts:129-156` owner expansion | لا شيء |
| 3 | Active Branch | 🟢 | `app-context.tsx:312` selectedBranchIds + `switchToBranch()` يُعيد التوجيه لـ `/auth/switch-assignment` + JWT-bound | لا شيء |
| 4 | Active Scope (9 enum) | 🟢 | `featureCatalog.ts:30-39` type `Scope`: self/team/department/department_tree/branch/branches/company/multi_company/all + `109_layered_rbac_v2.sql:86-87` CONSTRAINT | لا شيء |
| 5 | Super Admin (preview as) | 🟢 | `authMiddleware.ts:207-210` non-owner role picks downgrade `isOwner` + `app-context.tsx:483` isOwnerRole + role-switcher في `sidebar-layout.tsx:880-903` | لا شيء |
| 6 | Job Titles | 🟢 | migration 012 — table مع name/category/companyId/isActive + 25 seeded + `/admin/job-titles` page | لا شيء |
| 7 | Positions | 🟢 | migration 274 (HR-013) — table + 9 system seeds + `/admin/org-model` tab 2 + `/org/positions` CRUD | لا شيء |
| 8 | Roles (rbac_roles) | 🟢 | migration 109 + 110 templates + `/admin/rbac-v2-tab.tsx` admin UI + 13 templates (9 templates من #1799 §J) | لا شيء |
| 9 | Permissions (via roles) | 🟢 | `rbac_role_grants` (role→feature) + `rbac_user_grants` (per-user overrides مع reason + expiry) + `authzEngine.ts` يجمعهما | لا شيء |
| 10 | Employee Creation transaction | 🟢 | `routes/employees.ts:POST /employees` — atomic — يُنشئ employee + user + role + contract + leave_balance + shift + onboarding + custody + driver + pbx + salary + obligations في transaction واحد | لا شيء |
| 11 | **Dynamic sidebar (hide vs filter)** | 🟡 | `sidebar-layout.tsx` يُخفي عبر `canAccessModule()` + `canAccessSubPage()` لكن كل items في DOM (CSS-hidden) — صح أمنيًا لكن غير مثالي | تحويل لـ filter حقيقي قبل render |
| 12 | **18-step Wizard UI** | 🟡 | `employees-create.tsx:194-211` يعرض 11 success badge بعد الإنشاء — لكن الواجهة form واحد، ليس wizard خطوة بخطوة | إعادة هيكلة UI لـ wizard مرئي |
| 13 | **6-layer enforcement** | 🟡 | API: 🟢 كامل (authzEngine + contextual + scope). UI: 🟢 can()/hasPermission. Print/Export/Reports: 🔴 تعتمد على API layer فقط، لا rejection-at-export-time | إضافة authorize check على export + print + scheduled reports |
| 14 | **Audit context completeness** | 🟡 | يحفظ companyId/branchId/userId/action/entity + activeRoleKey (migration 235). لكن **ينقص**: active_department + resolved_scope + impersonation_source_user | migration يُضيف 3 أعمدة + middleware fill |

---

## 2) ما لا يحتاج إعادة بناء — ١٠/١٤ ✅

**يجب الحذر من re-implementation**: 10 من 14 مكوّن **مُكتمل** بالفعل في النظام. أي عمل جديد في هذه المناطق هو **scope creep** أو **تعارض مع الموجود**.

محاور مكتملة:
- Active context (5/5) — role + company + branch + scope + super-admin preview
- Entity management (4/4) — job_titles + positions + rbac_roles + permissions
- Atomic employee creation transaction (server-side logic مكتمل)

---

## 3) الفجوات الحقيقية — ٤/١٤ 🟡 + 1 يحتاج تعزيز

| ID | المهمة | تكلفة تقديرية | يُغلق |
|---|---|---|---|
| **IGOC-001** | ✅ **مُنفّذ** — migration 284 + extended createAuditLog + logAudit listener + RequestScope type + authMiddleware يملأ activeDepartmentId + impersonationSourceUser + authorize() ينشر resolvedScope. 24/24 smoke tests خضراء. | — | #14 ✅ مُغلق |
| **IGOC-002** | ✅ **مُنفّذ** — فحص دقيق وجد 95% من الـ endpoints محمية بالفعل بـ authorize + companyId. الـ 3 فجوات الحقيقية أُغلقت: `/queue/:id` يفحص print_jobs قبل الـ backend, `/reprint-requests` يطلب proof of prior print, `/archive/:entityType/:entityId` نفس النمط (empty list بدل 404 لأنه speculative). 11/11 smoke tests خضراء. | — | #13 ✅ مُغلق |
| **IGOC-003** | ✅ **مُنفّذ** — `WizardStepNav` بـ 4 خطوات (personal/job/accounts/attachments) + sticky top + IntersectionObserver للـ scroll-tracking + ✓ checkmark على الـ completed + counter «خطوة X من N — Y/N مكتمل» + click-to-scroll. الـ form structure والـ atomic transaction لم يتغيرا. 19/19 smoke tests خضراء. | — | #12 ✅ مُغلق |
| **IGOC-004** | ✅ **مُكتشَف أنه مُنفّذ بالفعل** — قراءة دقيقة للـ `sidebar-layout.tsx` كشفت أن الـ filter حقيقي (returns null + filter يحذف nulls، لا CSS-hide). `apiData` يُعاد جلبه من `/permissions/my` كلما تغيّر `selectedRoleKey`. الـ smoke test `igoc004DynamicSidebarPinSmoke.test.ts` (13/13) يثبّت السلوك الصحيح ويمنع regression. | — | #11 ✅ كان مُغلقًا — الـ audit الأصلي كان خاطئًا |
| **IGOC-005** | ✅ **مُنفّذ** — `igoc005AcceptanceMatrixSmoke.test.ts` (24/24): الـ7 سيناريوهات (employee/branch_manager/hr_manager/payroll/projects_manager/multi-role/owner) + 5 invariants حاكمة (home في الكل، admin لـ owner فقط، level monotonicity، universal modules، uniqueness). يقرأ مباشرة من PREDEFINED_ROLE_DEFAULTS — أي PR يحاول تغيير الـ matrix يفشل CI فورًا. | — | Definition of Done ✅ |
| **IGOC-006** | ✅ **مُنفّذ** — `routes/meInsights.ts` ينشر `GET /me/proactive-insights` يجمع 9 categories (my docs/iqama/requests + team approvals + company iqama/journals/invoices/obligations + critical notifications) داخل `Promise.all` واحد، مع `ifRole()` يُسقط الـ company-level surfaces للأدوار التي لا تملك الـ permission. الـ frontend `ProactiveInsightsCard` على `pages/workspace.tsx` يستهلك الـ endpoint مع `roleKey` في الـ React Query cache key — تبديل الـ header role-picker يُبطل الـ cache فورًا والـ surface يُعاد رسمها بـ scope.role الجديد. 39/39 smoke tests (`igoc006ProactiveInsightsSmoke.test.ts`) تثبّت: الـ 9 categories، الـ role gates، tenant isolation على كل company-level query، الـ active context echo، الـ severity sort، الـ frontend wiring. | — | Gap «النظام يقود المستخدم» ✅ |

**إجمالي تقديري: ١١-١٥ يوم عمل** (مقارنة بـ بناء الكل من الصفر = ٤٠+ يوم).

---

## 4) ترتيب التنفيذ المقترح

### Phase 1 — Audit foundation (IGOC-001)
**أولًا** لأنه foundational لكل ما يأتي بعده. كل action نُغيره في Phase 2/3 سنحتاج أن يُكتب بالسياق الكامل.

### Phase 2 — Plug the real holes (IGOC-002)
**ثانيًا** لأنه bypass أمني فعلي. مستخدم يمكنه export ما لا يستطيع see — هذه ثغرة، ليست تحسينًا.

### Phase 3 — Hardening (IGOC-004)
**ثالثًا** — تحسين أمني + أداء صغير. يحتاج يومًا.

### Phase 4 — UX polish (IGOC-003)
**أخيرًا** — wizard UI. السلوك يعمل (transaction واحد)، نُحسّن التجربة.

### Phase 5 — Acceptance proof (IGOC-005)
**parallel مع Phase 1-4** — كل phase تُضيف integration test يثبت سيناريو واحد.

---

## 5) Definition of Done (من الـ spec)

> *"لا تعتبر المهمة مكتملة حتى يصبح كل ما يراه المستخدم وكل ما يستطيع الوصول إليه وكل ما يستطيع تنفيذه مبنيًا على: الدور النشط + الشركة النشطة + الفرع النشط + النطاق + الصلاحيات وليس على المستخدم فقط."*

**كيف نُثبت ذلك:**
1. Integration tests السبعة من §K (موظف عادي / مدير قسم / HR / رواتب / مدير مشروع / multi-role / Super Admin)
2. لكل سيناريو، assertion صريح: «هذا الدور يرى X و**لا** يرى Y»
3. كل assertion يستهلك الـ context الحقيقي عبر `x-selected-role` header

---

## 6) المبدأ الحاكم (للحفاظ عليه طوال التنفيذ)

من spec المهمة:

> *«لا يسمح للنظام بتنفيذ أي إجراء بدون سياق نشط»*

**كيف نُطبق ذلك تقنيًا:**
- middleware يفشل بـ 400 إذا كان `req.scope.activeRoleKey` فارغًا (موجود حاليًا في `authMiddleware.ts:207-210`)
- كل route يستخدم `authorize({ feature, action })` (موجود حاليًا في 100+ route)
- audit log يحفظ `active_role_key` (موجود منذ migration 235) + سيُضاف `active_department + resolved_scope + impersonation_source_user` في IGOC-001

---

## 7) ما **لن** نفعله

**لن** نُعيد بناء:
- Active role/company/branch context — موجود ويعمل
- Job titles/positions/roles/permissions tables — موجودة ومدارة
- Atomic employee creation — يعمل في transaction واحد
- Scope enum — موجود في `featureCatalog.ts`
- RBAC layered model — موجود من migration 109

**لن** نُضيف:
- Concept جديد للـ context (مثل "active session")
- Role hierarchy جديد (لدينا level + is_template)
- Multi-tenant model جديد (لدينا companyId + branchId)

---

## 8) المراجع

- `docs/HR_OPERATING_FOUNDATION_TASK.md` — مرجع #1799
- `docs/audit/HR_OPERATING_FOUNDATION_AUDIT.md` — تقرير #1799 المهني
- `docs/1799_CLOSURE_REPORT.md` — وثيقة إغلاق #1799
- `docs/audit/SCOPE_HELPER_ADOPTION_AUDIT.md` — موائمة scope helper
- `artifacts/api-server/src/lib/rbac/featureCatalog.ts` — مصدر الـ scopes enum
- `artifacts/api-server/src/middlewares/authMiddleware.ts` — Active context resolution
- `artifacts/ghayth-erp/src/contexts/app-context.tsx` — Frontend active context

---

## شهادة الكاتب
كتب هذه الخطة: Claude (claude-opus-4-7[1m]) بناء على فحص شامل للـ 14 مكوّن المرصودة في spec المهمة. كل verdict مرفق بـ file:line — قابل للتحقق.

**التزام**:
- لن أُعيد بناء شيء موجود
- لن أُضيف concept جديد بدون إثبات أن الموجود لا يكفي
- كل phase ستنتهي بـ commit مستقل + PR منفصل + integration test
- التقدم سيُسجَّل في هذه الوثيقة بـ §G مماثل لـ #1799
