# #1799 — HR Operating Foundation — وثيقة الإغلاق

> **هذه وثيقة الـ closure النهائية للمهمة #1799**.
> الـ scope الكامل + الـ deliverables + الـ verification trail في صفحة واحدة.
> للمراجعة التنفيذية ولـ stakeholders.

**تاريخ الإغلاق:** 2026-06-09
**عدد الـ PRs:** 12 PR مدموجة على main
**عدد الـ migrations:** 10 (270-279، مع تجاوز 277 لـ maintenance من PR آخر)
**عدد الـ tests:** 73 unit smoke + 3 dynamic integration

---

## 1) السياق

#1799 كان أكبر مهمة HR في النظام — هدفها تحويل وحدة الموارد البشرية من «مجموعة شاشات منفصلة» إلى «نظام تشغيلي مدمج» يحلّ 7 فجوات جوهرية موثَّقة في الـ docs:

1. **التمايز بين فئات الموظفين** (مدير ≠ سائق ≠ عامل في سياسة الحضور)
2. **النموذج التنظيمي** (legal_entities + positions + teams + committees + projects)
3. **ملف الموظف 360** (14 tab موحد)
4. **التتبع الميداني** (GPS بفئة + breadcrumb)
5. **مصدر الحضور** (qr/gps/selfie/manual)
6. **activeRole في Audit** (تتبع الدور النشط في كل سجل)
7. **توحيد ملف user مع employee** (حساب + موظف + أدوار في واجهة واحدة)

---

## 2) الـ 12 أولوية — كلها 🟢

| # | الأولوية | الـ artefact |
|---|---|---|
| 1 | سجل الموظف 360 (14 tabs) | `employee-detail.tsx` + Promise.all في `employees.ts` |
| 2 | ربط الموظف بالأدوار | Roles tab + rbac_user_roles + deep-link |
| 3 | "ماذا يظهر لمن ومتى" | `/admin/effective-permissions` |
| 4 | كتالوج خدمات HR | `/hr/services` بـ 8 خدمات |
| 5 | محرك الطلبات والاعتمادات | `/hr/approvals` يجمع 8 أنواع |
| 6 | الحضور بفئة الموظف | `attendancePolicyEngine` + `/admin/attendance-categories` |
| 7 | التتبع بالسياسة | `field_tracking_points` + `FieldBreadcrumbSection` |
| 8 | الربط المالي | payroll → GL + WPS (موروث) |
| 9 | العهد والأصول | `employee_assets` bridge + custodies tab |
| 10 | التقييم وإشارات الأداء | `employeeScoringEngine` + `PerformanceWidget` + `/admin/scoring-weights` |
| 11 | صندوق الأعمال (unified inbox) | `/my/work-queue` يجمع 4 مصادر |
| 12 | تهذيب القائمة (9 buckets) | `navigation.registry.ts` |

---

## 3) §B — نموذج المؤسسة التشغيلي

| الجدول | Migration | API | UI |
|---|---|---|---|
| `legal_entities` | 274 | `/org/legal-entities` CRUD | `/admin/org-model` tab 1 |
| `positions` (+ 9 system seeds) | 274 | `/org/positions` CRUD | tab 2 |
| `teams` | 274 | `/org/teams` CRUD | tab 3 |
| `committees` | 274 | `/org/committees` CRUD | tab 4 |
| `supervision_lines` | 275 | `/org/supervision-lines` CRUD | tab 5 |
| `approval_authorities` | 275 | `/org/approval-authorities` UPSERT | tab 6 |
| `employee_team_memberships` | 274 | `/org/team-memberships` CRUD | `/admin/org-memberships` tab 1 |
| `employee_committee_memberships` | 274 | `/org/committee-memberships` CRUD | tab 2 |
| `employee_project_assignments` | 276 | `/org/project-assignments` CRUD | tab 3 |

**كل الـ 9 جداول مفعَّلة بـ API + UI + audit**. الـ §B الذي طلبه المحامي إبراهيم لم يَعُد «جداول يتيمة».

---

## 4) §C — Seeds

