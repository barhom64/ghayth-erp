# U-17 — Notifications flow + notify-* policy audit

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §4 + §7.

**Backlog title:** "Notification flow + wire notify* policies."

**TL;DR:** Two umrah notification modules exist:
`umrahInternalNotifications.ts` (in-app to managers) is wired to
cron. `umrahNotifications.ts` (outbound SMS to pilgrims) **exists
as exported functions but has no callers** — a smoke explicitly
confirms the cron switched to the internal helper and removed the
SMS path. **Result:** pilgrims never receive SMS for visa/
departure/overstay events. The agent + sub-agent are also out of
the loop. Recovery is to re-wire the outbound module behind a
catalog policy + extend the recipient resolution.

---

## 1. Inventory — what exists

### 1.1 Two modules
| Module | Lines | Purpose | Wired? |
| --- | --- | --- | --- |
| `umrahInternalNotifications.ts` | 177 | In-app push to manager + GM/owner | ✅ wired by cron (visa, departure, overstay) |
| `umrahNotifications.ts` | 117 | SMS/WhatsApp to pilgrim (visa, departure, overstay) | ❌ **dead — no callers** |

### 1.2 Internal flow (working)
`umrahInternalNotifications.ts` exports 3 helpers:

| Function | Recipient | Trigger |
| --- | --- | --- |
| `notifyInternalVisaExpiring(ctx, daysRemaining)` | resolveInternalRecipients(ctx) → branch manager + GM/owner | visa expiry cron (daily) |
| `notifyInternalDepartureTomorrow(ctx, {tripDate, flightNumber})` | same | departure-tomorrow cron |
| `notifyInternalOverstayWarning(ctx, daysOverstayed)` | same | overstay cron |

Each writes a row to the `notifications` table (`createNotification`),
emits an event (`umrah.pilgrim.overstay_risk` for the visa case),
and deep-links to `/umrah/pilgrims/:id`.

### 1.3 Outbound flow (DEAD)
`umrahNotifications.ts` exports:
- `notifyVisaExpiringSoon(target, payload)` — Arabic SMS body, queues via `sendMessage`
- `notifyDepartureReminder(target, payload)`
- `notifyOverstayWarning(target, payload)`

Pinned by smoke `umrahNotificationsSmoke.test.ts`:
- Channel = `"sms"`
- TemplateKey = `"umrah.visa.expiring"` (etc.)
- EventAction = `"umrah.notifications.visa_expiring.sent"` (etc.)

**Pinned by smoke `umrahInternalNotificationsSmoke.test.ts:73-76`:**
> "visa expiry cron imports notifyInternalVisaExpiring (not notifyVisaExpiringSoon)
> The legacy SMS import is gone; the internal helper takes over."

So the smoke EXPLICITLY confirms the SMS path was unwired. The
3 functions remain exported but dead.

### 1.4 Recipient resolution
`resolveInternalRecipients(ctx)` walks:
1. `getManagerAssignmentId(ctx.companyId, ctx.branchId)` — branch manager
2. `SELECT id FROM employee_assignments WHERE companyId=$1 AND role IN ('general_manager', 'owner') AND status='active'`

**Missing from this resolution:**
- The sub-agent who imported the pilgrim
- The main agent the pilgrim is attributed to
- The pilgrim themselves (no SMS layer)

---

## 2. Gaps

### 2.1 Outbound to pilgrim is dead code
The 3 functions in `umrahNotifications.ts` are not called from
anywhere. The smoke at `umrahInternalNotificationsSmoke.test.ts:73`
is pinned to keep it that way. **Operational impact:** pilgrims
get no SMS for visa expiry, departure reminders, or overstay
warnings. They depend on the agency to chase them via WhatsApp
manually.

### 2.2 No notify-* catalog policy
There's no `umrah.notifications.*` key in
`umrahSettingsPoliciesCatalog.ts`. Operators can't enable/disable
specific channels (SMS vs in-app) per company without code change.
This is the "wire notify* policies" half of the backlog title.

### 2.3 Sub-agent + main agent out of the loop
`resolveInternalRecipients` only finds branch manager + GM. The
agency's actual subject-matter expert for that pilgrim — the
sub-agent who imported them and is responsible for the trip — is
NOT notified. Same for the main agent who oversees the sub-agent.

### 2.4 No batching/digest
Each event = one notification row. A daily visa-expiry cron over
50 pilgrims pushes 50 notifications to the manager. **Better:**
a single digest "10 pilgrims have visas expiring this week" with
a roll-up table on the notification body.

### 2.5 No event payload completeness check
The internal notifier emits `umrah.pilgrim.overstay_risk` with
`{daysRemaining, reason: "visa_expiring"}`. **Missing on the
payload:**
- `agentId`, `subAgentId`, `groupId` (overlap with U-05's JE dim
  gap)
- `seasonId`
- `branchId`
- `nationality`

The U-03 audit covered event payload completeness in general;
the umrah outbound events have not been individually verified
against that pattern.

