# HR Smoke Test — runtime checklist

**Status:** 🟡 Active — run before every HR-touching PR merges to `main`
**Scope:** HR module only (the reference module — see `HR_REFERENCE_MODEL.md`)
**Audience:** whoever is about to ship an HR change, or the weekly
sanity-check reviewer.

This checklist verifies that the HR unification (PageShell + typed
errors + PageStatusBadge + useApiMutation) actually works end-to-end on
a running dev stack — NOT just that the code typechecks. `pnpm guard`
(static) and this document (runtime) together form the full safety
net.

---

## 0. Before you start

1. Fresh environment from the repo root:
   ```bash
   pnpm install
   pnpm --filter api-server db:migrate    # if you've pulled new migrations
   pnpm dev                               # starts api-server + ghayth-erp
   ```
2. Open http://localhost:8080 and log in as an **HR manager** role
   (not admin — admin bypasses most guards we want to test).
3. Have DevTools **Network** + **Console** tabs open for every flow.
   Every red console error or 500 response is a failure, even if the
   UI looks fine.
4. Seed data assumptions:
   - at least 1 branch
   - at least 3 employees, one of them with `status = probation`
   - at least 1 active shift and 1 public holiday
   If any of these are missing, stop and create them first — the
   checklist assumes them.

---

## 1. What we're testing

Each row below is one runtime check. The three columns are:

- **Happy path** — does the feature work for a valid input?
- **Typed error** — does an invalid input surface the _correct_ Arabic
  toast title (not `"حدث خطأ"`)?
- **Status rendering** — does the row use `<PageStatusBadge>` with the
  right color/label?

A failure in ANY column is a failure of the whole row.

### Acceptance for a green run

- [ ] Every row in §2 below has all three columns ticked.
- [ ] `grep "حدث خطأ"` appears **zero** times in the running DOM across
      all flows (inspect via DevTools "find in page" after each flow).
- [ ] Network tab shows **zero** `500` responses. `400`/`404`/`409`
      responses are OK **only if** the UI shows the typed toast that
      matches them.
- [ ] Console shows **zero** uncaught errors and **zero** React key
      warnings on HR pages.

---

## 2. The 15 flows

### Flow 1 — Employee list + status badge

**Page:** `/hr/employees`

1. Happy path: page loads, the table shows every seeded employee, and
   each row has a status badge.
2. Typed error: not applicable (read-only list).
3. Status rendering:
   - `probation` → amber badge, label "تحت التجربة"
   - `active` → green badge, label "نشط"
   - `inactive` → gray badge, label "غير نشط"
   If any badge renders as raw text (no color) or as English, the
   `PageStatusBadge` adoption for this page is broken.

**Counts as failure:** a row with a raw `<span>probation</span>`, a
hardcoded color, or a console warning about missing `domain` prop.

---

### Flow 2 — Create employee (happy + validation)

**Page:** `/hr/employees/create`

1. Happy path: fill every required field with valid data → submit →
   toast "تم إنشاء الموظف" → redirect to the new employee detail.
2. Typed error — missing required field: clear the "name" field →
   submit → toast title "بيانات غير صالحة" (ValidationError 422),
   description includes "الاسم مطلوب". Submit button must re-enable.
3. Typed error — duplicate national ID: enter an ID that belongs to an
   existing employee → submit → toast title "حالة غير صالحة"
   (ConflictError 409), description names the conflict.
4. Typed error — forbidden branch: as a user whose role doesn't cover
   the target branch, submit → toast title "غير مصرح" (ForbiddenError
   403).

**Counts as failure:** any toast showing "حدث خطأ"; any 500 in the
network tab; the form staying locked after a failed submit.

---

### Flow 3 — Employee activation / deactivation

**Page:** `/hr/employee-activation`

1. Happy path: flip an `active` employee to `inactive` → toast
   "تم التحديث" → row badge instantly re-renders in gray.
2. Typed error — already inactive: try to deactivate the same employee
   a second time (or race the request twice) → toast title "حالة غير
   صالحة" (ConflictError), description explains the state conflict.
3. Status rendering: after flip, `PageStatusBadge` re-renders without
   a page reload.

**Counts as failure:** needing F5 to see the new status; a 500; or
the row disappearing silently.

---

### Flow 4 — Attendance check-in (QR flow)

**Page:** `/hr/qr-scanner`

1. Happy path: scan or paste a valid employee QR payload → toast
   "تم تسجيل الحضور" → the attendance row appears in the daily list.
2. Typed error — already checked in: scan the same QR a second time
   within the same shift → toast title "حالة غير صالحة"
   (ConflictError), description mentions "تم تسجيل الحضور مسبقاً".
3. Typed error — invalid QR: paste garbage → toast title "بيانات غير
   صالحة" (ValidationError).
4. Typed error — employee not found: paste a well-formed QR for a
   deleted employee → toast title "غير موجود" (NotFoundError 404).

**Counts as failure:** a silent failure with no toast, a toast saying
"حدث خطأ", or the check-in succeeding for an inactive employee.

---

### Flow 5 — Leave request (create + approve + reject)

