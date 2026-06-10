# IGOC — Identity Governance & Operational Context — وثيقة الإغلاق

> **هذه وثيقة الـ closure النهائية لمهمة IGOC** (حوكمة الهوية التنظيمية والسياق التشغيلي).
> الـ scope الكامل + الـ deliverables + الـ verification trail في صفحة واحدة.
> للمراجعة التنفيذية ولـ stakeholders.

**تاريخ الإغلاق:** 2026-06-09
**عدد الـ PRs:** 2 PR مدموجة على main (#1971 + #1974)
**عدد الـ commits على IGOC:** 6 commits
**عدد الـ tests:** 91 unit smoke tests

---

## 1) السياق

سعادة المحامي إبراهيم رصد أن «حوكمة الأدوار والصلاحيات» في غيث أصبحت **مهمة مستقلة ضخمة** متجاوزة #1799. هي ليست تطوير «أدوار» — هي طبقة الحوكمة التي تتحكم في:

* من المستخدم
* أين يعمل (شركة + فرع + قسم)
* تحت أي دور
* ماذا يرى
* ماذا يستطيع أن يفعل
* ماذا يعتمد
* ماذا يُسجَّل في التدقيق

**المبدأ الحاكم**: أي مستخدم قد يمتلك عدة أدوار/شركات/فروع — لكن عند التنفيذ يجب أن يكون له **سياق نشط واحد** (دور + شركة + فرع + نطاق). لا إجراء بدون سياق.

**حساب المدير العام**: يرى الكل، يستطيع «المعاينة كمستخدم» بأي دور، لكن يظل يعمل ضمن مفهوم السياق النشط.

---

## 2) الحالة الفعلية (الفحص الواقعي للكود)

### ١٠ من ١٤ مكوّن كان مكتملًا فعلًا 🟢 (لا يحتاج إعادة بناء)

| # | المكوّن | المكان |
|---|---|---|
| 1 | Active Role + role-switcher | `app-context.tsx:200` + `authMiddleware.ts:61` x-selected-role + sidebar dropdown |
| 2 | Active Company | `app-context.tsx:305` + owner expansion |
| 3 | Active Branch | `app-context.tsx:312` + JWT-bound switchToBranch |
| 4 | Active Scope (9 enum) | `featureCatalog.ts:30-39` + DB CHECK |
| 5 | Super Admin preview-as | `authMiddleware.ts:207-210` + isOwnerRole + sidebar role picker |
| 6 | Job Titles | Migration 012 + 25 seeded + `/admin/job-titles` |
| 7 | Positions | Migration 274 (HR-013) + 9 seeded + `/admin/org-model` tab 2 |
| 8 | Roles (rbac_roles v2) | Migration 109 + 110 templates + admin UI |
| 9 | Permissions via roles + per-user overrides | rbac_role_grants + rbac_user_grants + authzEngine |
| 10 | Atomic 18-step employee creation | `routes/employees.ts:POST /employees` |

### ٤ فجوات حقيقية أُغلقت 🟢

| ID | المهمة | الـ Artefact |
|---|---|---|
| **IGOC-001** | Audit context completeness | Migration 284 + 3 columns + middleware wiring (PR #1971) |
| **IGOC-002** | Print/Export tenant gates | 3 endpoints مغلقة (PR #1971) |
| **IGOC-003** | Wizard step nav overlay | WizardStepNav component (PR #1974) |
| **IGOC-004** | Dynamic sidebar pin | Regression guard (PR #1971) — السلوك كان صحيحًا |

### ١ acceptance proof 🟢

| ID | الغرض |
|---|---|
| **IGOC-005** | Definition of Done — 7 سيناريوهات × 24 assertion + 5 invariants |

---

## 3) IGOC-001 — Audit Context Completeness

**Migration 284** يُضيف 3 أعمدة على `audit_logs`:

| العمود | يجيب عن |
|---|---|
| `active_department_id` | *"أي قسم كان فعّالًا للموظف وقت الإجراء؟"* |
| `resolved_scope` | *"أي scope حلّه authzEngine لهذا الـ call بعينه؟"* (مختلف عن MAX scope للمستخدم) |
| `impersonation_source_user` | *"هل كان هذا preview-as من Super Admin؟ من الـ userId الحقيقي؟"* |

**التوصيل**:
- `RequestScope` interface يحوي الـ3 fields الجديدة
- `authMiddleware` يحسب activeDepartmentId من active assignment + impersonationSourceUser عند role downgrade
- `authorize()` ينشر resolvedScope بعد grant resolution
- `createAuditLog` + `logAudit` listener يُمرران الـ3 إلى INSERT
- 2 partial indexes (`idx_audit_logs_active_dept`, `idx_audit_logs_impersonation`)
- Mirror في `audit_logs_archive` للـ retention cron

**كل الـ wiring back-compatible**: NULL columns عندما المتصلون لا يُمررون قيم.

---

## 4) IGOC-002 — Print/Export Tenant Gates

**95% من endpoints الـ print/export/scheduled-reports** كانت محمية بـ `authorize() + companyId` بالفعل. فحص دقيق وجد **3 فجوات حقيقية فقط**:

| Endpoint | الثغرة | الإصلاح |
|---|---|---|
| `GET /api/print/queue/:id` | يُمرّر :id للـ backend بلا فحص ملكية | يفحص `print_jobs` بـ `jobId` + `companyId` أولًا، 404 لـ cross-tenant |
| `POST /api/print/reprint-requests` | يقبل أي entityType+entityId | يطلب proof of prior print في الشركة، NotFoundError بـ arabic message |
| `GET /api/print/archive/:entityType/:entityId` | نفس النمط | empty list (لأن archive lookups speculative) |

**الـ pattern الموحَّد**: «only entities your company has printed before can be re-printed or archive-listed».

---

## 5) IGOC-003 — Wizard Step Navigation

الـ atomic transaction في الخادم (`POST /employees`) يُنشئ 18 شيئًا في خطوة واحدة ويعمل بشكل صحيح. لم نُعِد بناء الـ form — أضفنا **overlay**:

- **`WizardStepNav` component**: sticky-top بـ 4 خطوات (personal / job / accounts / attachments)
- **IntersectionObserver** يُحدّث الـ active step عند scroll
- **Click step → smooth scrollIntoView** للـ anchor
- **✓ checkmark** على completed steps + counter «خطوة X من 4 — Y/4 مكتمل»
- **Non-blocking**: submit يبقى gated فقط على الـ minimums الموجودة (لا state جديد يكسر التجربة)

---

## 6) IGOC-004 — Dynamic Sidebar (Pinned)

الـ audit الأصلي ادّعى أن الـ sidebar «static + CSS-hidden». **القراءة الدقيقة كشفت أن السلوك صحيح**:

- `useEffect` يُعيد جلب `/permissions/my` كلما تغيّر `selectedRoleKey`
- `filterItems()` يرجع `null` للـ forbidden + `.filter(x !== null)` يحذفها
- **لا CSS-hide hack** — العناصر غير موجودة في DOM عند المنع
- `allowedModules` يُحسب من `selectedRole.modules` (active role) أو `apiData.modules`

أضفنا **13 assertion** كـ regression guard لمنع أي PR مستقبلي يكسر هذا السلوك.

---

## 7) IGOC-005 — Acceptance Matrix (Definition of Done)

**24 assertion × 7 سيناريوهات + 5 invariants** تثبت أن السياق النشط يُغيّر فعلًا ما يراه المستخدم:

### السيناريوهات الـ7

| الدور | Level | Modules المرئية | Modules ممنوعة |
|---|---|---|---|
| employee | 10 | home/requests/documents/comms (4 فقط) | hr/finance/admin/fleet... |
| branch_manager | 60 | + hr/finance/support | fleet/property/warehouse/admin |
| hr_manager | 70 | hr-scoped + universal | finance/fleet/property/admin |
| payroll_officer | — | RBAC v2 template (مفصول عن fallback) | — |
| projects_manager | 70 | operations + universal | hr/finance |
| multi-role user | — | **switching يغير الـ view** — hr_manager vs finance_manager modules **متباينة** | — |
| owner (Super Admin) | 100 | **كل 20 module** بما فيها admin | — (superset over all) |

### الـ5 invariants الحاكمة

1. كل دور يحوي `home` (الـ landing الموحد)
2. **`admin` لـ owner فقط** — لا functional manager يحصل عليه بصمت
3. **Level monotonicity**: employee < branch_mgr < functional_mgr < general_mgr < owner
4. **Universal floor**: كل دور يحوي home/requests/documents/comms
5. **Uniqueness**: لا دورين بـ matrix متطابق (لا تكرار)

أي PR يحاول كسر أيٍّ من هذه الـ invariants → CI failure فوري.

---

## 8) الـ PRs كلها

| # | العنوان |
|---|---|
| #1971 | feat(igoc): close 4/5 audit gaps (IGOC-001 + 002 + 004 + 005) |
| #1974 | feat(igoc): IGOC-003 — wizard step nav overlay |

### الـ6 commits

| Hash | المحتوى |
|---|---|
| `68eda775` | IGOC plan + 14-component audit |
| `8814289c` | IGOC-001 — audit context completeness |
| `d8840f6d` | IGOC-002 — 3 print/export gates |
| `cb77614a` | IGOC-004 — dynamic sidebar pin |
| `46e104e4` | IGOC-005 — acceptance matrix |
| `7093cbcc` | IGOC-003 — wizard step nav |

---

## 9) الـ smoke tests كلها

| Test file | Assertions |
|---|---|
| `igoc001AuditContextCompletenessSmoke.test.ts` | 24 |
| `igoc002PrintExportTenantGateSmoke.test.ts` | 11 |
| `igoc003WizardNavSmoke.test.ts` | 19 |
| `igoc004DynamicSidebarPinSmoke.test.ts` | 13 |
| `igoc005AcceptanceMatrixSmoke.test.ts` | 24 |
| **الإجمالي** | **91/91** ✅ |

---

## 10) الـ 6 architectural invariants المحمية للأبد

1. **`active_role_key` في كل audited write** (migration 235) — RBAC-001
2. **`resolved_scope` يعكس scope الـ call**، ليس MAX للمستخدم (IGOC-001)
3. **`impersonation_source_user` يكشف preview-as** من Super Admin (IGOC-001)
4. **«only printed-before can be re-printed»** (IGOC-002)
5. **Sidebar items not in DOM when forbidden** — لا CSS-hide (IGOC-004)
6. **PREDEFINED_ROLE_DEFAULTS matrix locked** — أي تغيير في modules لأي دور يفشل CI (IGOC-005)

---

## 11) كيف يُتحقَّق من IGOC لاحقًا

```bash
# Unit smoke (DB-free)
pnpm --filter api-server exec vitest run \
  tests/unit/igoc001AuditContextCompletenessSmoke.test.ts \
  tests/unit/igoc002PrintExportTenantGateSmoke.test.ts \
  tests/unit/igoc003WizardNavSmoke.test.ts \
  tests/unit/igoc004DynamicSidebarPinSmoke.test.ts \
  tests/unit/igoc005AcceptanceMatrixSmoke.test.ts
# expected: 91/91 ✅

# Acceptance proof (Definition of Done — runs in plain CI):
pnpm --filter api-server exec vitest run tests/unit/igoc005AcceptanceMatrixSmoke.test.ts
# expected: 24/24 — all 7 role scenarios pass + 5 invariants enforced

# Audit context migration check (DB required):
psql $DATABASE_URL -c "\d audit_logs" | grep -E "active_department_id|resolved_scope|impersonation_source_user"
# expected: 3 rows
```

---

## 12) المراجع

- **خطة IGOC**: `docs/IGOC_IDENTITY_GOVERNANCE_TASK.md` (14-component audit + verdict لكل بند)
- **#1799 الـ closure**: `docs/1799_CLOSURE_REPORT.md` (المهمة السابقة لهذه)
- **RBAC context spec**: `docs/rbac/RBAC_AUDIT_CONTEXT_SPEC.md` (الأساس)
- **scope helper migration**: `docs/audit/SCOPE_HELPER_ADOPTION_AUDIT.md`

---

## شهادة الإغلاق

كتبت ودمجت هذا العمل: Claude (`claude-opus-4-7[1m]`) عبر 6 commits و 2 PRs في 2026-06-09.

**الـ verification**:
- ✅ 91/91 smoke tests خضراء
- ✅ كل PR مرّ بـ guard.sh الكامل (typecheck + linting + 8000+ tests)
- ✅ Migration 284 له `@rollback` annotation + `@policy:additive`
- ✅ Round-trip test على db dump (HR-022 من #1799) ضمن أن الـ migration loads نظيفًا
- ❌ لم يُجَر QA يدوي في environment إنتاجي
- ❌ Migration 284 لم تُطبَّق على production DB بعد (auto-runs on api-server boot)

**الـ deliverable النهائي**: المبدأ الحاكم من spec المهمة أصبح مُطبَّقًا تقنيًا — *«كل ما يراه المستخدم وكل ما يستطيع الوصول إليه وكل ما يستطيع تنفيذه مبني على: الدور النشط + الشركة النشطة + الفرع النشط + النطاق + الصلاحيات، وليس على المستخدم فقط»* — ومحميٌ بـ ratchet test يضمن عدم regression.
