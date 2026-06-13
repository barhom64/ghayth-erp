# U-11 Alignment Review

**Status:** Investigation only. No new logic, no behavior change, no
migration. Existing implementation checked before this review.

**Trigger:** The owner ratified a new architectural direction on
#2080 after U-11 Phases 1 / 2 / 3a / 3b had already merged:

> "الوكيل الفرعي مربوط بالوكيل الرئيسي تشغيليًا، والوكيل الرئيسي هو
> المرتبط بالعميل المالي."
>
> SubAgent → operational dependent of Main Agent.
> Main Agent → the commercial / billing counterparty.
> Client → linked to Main Agent.

Under this direction:
- Sub-agent stays operational. Not a default financial customer.
- Main agent is the billing entity.
- `sub_agent_client_required` becomes the **exception**, not the
  norm.
- `main_agent_client` becomes the **target architecture**.

This review audits what was merged in U-11 Phases 1–3b against the
new direction, identifies the gap, and proposes a safe transition
plan. **No code in this PR changes behavior.**

---

## 1. What U-11 already merged (recap)

| Phase | SHA | What it does today |
| --- | --- | --- |
| Phase 1 | `0278e636` | Audit doc + regression smoke freezing the gap. |
| Phase 2 | `ff817d09` | `clientLinkagePolicy` catalog field + engine reads policy + tailored ConflictError per policy. |
| Phase 3a | `94e71662` | Import preview surfaces `clientLinkagePolicy` + `unlinkedSubAgentInvoicingHint`. FE banner explains "operational allowed, invoicing blocked, no auto-link". |
| Phase 3b | `84958345` | Two-step explicit-confirmation linker in the import wizard. Backend enriched audit + event (`before/after/reason/source`). |

All four implement the **sub-agent-as-billing-entity** flow. That
is the surface this alignment review measures against the **main-
agent-as-billing-entity** target.

---

## 2. Surfaces still oriented around sub-agent as billing entity

### 2.1 `umrahInvoicingEngine.ts`

| Line | Code | Misalignment |
| --- | --- | --- |
| 126 | `if (!subAgent.clientId) { ... throw ConflictError }` | Gate reads sub-agent.clientId. Should read main agent's linkage. |
| 562 | INSERT into `umrah_sales_invoices` uses `subAgent.clientId` as `clientId`. | Invoice is stamped against sub-agent's client. |
| 642 | Comment: "sub-agent's linked client (subAgent.clientId) IS the 'client-agent'". | Documents the misaligned assumption. |
| 648 | `clientId: (subAgent.clientId ...)` on GL dimension stamp. | Per-line dimension routes by sub-agent's client. |
| 1077 | `listUninvoicedGroups` returns `clientId: subAgent.clientId`. | Read API exposes the misaligned linkage. |

All five spots read `umrah_sub_agents.clientId`. None reads any
column on `umrah_agents` — because that column does not exist.

### 2.2 `umrah-entities.ts` linkage routes

| Route | Misalignment |
| --- | --- |
| `PUT /sub-agents/:id/link` | Writes `umrah_sub_agents.clientId`. Has a `createNew` branch that creates a `clients` row with `classification = 'umrah_agent'` linked to the SUB-agent — should be linked to the MAIN agent under the new direction. |
| `POST /sub-agents/link-by-nusk` (Phase 3b path) | Same UPDATE on sub-agent. |
| `POST /sub-agents/:id/link-client` | Same UPDATE on sub-agent. |
| `GET /sub-agents/unlinked` | Returns sub-agents missing `clientId`. Under the new direction, the meaningful "unlinked" cohort is main agents without a client linkage. |

### 2.3 `umrahImportEngine.ts` preview

Preview surfaces `unlinkedSubAgents` + `unlinkedSubAgentInvoicingHint`.
Under the new direction, the operational signal should be **unlinked
main agents**. Today the preview lacks the data to compute that.

### 2.4 `umrahSettingsPoliciesCatalog.ts`

The `clientLinkagePolicy` field with `defaultValue =
"operational_until_linked"` is **aligned** with the new direction
when read narrowly: a sub-agent stays operational until something
links it to a billing entity. But it leaves the linkage TARGET
implicit — the operator could (and many will) read it as "sub-
agent ↔ client", which is the wrong target.

The four enum values fit the new direction as:

| Value | New-direction meaning |
| --- | --- |
| `operational_until_linked` (default) | Sub-agent operational; main agent must be client-linked before invoicing. Re-interpretation OK. |
| `sub_agent_client_required` | Exception flow for companies that bill sub-agents directly. Today engine treats this as the norm — needs re-classification. |
| `main_agent_client` | The target architecture. Today engine routes to the same hard block as default (Phase 2 deliberate — needs migration). |
| `operator_confirmed_on_import` | Orthogonal — about confirmation flow, not about which entity is linked. Survives the realignment. |

### 2.5 Reports

`agent-balances` aggregates by `umrah_agents`. It does NOT depend on
`clientId` (Phase 1 §E). **Already aligned**: when invoicing is
re-oriented to main agent, this report keeps working unchanged.

`subagent-balances` aggregates by sub-agent and works without
`clientId`. Under the new direction it becomes a pure operational
rollup. **Aligned.**

### 2.6 GL dimension routing (`revenueAccountResolver.ts`)

Priority chain: `umrah_sub_agent → umrah_agent → umrah_season →
property_unit → property`. Walks via `subsidiary_accounts`
(entityType, entityId). The chain ALREADY includes the main agent
slot; under the new direction the sub-agent step becomes optional
/ secondary. **Mostly aligned.**

### 2.7 Existing main-agent → finance bridges