**Pages:** `/hr/leaves` + `/hr/leaves/create` + `/hr/leave-management`

1. Happy path — create: submit a leave request → toast "تم إرسال
   الطلب" → row appears in "معلق" state on `/hr/leaves`.
2. Status rendering: the new row renders via `PageStatusBadge
   domain="leave"` → `pending` → amber label "معلق".
3. Happy path — approve: as HR manager on `/hr/leave-management`,
   approve the row → row updates to green "موافق عليه".
4. Typed error — overlapping leave: create a second leave for the
   same employee inside the first range → toast title "حالة غير
   صالحة" (ConflictError), description names the overlap.
5. Typed error — insufficient balance: create a leave that exceeds
   the employee's annual balance → toast title "بيانات غير صالحة"
   (ValidationError), description includes the available balance.

**Counts as failure:** a leave created with overlap; any 500; the
approved row still showing "معلق" after a success toast.

---

### Flow 6 — Payroll run (happy + journal integration error)

**Pages:** `/hr/payroll` + `/hr/payroll/create`

1. Happy path: pick a month with no prior run → "تشغيل الرواتب" →
   toast "تم تشغيل الرواتب"; the month row appears with amount
   totals and a green badge.
2. Typed error — rerun: run the same month again → toast title "حالة
   غير صالحة" (ConflictError), description "تم تشغيل الرواتب لهذا
   الشهر مسبقاً".
3. Typed error — journal integration: if the finance journal endpoint
   is down (simulate by blocking `/api/finance/journal-entries` in
   DevTools), run payroll → toast title "خطأ في الخدمة الخارجية"
   (IntegrationError 502), description mentions "journal".
   **Important:** the payroll row itself MUST NOT be created when
   the journal call fails. If it is, the guarantee is broken.

**Counts as failure:** payroll row persisted despite a journal
failure; a 500 response anywhere; a toast saying "حدث خطأ".

---

### Flow 7 — Official letter generate + print

**Page:** `/hr/official-letters`

1. Happy path: pick an employee + letter template → "إنشاء" → toast
   "تم إنشاء الخطاب" → PDF preview opens.
2. Typed error — missing template: clear the template field → submit
   → toast title "بيانات غير صالحة" (ValidationError).
3. Typed error — employee without branch: pick an employee missing
   the branch relation → toast title "غير موجود" (NotFoundError) or
   "بيانات غير صالحة" depending on the backend check. Either is
   acceptable, as long as it is NOT "حدث خطأ".
4. Regression check — schema drift: this is the page that originally
   shipped the `official_letters."branchId"` silent 500. Confirm the
   Network tab shows `200` (not `500`) on the list GET.

**Counts as failure:** any 500 on list or create; the PDF blank; a
schema column error in the server logs.

---

### Flow 8 — Discipline memo (create + state transitions)

**Pages:** `/hr/discipline-memos` + `/hr/discipline-memo-detail/:id`

1. Happy path — create: submit a memo with severity + violation →
   toast "تم إنشاء المذكرة" → row appears in `draft` state.
2. Status rendering: `PageStatusBadge domain="memo"`:
   - `draft` → gray "مسودة"
   - `under_review` → amber "قيد المراجعة"
   - `approved` → green "معتمدة"
   - `rejected` → red "مرفوضة"
   - `appealed` → blue "مستأنفة"
3. Happy path — transitions: advance `draft → under_review →
   approved`. Each transition shows a typed success toast and the
   badge updates without page reload.
4. Typed error — invalid transition: try to skip `under_review`
   (draft → approved) → toast title "حالة غير صالحة" (ConflictError),
   description "لا يمكن الانتقال مباشرة إلى معتمدة".

**Counts as failure:** any transition that mutates state without the
backend's `ConflictError` check running.

---

### Flow 9 — Shifts management

**Pages:** `/hr/shifts-management` + `/hr/shifts`

1. Happy path: create a new shift with valid start/end → toast "تم
   إنشاء الوردية".
2. Typed error — overlap: create a second shift that overlaps an
   existing one for the same employee → toast title "حالة غير صالحة"
   (ConflictError).
3. Typed error — end before start: invert start/end → toast title
   "بيانات غير صالحة" (ValidationError), description names the field.
4. Status rendering: `active`/`inactive` shifts render via
   `PageStatusBadge` (no local color map — that was the HR-U4 fix).

**Counts as failure:** an inline colored `<Badge>` instead of
`PageStatusBadge`; a 500 on create; overlap allowed.

---

### Flow 10 — Salary components

**Page:** `/hr/salary-components`

1. Happy path: add a new allowance to an employee → toast "تم الحفظ".
2. Typed error — negative amount: enter `-100` → toast title "بيانات
   غير صالحة" (ValidationError).
3. Typed error — duplicate component: add the same allowance type a
   second time → toast title "حالة غير صالحة" (ConflictError).
4. Status rendering: `active`/`inactive` components via
   `PageStatusBadge` (HR-U4 removed the local map here too).

**Counts as failure:** a local colored Badge; any toast saying "حدث
خطأ"; a negative value accepted.

---

### Flow 11 — 360 Evaluation (self, peer, upward)