### 2.6 No retry queue for SMS failures
The dead `sendMessage` path doesn't have visible retry semantics
in the audit window. If a tenant has 3 failed numbers in a row,
does the queue back off? Pause for the whole batch? Unclear.

### 2.7 No opt-out per pilgrim
There's no `pilgrim.notifications_opt_out` flag. A pilgrim who
asks the operator to stop messaging them has no way to be
excluded from the bulk cron.

### 2.8 No multi-language body
The Arabic body is hardcoded. Some operators serve non-Arabic
speakers (Pakistani, Indonesian, Turkish pilgrims). No
`templateKey` lookup by language.

---

## 3. Recovery — phased plan (proposed)

### 3.1 U-17-P1 — catalog policy keys (🟢 autonomous)
Add to `umrahSettingsPoliciesCatalog.ts`:
- `umrah.notifications.visa_expiring.sms` (boolean, default: `false`)
- `umrah.notifications.visa_expiring.in_app` (boolean, default: `true`)
- `umrah.notifications.departure.sms` / `.in_app`
- `umrah.notifications.overstay.sms` / `.in_app`
- `umrah.notifications.digest_mode` (`"per_event"` | `"daily_digest"`, default: `"per_event"`)

Smoke pins catalog shape. Engine doesn't read these yet — that's P2.

### 3.2 U-17-P2 — engine reads policy + wires SMS conditionally (🟢 borderline)
Cron functions read the new policy keys and dispatch
`notifyVisaExpiringSoon` (etc.) when the SMS toggle is true.

**Borderline because:** re-introducing the SMS path means
`sendMessage` will actually fire for tenants who flip the toggle
on. The behaviour change is opt-in (policy default = false) but
the engine-side wiring counts as "behavior change" under §3.
**Owner ratification recommended** before P2.

### 3.3 U-17-P3 — sub-agent + main agent recipient expansion (🟢 autonomous)
Extend `resolveInternalRecipients` to also include:
- The sub-agent's primary contact employee (via
  `umrah_sub_agents.contactEmployeeId` — schema check needed; may
  be a P0 sub-task to add the column).
- The main agent's primary contact employee (same shape).

Per-policy toggle to include/exclude each level.

### 3.4 U-17-P4 — digest mode (🟢 autonomous)
When `digest_mode = "daily_digest"`, the visa-expiry cron
aggregates per recipient into a single notification with a
table body listing all affected pilgrims, instead of N rows.

### 3.5 U-17-P5 — pilgrim opt-out + multi-language (🟢 autonomous)
- Schema: `umrah_pilgrims.notifications_opt_out` (boolean,
  nullable).
- Cron filters out opt-outs.
- Body template keyed by pilgrim's `language` (default: ar).

### 3.6 U-17-P6 — closure smoke (🟢 autonomous)
- Static smoke that the cron correctly reads each policy key
  before dispatching.
- Static smoke that the outbound module's 3 functions ARE called
  (or skipped) based on the policy toggle.
- Dynamic test that seeds a tenant, sets policies, runs the cron,
  asserts both `notifications` rows AND outbound queue rows.

---

## 4. Permanent hard rails preserved (U-17 will not cross)

- ❌ No engine touch for the dead module re-wire without owner
  ratification (P2 borderline).
- ❌ No migration in P1/P2/P4/P6 (purely additive catalog + engine).
- ❌ U-17-P5 migration is additive nullable column.
- ❌ No silent linkage. ❌ No JE.
- ❌ No catalog default flip (all new policies default to `false`
  for SMS, `true` for in-app to preserve current behaviour).
- ❌ No mass message blast — opt-out + per-policy toggles + tenant
  scope enforced.

---

## 5. Out of scope for THIS PR (explicit)

- ❌ No catalog edit. ❌ No engine touch. ❌ No FE. ❌ No smoke.
- ❌ FIN-P4-CONTRACT execution untouched.
- ❌ BILL-MAIN P4/P4a/P4b/P4c/P5 untouched (hard-pause).
- ❌ U-02b M6+, U-07, U-09, U-12 untouched.
- ❌ U-04 / U-05 / U-06 / U-14 / U-16 — independent.

---

## 6. What this PR ships

1. This audit doc.
2. No source code change. The existing umrah smokes + cron flow
   continue to protect the surface unchanged.

---

## 7. Closure verdict

- 🟢 **U-17 closes with FLOW INVENTORIED + 8 GAPS DOCUMENTED + 6
  RECOVERY PHASES SCOPED.** The in-app side is well-built; the
  outbound side is dead code with a smoke holding it dead.
  Recovery is mostly additive policy + extended recipient list.
- ➜ **Next autonomous step**: U-17-P1 (catalog policy keys).
- ➜ **Owner decision recommended** for U-17-P2 (re-wiring the
  SMS engine path = behaviour change for any tenant flipping the
  toggle on). Default `false` keeps existing behaviour.
- ➜ **Hard-pause queue unchanged.** FIN-P4-CONTRACT code,
  BILL-MAIN P4+/P5, U-02b M6+, U-07 stay hard-paused.
