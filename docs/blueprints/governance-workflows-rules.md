# Blueprint — Governance / Workflows / Rules

This blueprint covers three tightly-coupled routers that together
form the cross-cutting control plane for the rest of the ERP:

- **Governance** (`/governance`) — policies, risks, audits, compliance
  controls, compliance-actions, CAPA.
- **Workflows** (`/workflows`) — the generic approval chain engine
  (submit / approve / reject / refer / escalate / return), workflow
  definitions, SLA definitions, timeline history.
- **Rules** (`/rules`) — per-company automation rules (if-this-then-
  that triggers applied to other modules).

Every other module depends on at least one of them: the workflow
engine gates leave approvals, discipline memos, purchase requests,
and invoice approvals. The governance module surfaces the compliance
actions raised by other modules' cron jobs. The rules engine feeds
the notification router.

## 1. Permissions

### Governance (`/governance`)

**No `requirePermission` gates** — every handler runs through
`authMiddleware` only. Same gap as Properties / Legal / Clients. When
the RBAC migration lands the router should use the
`governance:policy:*`, `governance:risk:*`, `governance:audit:*`,
`governance:compliance:*`, `governance:capa:*` split that is already
reserved in `lib/rbacCatalog.ts`.

### Workflows (`/workflows`)

**No `requirePermission` gates either.** The per-action authorization
is instead enforced inside each handler by matching
`scope.activeAssignmentId`'s `role` against the workflow step's
`requiredRole`. This is intentional — workflow permissions are
position-in-chain, not module-wide.

### Rules (`/rules`)

**No `requirePermission` gates.** Same deferred migration.

## 2. Tables written to

### Governance
| Table                              | Rows written by                                                          |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `governance_policies`              | Create / update / new-version / soft-delete. Policies carry `version`, `effectiveDate`, `linkedModules`. |
| `governance_risks`                 | Create / update (including treatment action), soft-delete.               |
| `governance_audits`                | Create / update (findings, close-out), soft-delete.                     |
| `governance_compliance`            | Create / update (status, evidence), soft-delete.                        |
| `governance_compliance_actions`    | Raised by governance handlers + by other modules (e.g. finance approval guard). Patched when completed / overdue. |
| `governance_capa`                  | Corrective / preventive action plans — create, update, close.           |

### Workflows
| Table                              | Rows written by                                                          |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `workflow_requests`                | Header: ref table, ref id, current step, status, SLA deadline.          |
| `workflow_approvals`               | One row per action on a request — submit, approve, reject, refer, escalate, return. |
| `workflow_timeline_events`         | Full audit trail (denormalized) for the request timeline view.          |
| `workflow_definitions`             | Per-company workflow definition — request type, labels, steps, SLA.     |
| `workflow_steps`                   | One row per step inside a definition — `stepOrder`, `requiredRole`, `slaHours`, `autoApproveOnTimeout`. |
| `sla_definitions`                  | Per-company SLA thresholds — warning, deadline, escalation, auto-approve-on-timeout targets. |

### Rules
| Table                              | Rows written by                                                          |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `automation_rules`                 | Create / update / toggle / soft-delete. Each rule has a trigger event + condition + action spec. |
| `automation_rule_logs`             | One row per rule firing — `ruleId`, trigger payload, action result.      |

## 3. Events emitted

- **Governance:** none. All governance writes are silent.
- **Workflows:** the workflow engine emits `workflow.request.submitted`,
  `.approved`, `.rejected`, `.referred`, `.escalated`, `.returned`
  through the `workflowEngine` helper (not directly from the router).
  Subscribers: the originating module (e.g. leave, discipline,
  invoice) listens for these to update its own row's status.
- **Rules:** the rules engine is itself the primary event *consumer* —
  it subscribes to events emitted by other modules (e.g.
  `finance.invoice.approved`) and fires the configured action. It
  does not emit its own events.

## 4. Scheduled jobs

From `lib/cronScheduler.ts`:

- **`hourly_workflow_sla_check`** (hourly, `0 * * * *`) — calls
  `checkSlaStatus` from `workflowEngine.ts`. It walks every active
  `workflow_requests` row, compares its SLA deadline to `NOW()`, and:
  - Fires a reminder notification when the warning threshold passes.
  - Escalates to the `escalateTo` role when the deadline passes.
  - Auto-approves when `autoApproveOnTimeout = true` and the
    escalation threshold passes — **but only for request types that
    allow auto-approve**. Discipline memos and invoice approvals are
    excluded because they write to payroll / GL.

- **`escalateStaleApprovals`** — the same cron also walks the
  generic approval queue for modules that don't use the workflow
  engine yet (e.g. HR discipline); see the HR Discipline blueprint
  for details.

There is no governance-specific cron yet. The compliance-actions
feed is populated on-demand by other modules' handlers.

## 5. Frontend entry points

### Governance
- `/governance` — `src/pages/governance.tsx` (thin tab shell, see
  Phase 6 refactor)
- Tabs: `compliance`, `compliance-dashboard`, `compliance-actions`,
  `policies`, `risks`, `audits`, `capa` — each extracted into
  `src/pages/governance/*-tab.tsx`
- `/governance/capa` — standalone detail route (not the tab)

### Workflows
- `/settings` → "Workflow Definitions" tab —
  `src/pages/settings/workflow-definitions-tab.tsx`
- `/settings` → "Approval Workflows" tab —
  `src/pages/settings/approval-workflows-tab.tsx`
- `/approvals/pending` — unified pending-approvals inbox reading
  from `GET /workflows/pending`
- Per-request timeline is embedded in every module's detail page
  (e.g. invoice detail, leave detail, memo detail)

### Rules
- `/settings` → "Automation Rules" tab — `src/pages/settings/*` (rules
  are managed under the general settings surface)

## 6. Known open issues

- **Phase 7 smoke test:** "Leave approval chain: submit → manager
  approve → HR approve → SLA warning → escalation" is the target
  flow for the workflow engine.
- **Deeper gap #1 (lifecycle enforcement):** today state transitions
  for workflow-gated entities are enforced partly by the workflow
  engine and partly by each module's own handler. Migrating all of
  them to `lib/lifecycleEngine.ts` is tracked under the lifecycle
  enforcement deeper gap.
- **Deeper gap #4 (unified RBAC):** all three routers have zero
  `requirePermission` gates. Needs the full split listed in §1.
- **Deeper gap #5 (event bus):** governance and rules are still
  silent on writes. The automation rules engine in particular should
  log its firings through the standard event bus so the rule-log
  table becomes queryable from the BI module.
- **Deeper gap #6 (communications gateway):** workflow SLA reminders
  and escalations are direct `createNotification` calls today. Once
  the communications gateway lands they should route through it so
  WhatsApp/SMS can be toggled per company.
- **Deeper gap #8 (decision engine):** the workflow engine is the
  closest thing to a "decision engine" that ships today, but it is
  chain-based only. The planned decision engine will add voting,
  quorum, and parallel-branch semantics on top of the same tables.