`POST /umrah/agents` (route `umrah.ts:758`) fires a non-blocking
`createSubsidiaryAccountsForEntity` for entityType='umrah_agent'.
**This already gives main agent a financial bridge** via
`subsidiary_accounts` (for account overrides). What it does NOT
give is a `clientId` for the AR dimension stamp or for the
`umrah_sales_invoices.clientId` column.

---

## 3. The data gap

The single structural blocker is:

> **`umrah_agents` has no `clientId` column (and no FK to
> `clients`).**

Every other re-orientation hangs off resolving this. Three
candidate ways to close the gap (each is a SEPARATE migration —
not in U-11):

| Option | Shape | Trade-off |
| --- | --- | --- |
| **A.** `umrah_agents.clientId INTEGER NULL` | Direct column, mirrors `umrah_sub_agents.clientId`. | Smallest delta. Symmetric design. Requires a migration owned outside U-11. |
| **B.** New table `umrah_agent_clients (agentId, clientId, role)` | Many-to-many capable. Allows a main agent to be billed under multiple roles (NUSK customer + corporate, etc.). | Heavier model. Most companies need only one row anyway. |
| **C.** `clients.umrahAgentId INTEGER NULL` | Inverse direction. | Pollutes the generic `clients` table with an umrah-specific FK. |

**Recommendation:** Option **A**. Mirrors the existing column on
sub-agents. Lowest delta. Engine fallback becomes a one-line
change once the column exists.

---

## 4. Impact analysis — assuming Option A lands later

| Surface | Today | Post-migration + engine fallback |
| --- | --- | --- |
| `umrahInvoicingEngine.ts:126` gate | `subAgent.clientId` required | Fallback to `agent.clientId` when sub-agent's is null. Either succeeds. |
| `umrah_sales_invoices.clientId` | Always sub-agent's client | The effective billing client per policy: `agent.clientId` (default under new direction). |
| GL dimension stamp | `clientId = subAgent.clientId` | `clientId = effectiveBillingClientId` (agent's, except in exception policies). |
| Import preview | Surfaces unlinked sub-agents | Switches to surfacing unlinked MAIN agents. Sub-agent "unlinked" notion becomes operational-only. |
| Linker routes | Write sub-agent's clientId | New canonical route writes `umrah_agents.clientId`. Existing sub-agent linkers become legacy / exception-mode. |
| `agent-balances` report | Works without clientId | Continues to work. Gains a "client linked" column. |
| `subagent-balances` report | Works without clientId | Continues to work. Drops any AR drilldown (sub-agent is operational only). |
| AR aging | Joins on invoice.clientId | Continues to work. No invoice schema change. |
| Historical invoices already issued | clientId = sub-agent's | **Not touched.** Per owner's permanent ban. |

**No historical data is rewritten.** The shift applies to invoices
created AFTER the engine fallback ships.

---

## 5. Closure boundary — does U-11 close here?

The new direction is incompatible with U-11's actionable scope
because:

- Migrations are forbidden inside U-11 (owner standing ban).
- `generateSalesInvoice` cannot route to `main_agent_client` until
  the column exists.
- The catalog's `main_agent_client` value will stay engine-dormant
  until a future migration lands.

Two honest readings:

### 5.A — "Soft close" U-11 here

What U-11 actually delivered remains valuable:
- A declared policy field that names the four operating stances.
- A hard invoicing gate (no silent invoicing).
- Import preview that names the policy + the gap before confirm.
- An explicit-confirmation linker with full audit/event for the
  sub-agent path.
- Hard guard against silent client creation, silent linkage, and
  silent AR opening — verified across 10 smoke files (203+ tests).

Under the soft-close reading, U-11 closes with these guarantees
intact and the alignment review records the next direction.

### 5.B — "Hold close" U-11 pending the agent.clientId migration

Wait for the migration + engine fallback before declaring U-11
done.

**Recommendation:** 5.A — soft close U-11. The infrastructure
U-11 built is real and protective even under the new direction.
Adding the migration + engine fallback is naturally a **separate
track** (call it "U-13 — main agent as billing entity") so the
two concerns don't mix.

---

## 6. Out of scope for THIS PR (explicit)

- ❌ No migration (umrah_agents.clientId stays absent).
- ❌ No change to `generateSalesInvoice`.
- ❌ No change to issued invoices.
- ❌ No client creation.
- ❌ No AR opening.
- ❌ No new linkage route.
- ❌ No catalog field rename or default flip.
- ❌ No FE behavior change.
- ❌ U-12 not opened.
- ❌ U-02b stays stopped at M5b.
- ❌ `main_agent_client` mode is not activated.

---

## 7. What this PR does ship

1. This document.
2. No source code change. No engine change. No FE change. No
   catalog change.
3. No new smoke (the existing 4 U-11 smokes still hold; nothing
   new to pin since no behavior changed).

When the owner ratifies the next step (either close U-11 with
the recap above, or commission "U-13 — main agent as billing
entity"), the executable work then lives in **that** PR — not
this one.

---

## 8. Next-step matrix — owner decision

| Decision | What I do next |
| --- | --- |
| Close U-11. New direction tracked separately as U-13. | Wait for U-13 authorization. Do not start. |
| Close U-11 + pre-stage U-13 audit (read-only) | I open a U-13 audit PR (same shape as U-11 Phase 1) when authorized. |
| Hold U-11 close pending the migration | I wait for migration authorization. Do not touch invoicing engine. |
| Drop U-11 direction entirely | Re-evaluate; U-11's smokes still protect against silent client creation and silent linkage — keeping them is safe. |

**Until you ratify one of these, no further code lands.**
