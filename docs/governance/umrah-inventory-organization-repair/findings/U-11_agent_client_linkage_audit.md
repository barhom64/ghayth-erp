# U-11 — Agent / Sub-Agent → Financial Client Linkage Audit

**Status:** Investigation only. **No new logic was built.**
Existing implementation checked before build, per the explicit
authorisation on issue #2080's parallel thread.

**Authorisation scope:** Audit + freeze current behaviour with a
regression smoke. Policy decisions for cases A–D below remain
pending owner ratification.

---

## 1. Surfaces investigated

| Surface | File | Key lines |
| --- | --- | --- |
| `umrah_agents` schema | `db/schema_pre.sql` | 19416–19437 |
| `umrah_sub_agents` schema | `artifacts/api-server/src/migrations/093_umrah_phase2_tables.sql` | 2–22 |
| `clients` schema | `db/schema_pre.sql` | 5495–5523 |
| Agent CRUD | `artifacts/api-server/src/routes/umrah.ts` | 648–801 |
| Sub-agent CRUD | `artifacts/api-server/src/routes/umrah-entities.ts` | 226–493 |
| Client CRUD | `artifacts/api-server/src/routes/clients.ts` | 145–534 |
| `resolveAgent` | `artifacts/api-server/src/lib/umrahImportEngine.ts` | 1518–1540 |
| `resolveSubAgent` | `artifacts/api-server/src/lib/umrahImportEngine.ts` | 1542–1585 |
| `previewMutamersImport` | `artifacts/api-server/src/lib/umrahImportEngine.ts` | 649–870 |
| `confirmMutamersImport` | `artifacts/api-server/src/lib/umrahImportEngine.ts` | 897–1108 |
| `confirmVouchersImport` | `artifacts/api-server/src/lib/umrahImportEngine.ts` | 1110–1359 |
| `postNuskJournalEntries` | `artifacts/api-server/src/lib/umrahImportEngine.ts` | 1399–1512 |
| `import-unlinked` (BE) | `artifacts/api-server/src/routes/umrah-entities.ts` | 1839–2025 |
| `import-unlinked` (FE) | `artifacts/ghayth-erp/src/pages/umrah/import-unlinked.tsx` | full file |
| `generateSalesInvoice` | `artifacts/api-server/src/lib/umrahInvoicingEngine.ts` | 76–728 (gate at 89) |
| `umrahInvoicingEngine` exports | same | 76, 734, 905, 1032, 1209 |
| Account + dimension routing | same + `lib/revenueAccountResolver.ts` | 575–676 + 70–135 |
| `/umrah/settings` catalog | `artifacts/api-server/src/lib/umrahSettingsPoliciesCatalog.ts` | 11 categories total |
| Agent/sub-agent balance reports | `artifacts/api-server/src/routes/umrah.ts` | 3379–3461, 3590–3684 |
| Finance AR aging tolerance | `artifacts/api-server/src/lib/finance-algorithms.ts` | (LEFT JOIN clients) |

---

## 2. Current behaviour — what's there today

### 2.1 Storage layer

- **`umrah_agents` has NO `clientId` column.** Agents reach
  the GL/AR exclusively through the polymorphic
  `subsidiary_accounts` (entityType='umrah_agent') row that
  POST /agents auto-creates via
  `createSubsidiaryAccountsForEntity`.
- **`umrah_sub_agents.clientId` exists and is `nullable`**
  (no NOT NULL constraint, no FK constraint either — declared as
  `"clientId" integer,` at migration 093 line 9).
- `clients` is a CRM-shape table — name, phone, email,
  classification, etc. It has **no GL/AR columns**. Financial
  routing for a `clients` row also lives in
  `subsidiary_accounts` (entityType='client').

### 2.2 Import path

- `resolveAgent` and `resolveSubAgent`
  (`umrahImportEngine.ts:1518` / `1542`) match by NUSK code or
  name; if no match, they **auto-create** the row.
- **Neither helper touches the `clients` table.**
  Auto-created `umrah_sub_agents` rows ship with
  `clientId = NULL`.
- `confirmMutamersImport` (line 897) inserts pilgrims + auto-
  creates agents/sub-agents/groups. No client, no AR, no GL.