### §C.1 — Employee categories (Migration 270)
| categoryKey | trackingFrequencySeconds | exemptFromAutoDeduction |
|---|---|---|
| worker | 0 | FALSE |
| driver | **30** | FALSE |
| field_employee | **300** | FALSE |
| office_employee | 0 | FALSE |
| **manager** | 0 | **TRUE** (core #1799 §F.6 invariant) |
| **executive** | 0 | **TRUE** |

### §C.3 — HR role templates (9/9 seeded)
- pre-#1799: hr_admin, hr_manager, branch_manager, department_manager, employee_self_service (5)
- HR-012 (Migration 278): attendance_officer, payroll_officer, discipline_officer, performance_reviewer (4)

---

## 5) §K — Integration Tests (5 سيناريوهات حرجة)

| Scenario | File | gate |
|---|---|---|
| عامل يتأخر → خصم تلقائي | `hrAttendancePolicyByCategory.dynamic.test.ts` | DATABASE_URL |
| **مدير يتأخر → لا خصم** (core invariant) | نفس الملف | DATABASE_URL |
| Per-company override يتغلب على system seed | نفس الملف | DATABASE_URL |
| Uncategorised assignment → legacy default (no crash) | نفس الملف | DATABASE_URL |
| سائق GPS → ping في `field_tracking_points` | `hrFieldTrackingPipeline.dynamic.test.ts` | DATABASE_URL |
| Breadcrumb ordering بـ capturedAt ASC | نفس الملف | DATABASE_URL |
| Manual attendance correction → audit_logs بـ reason | `hrManualCorrectionAndScoringComposition.dynamic.test.ts` | DATABASE_URL |
| Scoring composition من multi-source | نفس الملف | DATABASE_URL |
| `rationale` JSONB يفسّر 6 dimensions | نفس الملف | DATABASE_URL |
| Idempotent scoring re-run via UPSERT | نفس الملف | DATABASE_URL |

---

## 6) الـ 6 risks المرصودة + الإصلاحات

| Risk | الوصف | الحل |
|---|---|---|
| R1 | Legacy `custom_roles` fallback cache | **HR-018**: Migration 269 أسقطها + ratchet test يمنع regression |
| R2 | Org bridges بدون CRUD | **HR-019**: 9 endpoints + admin UI |
| R3 | Field tracking بدون UI | **HR-015**: `FieldBreadcrumbSection` |
| R4 | Scoring weights hardcoded | **HR-020**: Migration 279 + admin UI |
| R5 | غياب §K integration tests | **HR-014 + HR-021**: 5 سيناريوهات مغطّاة |
| R6 | `db/schema_pre.sql` متخلّف | **HR-022**: regen كامل (425 جدول) + `check-schema-drift` patched |

---

## 7) الـ 8 audit recommendations — كلها 🟢

| ID | الإنجاز |
|---|---|
| HR-015 | Field tracking breadcrumb UI + Attendance categories admin |
| HR-016 | Unified `/my/work-queue` يجمع 4 مصادر |
| HR-017 | `CUSTODIES_MODEL_BOUNDARIES.md` يحسم تكرار العهد |
| HR-018 | Legacy RBAC ratchet (`legacyRbacCutoverRatchetSmoke.test.ts`) |
| HR-019 | Org memberships CRUD (team/committee/project) |
| HR-020 | Configurable scoring weights + Ranking dashboard |
| HR-021 | 5 §K integration tests (GPS + manual correction + scoring) |
| HR-022 | `db:dump-schema` regen — 425 tables · 887 indexes · 504 FKs |

---

## 8) الـ migrations كلها

| Migration | المحتوى |
|---|---|
| **270** | `employee_categories` (6 seeds) + `attendance_policies_per_category` + `employee_assignments.categoryKey` |
| **271** | `field_tracking_points` (GPS pings) |
| **272** | `employee_scores` (6 dimensions) |
| **273** | `employee_signals` (risk/promotion/burnout) |
| **274** | `legal_entities` + `positions` (9 seeds) + `teams` + `committees` + 3 bridges + `branches.legalEntityId` |
| **275** | `supervision_lines` + `approval_authorities` |
| **276** | `employee_assets` (HR custody bridge) |
| **278** | 4 HR role templates seed |
| **279** | `scoring_weights_per_company` |

(277 احتُجِز من PR آخر لـ maintenance_request_linked_expense — تجاوزناه إلى 278)

---

## 9) الـ PRs كاملة

| # | العنوان |
|---|---|
| #1803 | docs — inventory + roadmap |
| #1807 | priority #1 — account + roles tabs |
| #1809 | priority #6 — per-category attendance foundation |
| #1814 | priority #6 — wire check-in |
| #1817 | priority #6 — wire check-out + autoViolation cron |
| #1822 | priority #7 — field_tracking_points + ingestion |
| #1831 | priority #10 — employee scoring engine |
| #1833 | priority #10 §G — Risk/Promotion/Burnout signals |
| #1836 | §B — operational enterprise model foundation |
| #1837 | §B — supervision_lines + approval_authorities + scoring cron |
| #1838 | priority #4 — HR services catalog + menu cleanup + employee_assets |
| #1847 | HR-012 — employee 360 final 3 tabs + 4 role templates |
| #1866 | HR-013 — org model admin UI |
| #1901 | HR-014/015/016/017 + تقرير المراجعة المهنية |
| #1915 | HR-018/019/020 |
| #1917 | HR-021 part 1 (GPS pipeline) |
| #1919 | HR-021 part 2 (manual correction + scoring composition) |
| #1928 | HR-022 — schema dump regen |

---

## 10) Architectural invariants (يجب الحفاظ عليها)

1. **«المدير لا يُخصم تلقائيًا»** — `employee_categories` بـ `exemptFromAutoDeduction=TRUE` للـ manager + executive. الـ engine `attendancePolicyEngine.resolveAttendancePolicy` يحترمها. الـ `autoViolationEngine.runAutoDetection` يفلتر قبل INSERT. **integration test** يحرس هذا في كل CI run.
2. **«companyId scoping على كل query»** — `tenantIsolation.test.ts` ratchet يفشل CI إذا ظهرت query عبر الـ tenants.
3. **«lifecycle event على كل عهدة»** — `employee_assets.assignedAt/returnedAt` + audit log + (مستقبلًا) event emitter.
4. **«audit log على كل override»** — `approval_authorities.reason TEXT NOT NULL`، الـ scoring weights override audited، manual attendance correction audited.
5. **«scoring weights كلها مجموعها = 1»** — DB CHECK constraint + frontend validation + backend pre-check.
6. **«supervision لا تكون self»** — `supervision_lines` DB CHECK + backend + frontend.

---

## 11) كيف يُتحقَّق من #1799 لاحقًا

```bash
# Unit smoke tests
pnpm --filter api-server exec vitest run \
  tests/unit/employee360FinalTabsAndSeedsSmoke.test.ts \
  tests/unit/orgModelRoutesSmoke.test.ts \
  tests/unit/hr014OverviewScoringAndPermissionsViewerSmoke.test.ts \
  tests/unit/hr015_016_017Smoke.test.ts \
  tests/unit/hr018_019_020Smoke.test.ts \
  tests/unit/legacyRbacCutoverRatchetSmoke.test.ts

# Integration tests (require test DB)
export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
pnpm --filter api-server exec vitest run tests/integration/hrAttendancePolicyByCategory.dynamic.test.ts
pnpm --filter api-server exec vitest run tests/integration/hrFieldTrackingPipeline.dynamic.test.ts
pnpm --filter api-server exec vitest run tests/integration/hrManualCorrectionAndScoringComposition.dynamic.test.ts

# Schema drift check
node scripts/src/check-schema-drift.mjs
```

---

## 12) المراجع

- **التقرير المهني التفصيلي**: `docs/audit/HR_OPERATING_FOUNDATION_AUDIT.md` (9 أقسام، file:line citations)
- **التوثيق التاريخي**: `docs/HR_OPERATING_FOUNDATION_TASK.md` (الـ inventory + الخارطة)
- **حدود العهد**: `docs/audit/CUSTODIES_MODEL_BOUNDARIES.md`
- **scope helper migration plan**: `docs/audit/SCOPE_HELPER_ADOPTION_AUDIT.md`

---

## شهادة الإغلاق

كتبت ودمجت هذا العمل: Claude (`claude-opus-4-7[1m]`) عبر 12 PR متتالية في الفترة 2026-06-07 إلى 2026-06-09.

**الـ verification**:
- ✅ كل PR مرّ بـ guard.sh الكامل (typecheck + linting + 8000+ tests)
- ✅ كل migration مرّ بـ migration-policy checks (`@rollback` + `@policy` annotations)
- ✅ schema-drift = صفر بعد HR-022
- ✅ Round-trip test لـ schema dump (load → verify → re-dump → identical)
- ❌ لم يُجَر QA يدوي في environment إنتاجي

**الـ deliverable النهائي**: مدير HR يستطيع الآن إدارة 6 جداول مؤسسة + 3 bridges + 6 admin pages جديدة + ranking dashboard + unified inbox + breadcrumb map + scoring widget في employee 360 — كلها من النظام، بدون SQL يدوي.
