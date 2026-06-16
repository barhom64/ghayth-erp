# U-13 — Main Agent as Billing Entity (Audit Only)

**Status:** Investigation only. **No code change. No migration.
No behaviour change. No PR follow-up authorised yet.**

Existing implementation checked before this audit.

---

## 1. The architectural direction (recap from #2080)

Owner-ratified direction:

> SubAgent → تابع تشغيلي للوكيل الرئيسي.
> MainAgent → الطرف التجاري / الفوتري.
> Client → مربوط بالوكيل الرئيسي.

Operational consequence:
- `sub_agent_client_required` becomes an exception flow.
- `main_agent_client` becomes the target architecture.
- Historic invoices stamped against sub-agent's client are **not
  touched**.

U-11 already shipped (and remains valuable as a protection
layer):

| U-11 phase | Merge SHA |
| --- | --- |
| Phase 1 — audit + freeze | `0278e636` |
| Phase 2 — policy field + engine | `ff817d09` |
| Phase 3a — detection in import preview | `94e71662` |
| Phase 3b — explicit-confirmation linker | `84958345` |
| Alignment Review | `bc95bd1a` |

U-13 is the **separate track** the alignment review anticipated.
This audit is its Phase-1-equivalent.

---

## 2. Surface inventory — additions and refinements over U-11

### 2.1 What's NEW vs the U-11 alignment review

The alignment review surveyed where the engine reads
`subAgent.clientId`. U-13 adds:

- The exact existing GL bridge that `umrah_agents` already has via
  `subsidiary_accounts`.
- The shape of `createSubsidiaryAccountsForEntity('umrah_agent',
  ...)` — already provisions a **revenue** subsidiary per agent
  but **not** AR.
- Why this matters: switching billing to main agent is not a
  drop-in column add — it has GL implications.

### 2.2 `umrah_agents` — already has a finance bridge (for revenue)

`POST /umrah/agents` (routes/umrah.ts:758) fire-and-forgets
`createSubsidiaryAccountsForEntity('umrah_agent', ...)`
(accounting-engine.ts:668-784). For `umrah_agent` entityType the
helper provisions exactly one subsidiary line:

```
{ accountType: "revenue", parentCode: "4130", suffix: "إيراد عمرة" }
```

So every main agent **already has a postable revenue leaf under
4130**. `resolveRevenueAccount` (revenueAccountResolver.ts:70–135)
picks this up automatically through the chain
`umrah_sub_agent → umrah_agent → ...`.

**What it does NOT provision:**
- ❌ `accountType: "receivable"` — main agents do not have a
  per-agent AR subsidiary.
- ❌ Any link to a `clients` row — `subsidiary_accounts` is
  account-level, not party-level.

By contrast, `client` entityType DOES get a receivable subsidiary:
```
{ accountType: "receivable", parentCode: "1130", suffix: "ذمم" }
```

So under the current architecture, AR per umrah-billed-party is
reachable only through a `clients` row's subsidiary, not through an
`umrah_agents` row. **This is the structural reason why moving
billing to main agent requires linking agent → client.**

### 2.3 `umrah_sub_agents.clientId` paths (recap from U-11 Phase 1)

The five engine read sites + four linkage routes from the U-11
alignment review §2.1 — §2.2. U-13 does not change any of them. The
list is preserved as the migration surface to touch *after*
U-13 lands.

---

## 3. Three migration shapes — refined effort matrix

Refining the three options from the U-11 alignment review:

| Option | Shape | Effort | Risk | Notes |
| --- | --- | --- | --- | --- |
| **A.** Add `umrah_agents.clientId INTEGER NULL` + reuse the existing client subsidiary chain | 1 migration + 1 zod + 1 route + 5 engine spots + 1 catalog flip | **Small** | **Low** — column is nullable, existing rows stay valid | Mirrors `umrah_sub_agents.clientId`. Engine fallback becomes one line. The existing client-AR subsidiary chain takes over per-agent AR. |
| **B.** New table `umrah_agent_clients(agentId, clientId, role)` many-to-many | 2 migrations (table + indexes) + new lookup helper + 5 engine spots + 1 catalog flip + new routes for join management | **Medium** | **Medium** — model risk if the role enum doesn't fit billing-vs-collection-vs-statement distinctions | Defers commitment to a single billing entity per agent. Most companies need only one row → schema bloat for the average case. |
| **C.** Add `clients.umrahAgentId INTEGER NULL` (inverse direction) | 1 migration + 5 engine spots + new linker route + inverse-direction lookup | **Small–Medium** | **Medium** — pollutes the generic `clients` table with an umrah-specific FK; complicates CRM-wide constraints | Functionally equivalent to A but on the wrong table. |

**Recommendation stands at Option A.** Lowest delta, mirrors
existing sub-agent column, doesn't pollute CRM.

---

## 4. Sequencing — phased migration plan (audit-only proposal)