- `confirmVouchersImport` (line 1110) calls the same resolvers
  AND posts AP (purchase-side) journal entries via
  `postNuskJournalEntries`. The AP JE lines carry
  `umrahAgentId` + `umrahSeasonId` dimensions and a
  `vendorId` (the company's configured `nuskSupplierId`).
  **`clientId` is not used on the AP side** — this is the NUSK
  supplier path, not the sales-to-agent path.
- `import-unlinked` means "pilgrim row missing an
  `agentId` / `subAgentId` / `groupId`". It does **not** mean
  "sub-agent missing a `clientId`".

### 2.3 Sales-invoice path

- `generateSalesInvoice` (`umrahInvoicingEngine.ts:76`) requires
  `subAgent.clientId`. **Hard gate at line 89:**

  ```ts
  if (!subAgent.clientId)
    throw new ConflictError(
      "الوكيل الفرعي غير مربوط بعميل — يرجى ربطه أولاً",
      { field: "clientId" }
    );
  ```

- The engine **never** falls back to
  `agent.clientId` (the column doesn't exist) and **never**
  auto-creates a client. The operator must invoke the explicit
  linker first.
- Once past the gate, the engine writes
  `subAgent.clientId` to:
  - `umrah_sales_invoices.clientId` (line 505)
  - `clientId` dimension on **every** GL line (line 591)
- Account resolution walks
  `subsidiary_accounts` in this priority order
  (`revenueAccountResolver.ts:70–135`):
  `umrah_sub_agent` → `umrah_agent` → `umrah_season` →
  product/company default.

### 2.4 Explicit linker that already exists

`PUT /sub-agents/:id/link`
(`routes/umrah-entities.ts:412`) accepts:

- `clientId` → links the sub-agent to an existing client; sets
  `clients.classification = 'umrah_agent'`.
- `createNew: { clientName, clientPhone }` → **auto-creates a
  `clients` row** (classification='umrah_agent',
  source='system') and links it.

Discovery surface:
`GET /sub-agents/unlinked` (`routes/umrah-entities.ts:268`)
filters `WHERE clientId IS NULL` and suggests a fuzzy match by
name.

### 2.5 Settings catalog

The `auto_link` category (id="auto_link",
`umrahSettingsPoliciesCatalog.ts:106–114`) has three fields:

- `autoCreateMissingAgents` (boolean, default `true`)
- `autoCreateMissingGroups` (boolean, default `true`)
- `fuzzyMatchMinConfidence` (number, default `0.6`)

**No catalog field governs sub-agent → client linkage, AR auto-
create, or sub-agent-as-customer behaviour.** Cases A–D below
have no declarative policy declaration today.

### 2.6 Reports tolerance

- `agent-balances` and `subagent-balances` reports
  (`routes/umrah.ts:3379` / `3590`) do **not** select or filter
  by `clientId`. They render correctly for sub-agents with
  `clientId = NULL`.
- Finance AR aging LEFT-JOINs `clients` and buckets
  null-`clientId` invoices into an `orphan:<id>` group. They
  appear but break per-client drill-downs.
- Since `generateSalesInvoice` blocks orphan creation, the AR
  aging report **never** sees a null-`clientId` umrah sales
  invoice today.

---

## 3. The real gap — proven, not asserted

The gap is **structural asymmetry** between the agent and sub-
agent linkage models, compounded by **a UX cliff at invoice
time**:

| Aspect | umrah_agents | umrah_sub_agents |
| --- | --- | --- |
| `clientId` column | **none** | nullable |
| GL access on creation | POST auto-creates `subsidiary_accounts` (entityType='umrah_agent') | POST does NOT create anything financial; explicit `/link` required later |
| Read by `generateSalesInvoice` | never | **mandatory** (line 89) |
| Read by GL dimension stamp | only via `umrahAgentId` dim | as `clientId` dim |
| Auto-linker | n/a (no clientId column) | `PUT /sub-agents/:id/link` (creates or links a `clients` row, sets `classification='umrah_agent'`) |
| Unlinked discovery | n/a | `GET /sub-agents/unlinked` |

The four operational consequences:

1. **Asymmetric mental model** — the system treats the
   *sub-agent* as the financial counterparty, while the
   day-to-day domain often thinks of the *main agent* as the
   billing customer.
2. **Hidden block** — an operator who imports pilgrims and
   tries to invoice for a freshly auto-created sub-agent hits
   a 409 `ConflictError` with no preceding signal. The error
   is the first time the system mentions "client" at all.
3. **No declared policy** — the catalog has no field that
   declares which of the four cases (§4 below) the company
   operates under. Behaviour is hard-coded to case B (sub-
   agent is independently linked), with no off-ramp for cases
   A, C, or D.
4. **No automated bridge** — even when the explicit `/link`
   path exists, nothing in the import pipeline calls it. The
   "auto-link" catalog category covers agents and groups but
   not clients.

---

## 4. Policy proposal — four cases, owner to ratify

| Case | Operational meaning | Current support | What it would take to support cleanly |
| --- | --- | --- | --- |
| **A** — main agent IS the customer | Single-tier bookkeeping; the agent is the legal counterparty and the sub-agents are operational hands underneath. | **Not modelled.** Engine never reads `agent.clientId`. Column doesn't exist. | Add a nullable `clientId` to `umrah_agents`. Change `generateSalesInvoice` to fall back to `agent.clientId` when `subAgent.clientId` is null. New catalog field: `customerEntity = 'agent'`. |
| **B** — sub-agent is an independent customer | Each sub-agent is a discrete legal billing entity. | **Today's default.** Supported end-to-end. Linker is manual: `PUT /sub-agents/:id/link`. | (Optional) Surface the linker as a step in the import-wizard's unlinked review, so operators see the linkage gap before they reach invoicing. New catalog field: `customerEntity = 'subAgent'` (default). |
| **C** — sub-agent under a main customer (hierarchy) | Sub-agent is a billing entity but rolls up to a parent customer for statement / collection. | **Not modelled.** `clients` has no `parentClientId`. | Add `parentClientId` to `clients` (nullable). Statements + AR aging would aggregate up the parent. **Not a U-11 scope item** — pure CRM model change; separate authorisation. |
| **D** — sub-agent is purely operational until linked | Sub-agent is a logistical anchor only; invoicing is blocked until the operator deliberately links it. | **Partially supported.** Storage allows null `clientId`; invoicing blocks with `ConflictError`. The block is correct but the UX cliff is sharp. | Surface "unlinked sub-agent" status in the FE list + group detail so the operator sees the block *before* opening an invoice draft. New catalog field: `subAgentDefaultStatus = 'operational_only'`. |

**Cross-cutting (regardless of case):**

- Decide whether the `auto_link` catalog gains a `clientLinkagePolicy` enum field whose values map to A / B / C / D.
- Decide whether the **import wizard** should *propose* a client link (with operator confirmation) or *defer* it entirely — the owner explicitly forbade automatic, silent client creation.
- Decide whether `PUT /sub-agents/:id/link` should remain operator-driven only.

---

## 5. Impact analysis — by case

### 5.1 Invoices

- Case A: existing `umrah_sales_invoices.clientId` lineage holds, but engine logic forks on the policy field. Issued invoices are not touched; only future invoices change destination.
- Case B: no change from today.
- Case C: clientId on invoices stays at the sub-agent's
  client; the *roll-up* happens in reporting, not on the
  invoice row.
- Case D: invoicing remains blocked until link; the policy
  field just makes the block UX-correct.

### 5.2 AR / GL

- The AR lives entirely in GL dimensions (`clientId`,
  `umrahAgentId`, `umrahSeasonId`) — no AR balance table.
  Cases A and C would point the GL `clientId` dimension at a
  different `clients` row; the chart of accounts isn't
  touched.
- The `subsidiary_accounts` priority chain
  (`sub_agent → agent → season → default`) keeps working
  unchanged in all cases.
- **No GL line is rewritten retroactively in any case.**

### 5.3 Reports

- `agent-balances` and `subagent-balances` already tolerate
  null `clientId`. They continue to render in all cases.
- Finance AR aging in cases A and C would lose the
  "orphan:<id>" bucket entirely (because every umrah sales
  invoice has a non-null `clientId`).
- Statement generation
  (`umrahInvoicingEngine.generateStatement`) is sub-agent-
  scoped; case A would need a sibling statement route
  ("agent statement") — also out of U-11's scope.

---

## 6. Regression smoke

A new test `umrahAgentClientLinkageGapSmoke.test.ts` freezes
the **observed current behaviour** so any future change to the
linkage surface becomes a deliberate, visible diff:

- Engine gate at `umrahInvoicingEngine.ts:89` is present and
  reads `subAgent.clientId`.
- `umrahImportEngine.ts` does NOT touch the `clients` table
  inside `resolveAgent` / `resolveSubAgent`.
- `confirmMutamersImport` does NOT touch the `clients` table.
- `umrah_agents` migration has NO `clientId` column.
- `umrah_sub_agents` migration declares `clientId` as
  nullable integer.
- `PUT /sub-agents/:id/link` route exists in
  `routes/umrah-entities.ts`.
- `auto_link` settings catalog has 3 fields and none of them
  is the client-linkage policy field.

When the owner ratifies cases A / B / C / D and the policy
field lands, those sentinels will fail on purpose — flagging
the policy decision in the diff.

---

## 7. Out of scope for U-11

Per the owner's explicit prohibitions:

- ❌ No automatic `clients` row creation for every sub-agent.
- ❌ No silent AR balance opening.
- ❌ No edit to historical data.
- ❌ No migrations in this PR.
- ❌ No edit to issued invoices.
- ❌ No hard-coded accounting mapping.
- ❌ No journal entry posted outside the finance engine.
- ❌ No duplicate invoicing engine.
- ❌ U-12 (pricing) is not opened.

---

## 8. Next action — owner decision required

Before any code lands beyond this audit + smoke, the owner must
ratify:

1. Which case (A / B / C / D, or a mix) is the company's
   policy.
2. Whether the `auto_link` catalog gains a
   `clientLinkagePolicy` field.
3. Whether the import wizard should propose linkage
   (operator-confirm only) or leave it entirely to
   `PUT /sub-agents/:id/link`.
4. Whether Case C (parent-child client hierarchy) is in scope
   for U-11 or punted to a separate CRM-model PR.

This PR does **not** decide any of the above. It records what
exists and freezes it. The next PR — once the policy is
ratified — would be the implementation, smoke, and any
required catalog / schema delta.