**Pages:** `/hr/evaluation-360`, `/hr/evaluation-360-peer`,
`/hr/evaluation-360-upward`

1. Happy path — self: submit a complete self-evaluation → toast "تم
   حفظ التقييم" → the row in history shows `completed`.
2. Happy path — peer: open a peer invitation link → submit →
   typed-success toast.
3. Happy path — upward: same for upward.
4. Typed error — JWT secret missing: if `EVALUATION_JWT_SECRET` is
   unset in the server env, the upward link should return an
   `IntegrationError` (502) with toast "خطأ في الخدمة الخارجية" and
   description naming the missing secret. Never a 500 with generic
   text — this was an HR-U4 fix.
5. Typed error — already submitted: submit the same peer form
   twice → second submit shows "حالة غير صالحة" (ConflictError).

**Counts as failure:** a 500 on any of the three forms; a missing
secret producing a generic error.

---

### Flow 12 — IDP (Individual Development Plan)

**Page:** `/hr/idp`

1. Happy path: create an IDP item → toast "تم الحفظ" → row appears.
2. Status rendering: the `Select` for plan status uses
   `resolveStatus(k)?.label` — meaning every option is Arabic and
   sourced from `STATUS_MAP`, not from a local `STATUS_LABELS`.
3. Typed error — missing title: clear the title → submit → toast
   title "بيانات غير صالحة".
4. Happy path — status change: flip the plan from `draft` to
   `in_progress` → instant badge update.

**Counts as failure:** English option labels; missing status flip;
any "حدث خطأ".

---

### Flow 13 — Transfers

**Page:** `/hr/transfers`

1. Happy path: create a transfer request (from-branch → to-branch) →
   toast "تم إرسال الطلب".
2. Status rendering: the row badge uses `PageStatusBadge`
   (`pending/approved/rejected`) — no local STATUS_LABELS.
3. Typed error — same source and destination: pick identical
   branches → toast title "بيانات غير صالحة" (ValidationError).

**Counts as failure:** a local status map; any 500; a transfer with
source == destination persisted.

---

### Flow 14 — Onboarding review (synthetic status)

**Page:** `/hr/onboarding-review`

1. Happy path: the list renders every new hire with a synthetic
   `in_review` status.
2. Status rendering: `PageStatusBadge` with domain `shared`
   (`in_review` lives in `STATUS_MAP.shared` per HR-U3).
3. Happy path — approve: approve a row → it disappears from the
   pending list and the employee moves to `active`.

**Counts as failure:** the badge shows "in_review" in English or has
no color; approving throws a 500.

---

### Flow 15 — Public holidays + expiring documents

**Pages:** `/hr/public-holidays` + `/hr/expiring-documents`

1. Happy path — public holidays: create a holiday on an existing
   date → toast title "حالة غير صالحة" (ConflictError), description
   "يوجد يوم عطلة بنفس التاريخ".
2. Happy path — public holidays: create a holiday on a unique date →
   toast "تم الحفظ".
3. Happy path — expiring documents: page loads with rows for every
   employee document within the next 30 days; each row renders via
   `PageStatusBadge` with `expired` / `expiring_soon` labels.

**Counts as failure:** a duplicate holiday accepted; English status
labels on the documents page.

---

## 3. Cross-cutting checks

Run these once at the end of the whole session — they depend on every
flow above having executed:

- [ ] Open DevTools, **Console** tab → filter by `error` → zero
      results across all flows combined.
- [ ] Open DevTools, **Network** tab → filter by `status-code:500` →
      zero results.
- [ ] Open DevTools, **find in page** (Ctrl+F in Elements) on each
      HR page → search `حدث خطأ` → zero results (including cached
      toast regions).
- [ ] Server logs (`pnpm dev` output): zero `[ERROR]` lines that were
      not already visible as typed toasts in the UI.
- [ ] `bash scripts/health-check.sh` (Replit's runtime probe) → all
      checks green. This exercises the DB columns + live endpoints
      from a different angle.

---

## 4. When a flow fails

1. **Don't fix it in the checklist.** Fix it in the code, commit,
   re-run `pnpm guard`, then re-run the failing flow.
2. If the failure is a typed-toast regression (generic error instead
   of the typed one), look at the mutation site first. The escape
   hatch is `buildErrorToast(err)` — see `HR_REFERENCE_MODEL.md §4`.
3. If the failure is a schema drift (500 with column error in the
   server logs), the `audit:schema` guard missed it — update
   `db/schema.sql` via `pnpm db:dump-schema` OR fix the SQL, and
   consider whether the audit rule needs tightening.
4. If the failure is an orphan page (404 on a link that should
   exist), it means the page is not imported from any route file —
   the `audit:routes` guard missed it. Wire it up, then rerun `pnpm
   audit:routes`.

Every failure is a data point for the guardrails. If a class of
failure keeps appearing, the right response is a new guard in
`scripts/src/`, not a patched flow in this file.

---

## 5. History

- **2026-04-16** Initial checklist written alongside the guardrails
  stack. Covers 15 runtime flows. Builds on the HR-U1…U4 sprints
  closed in `HR_REFERENCE_MODEL.md`.