If the owner ratifies a U-13 implementation track, the natural
sequence (mirrors U-11's slicing):

| Phase | Scope | New behaviour? | Migration? |
| --- | --- | --- | --- |
| **U-13 P1** | Audit doc + freeze regression smoke (this is what this PR is) | No | No |
| **U-13 P2** | Migration: add `umrah_agents.clientId INTEGER NULL` + index on `(companyId, clientId)`. Backfill = none (intentionally null) | No engine read yet | **Yes** — requires separate auth |
| **U-13 P3** | Linker route `PUT /umrah/agents/:id/link-client` + Audit/Event + FE button on agent detail page | New linker UX, no invoicing change | No |
| **U-13 P4** | Engine fallback in `generateSalesInvoice` under `main_agent_client` policy: read `subAgent.agent.clientId` when sub-agent's is null. Sub-agent stays as override | New behaviour activated **only** for companies that flip the policy | No |
| **U-13 P5** | Catalog default flip: `main_agent_client` becomes the default for NEW companies; existing companies keep their setting. Documentation update | New default for new companies | No |
| **U-13 P6** | Import preview re-orientation: surface unlinked main agents (not sub-agents) when the policy is `main_agent_client` | UX refinement only | No |
| **U-13 P7** | Closure pack: contract / e2e / smoke proving the whole loop | Tests only | No |

**No phase ever:**
- Edits historical invoices.
- Auto-creates a client.
- Auto-links a main agent to a client.
- Opens AR silently.
- Bulk-applies any linkage.

---

## 5. Impact analysis (deeper than alignment review §4)

### 5.1 GL line dimension stamp

Today (post-U-11):
```
clientId: subAgent.clientId              // billing client
umrahAgentId: subAgent.agentId           // operational dim
umrahSeasonId: seasonId
```

Under U-13 P4:
```
const billingClientId = policy === "main_agent_client"
  ? (agent.clientId ?? subAgent.clientId)
  : subAgent.clientId;

clientId: billingClientId
umrahAgentId: subAgent.agentId
umrahSeasonId: seasonId
```

The engine gate at line 126 becomes:
```
if (!billingClientId) throw new ConflictError(...);
```

### 5.2 AR resolution

`subsidiary_accounts` for entityType='client' (provisioned by
`createSubsidiaryAccountsForEntity('client', ...)`) already gives
each client a per-client receivable leaf under `1130`. Once
`umrah_agents.clientId` points at a client, the existing AR
subsidiary chain works end-to-end with **no AR table change**.

**No new AR ledger table. No backfill on existing receivables.**

### 5.3 Reports

- `agent-balances` — aggregates by `umrah_agents`. Gains a "linked
  client" column. Existing rows show whatever they currently show.
- `subagent-balances` — becomes operational-only (no AR drilldown).
- Finance AR aging — joins on `invoices.clientId`. Continues to
  work; per-main-agent rollups gain a real story.
- Statement generation — needs a sibling "agent statement"
  endpoint under `main_agent_client` mode. **Out of U-13 P1–P5
  scope** — punt to P6 or a follow-up.

### 5.4 Migration safety

Adding `umrah_agents.clientId INTEGER NULL` with no backfill:
- Zero data risk.
- Zero downtime risk (additive column).
- Existing rows continue to invoice against `subAgent.clientId`
  (the engine only consults `agent.clientId` when the policy is
  explicitly `main_agent_client`).
- Rollback = drop the column. No data loss.

### 5.5 Historical invoices

**Untouched.** The engine fallback affects only invoices created
AFTER P4 ships AND only for companies that flip the policy. No
back-rewrite, no re-stamp, no migration of `umrah_sales_invoices`.

---

## 6. Out of scope for THIS PR (explicit)

- ❌ No migration.
- ❌ No `umrah_agents.clientId` column added in this PR.
- ❌ No engine change.
- ❌ No FE change.
- ❌ No new route.
- ❌ No catalog default flip.
- ❌ No issued-invoice edit.
- ❌ No client creation.
- ❌ No AR opening.
- ❌ No `main_agent_client` activation.
- ❌ U-12 not opened.
- ❌ U-02b stopped at M5b.

---

## 7. What this PR ships

1. This audit doc.
2. No source code change.
3. No new smoke (the existing 11 U-11 + U-02b smokes — 191/191 —
   continue to protect the surface unchanged).

When the owner ratifies the next step, the executable migration
+ engine fallback lives in **separate PRs** under the phase plan
in §4. Each phase opens its own audit/freeze pattern.

---

## 8. Owner decision matrix

| Decision | What I do next |
| --- | --- |
| Authorise **U-13 P2** (migration only) | I draft a migration PR with the column + index + a freeze smoke. No engine touch. Wait for explicit merge auth. |
| Authorise **U-13 P1 close + freeze U-13 audit here** | No further code. U-13 stays as a documented direction for later. |
| Defer U-13 entirely | I close the U-13 branch and document deferral on #2080. |
| Change recommended option (A → B or C) | I revise §3 with the chosen shape. |

**Until you ratify one of these, no further code lands.**

This PR does **not** self-merge. U-13 starts as documentation
and waits for explicit owner direction on §8.
