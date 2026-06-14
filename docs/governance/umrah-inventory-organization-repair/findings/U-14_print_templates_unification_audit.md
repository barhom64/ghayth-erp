# U-14 — Print templates unification audit

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §4 + §7.

**Backlog title:** "Unify print templates."

**TL;DR:** The print engine is mature. 10 distinct umrah preset
builders exist, plus 5 aliases. **The "unification" gap is
narrower than the backlog implies**: 2 aliases need bespoke
templates, 3 umrah entity types have no preset at all, and 0
umrah templates are seeded as DB rows (operators can't
customize via the dashboard without falling back to code). The
underlying engine doesn't need changes — only template additions.

---

## 1. Inventory — what exists today

### 1.1 Print engine surface
`artifacts/api-server/src/lib/print/` carries a complete print
pipeline:

```
templateResolver  → 4-layer lookup:
                     1. explicit branch assignment
                     2. company-wide assignment
                     3. document_templates row (isDefault for entityType)
                     4. seeded preset (companyId IS NULL, presetKey='classic')
                  → final fallback: BESPOKE_PRESETS code map
dataLoader        → entityType → DB query loader (umrah_pilgrim, umrah_group, …)
layoutRenderer    → variable substitution + template HTML rendering
printService      → orchestration: resolve + load + render + persist + deliver
delivery/         → WhatsApp, Email, PDF download dispatch
queue + retention + watermark + archive
```

### 1.2 Umrah preset coverage (BESPOKE_PRESETS in
`templateResolver.ts:152-435`)

| Entity type | Preset builder | Class |
| --- | --- | --- |
| `umrah_pilgrim` / `pilgrim` / `mutamer` | `buildUmrahPilgrimPreset` | ✅ bespoke |
| `umrah_invoice` / `umrah_sales_invoice` | `buildUmrahInvoicePreset` | ✅ bespoke |
| `umrah_agent_invoice` | `buildUmrahInvoicePreset` | ⚠️ **aliased** to sales-invoice template |
| `umrah_penalty` | `buildUmrahPenaltyPreset` | ✅ bespoke |
| `umrah_violation` | `buildUmrahViolationPreset` | ✅ bespoke |
| `umrah_transport` / `transport` | `buildUmrahTransportPreset` | ✅ bespoke |
| `umrah_package` | `buildUmrahPackagePreset` | ✅ bespoke |
| `umrah_season` / `season` | `buildUmrahSeasonPreset` | ✅ bespoke |
| `umrah_agent` / `agent` | `buildUmrahAgentCardPreset` / `buildUmrahPilgrimPreset` | ⚠️ **inconsistent** — `umrah_agent` has bespoke, `agent` aliased to pilgrim |
| `umrah_sub_agent` / `sub_agent` | `buildUmrahSubAgentCardPreset` / `buildUmrahPilgrimPreset` | ⚠️ same issue |
| `umrah_group` | `buildUmrahPilgrimPreset` | ⚠️ **aliased** to pilgrim (group ≠ pilgrim) |
| `umrah_statement` | inline preset (lines 185-218) | ✅ bespoke |
| `umrah_runsheet` | inline preset (lines 219-255) | ✅ bespoke |

### 1.3 Seeded templates (migration `172_print_engine_seed.sql`)
Migration seeds 14 entity-type presets as `companyId IS NULL`
DB rows for the resolver step 4 fallback. **None are umrah-
specific.** The seeded list:
- quotation, sales_order, delivery_note, credit_note, pos_receipt,
  receipt_voucher, journal_entry, purchase_request, goods_receipt,
  stock_adjustment, stock_transfer, leave_request, loan_request,
  maintenance_request, account_statement.

For umrah entities, the resolver fall-through chain is:
```
1. assignment → none
2. company default → none
3. seeded preset → none (no umrah rows in 172_print_engine_seed.sql)
4. BESPOKE_PRESETS[entityType] code map → hit (good)
5. universalFallback → only if even BESPOKE missed
```

Result: **every umrah print today renders the in-memory preset,
not a DB row.** This means an operator cannot customise the
umrah print template via the dashboard — they would have to
manually create a `document_templates` row with the right
entityType + isDefault.

### 1.4 dataLoader umrah coverage
`artifacts/api-server/src/lib/print/dataLoader.ts:260-310` handles:
- `umrah_pilgrim` / `pilgrim` / `mutamer`
- `umrah_group`
- `umrah_invoice` / `umrah_sales_invoice`
- `umrah_agent_invoice`
- `umrah_penalty`
- `umrah_violation`
- `umrah_transport`
- `umrah_package`
- `umrah_season` / `season`

dataLoader carries **9 dedicated umrah loaders**. All entities
that data-load also have a BESPOKE preset (no orphan loaders).

---

## 2. Gaps vs an operator-ready umrah print catalog

### 2.1 `umrah_group` aliased to pilgrim preset (semantic mismatch)
A group is a *collection* of pilgrims with a leader, season,
agent, dates. A pilgrim is one person. Rendering a group with
the pilgrim template hides the group-level fields (mutamerCount,
agent linkage, season) and shows pilgrim-level fields that
don't apply.

**Recovery:** add `buildUmrahGroupPreset` that lists pilgrims
in a table + group meta header.

### 2.2 `umrah_agent_invoice` aliased to sales-invoice
The agent invoice and sales invoice have different totals,
different counterparties, and (after BILL-MAIN P4) potentially
different AR account. Sharing one template fudges the operator
view of who-owes-whom.

**Recovery:** split into `buildUmrahAgentInvoicePreset`.

### 2.3 No `umrah_nusk_invoice` preset
Vouchers (NUSK purchase invoices) are imported, posted as
purchase JEs, but the print engine has no loader + no preset.
Operators can't print the purchase voucher attribution.

**Recovery:** add `loadUmrahNuskInvoice` + `buildUmrahNuskInvoicePreset`.

### 2.4 No `umrah_commission_plan` / `umrah_commission_calculation` preset
The HR side reads `payroll_lines.commission` (verified by U-06's
script), but operators can't print a commission plan or a
calculation row for the marketer to sign.

**Recovery:** add `loadUmrahCommissionPlan` + bespoke preset.
Possibly also a calculation-row preset.

### 2.5 Short-name aliases `agent` / `sub_agent` route to pilgrim, not agent-card
The short-form aliases used by SPA detail pages route
inconsistently:
- `agent` → `buildUmrahPilgrimPreset` (wrong)
- `umrah_agent` → `buildUmrahAgentCardPreset` (right)

The SPA agent detail page calls with the short name, so it
gets the wrong template.

**Recovery:** change `agent` alias to `buildUmrahAgentCardPreset`,
same for `sub_agent`.

### 2.6 No umrah templates seeded as DB rows
`172_print_engine_seed.sql` skips umrah. Operators who want to
edit the template via the dashboard's print-template editor
need a DB row to clone. Today the editor would fall back to
showing the in-memory HTML (read-only).

**Recovery:** add `173_umrah_print_engine_seed.sql` (or similar)
seeding the 10+ umrah presets as `companyId IS NULL` rows.

### 2.7 No smoke pinning umrah BESPOKE coverage
There's `rentalPrintTemplateStatic.test.ts` pinning the rental
template integrity. There's no `umrahPrintTemplatesStatic.test.ts`
checking that every umrah entityType returned by `dataLoader`
has a corresponding BESPOKE_PRESETS entry.

**Recovery:** add a static smoke that diffs the two sets.

---

## 3. Recovery — phased plan (proposed)

### 3.1 U-14-P1 — alias fix (🟢 autonomous)
Fix the 3 aliases (`umrah_group`, `agent`, `sub_agent`) to point
at the correct bespoke builders. **Lowest risk** — pure code
mapping change, no schema, no behaviour change.

### 3.2 U-14-P2 — split umrah_agent_invoice from sales-invoice (🟢 autonomous)
- Add `buildUmrahAgentInvoicePreset`.
- Re-point the alias.
- Preset carries agent-level dimensions (agentId, subAgentId)
  vs the buyer-level dimensions of sales invoice.

### 3.3 U-14-P3 — new presets for missing entities (🟢 autonomous)
- `buildUmrahGroupPreset` (group meta + pilgrim list).
- `buildUmrahNuskInvoicePreset` + `loadUmrahNuskInvoice`.
- `buildUmrahCommissionPlanPreset` + `loadUmrahCommissionPlan`.
- (Optional) `buildUmrahCommissionCalculationPreset`.

### 3.4 U-14-P4 — seed umrah presets as DB rows (🟢 autonomous)
- New migration `1XX_umrah_print_engine_seed.sql`.
- Same pattern as `172_print_engine_seed.sql` — insert
  `companyId IS NULL` rows for each umrah entityType so the
  resolver step 4 finds them + the dashboard editor can clone.
- **Nullable companyId** + `ON CONFLICT DO NOTHING` so re-running
  is safe.

### 3.5 U-14-P5 — coverage smoke (🟢 autonomous)
Static smoke `umrahPrintTemplatesCoverageSmoke.test.ts`:
- Reads `dataLoader.ts` to extract umrah entity-types it handles.
- Reads `templateResolver.ts` to extract BESPOKE_PRESETS keys.
- Asserts every dataLoader-handled umrah entity has a BESPOKE
  entry + the alias map points at the right builder.

---

## 4. Permanent hard rails preserved (U-14 will not cross)

- ❌ No engine touch (print engine logic untouched).
- ❌ No catalog edit beyond preset additions.
- ❌ No FE change beyond what new entityTypes already require.
- ❌ No print-template DEFAULT behaviour change for tenants who
  have customised templates (resolver step 1 + 2 still wins).
- ❌ No silent linkage. ❌ No JE. ❌ No migration that mutates
  existing rows.
- ❌ U-14-P4 migration is additive (INSERT new rows; existing
  rows untouched).

---

## 5. Out of scope for THIS PR (explicit)

- ❌ No new preset code. ❌ No migration. ❌ No smoke.
- ❌ FIN-P4-CONTRACT execution untouched.
- ❌ BILL-MAIN P4/P4a/P4b/P4c/P5 untouched (hard-pause).
- ❌ U-02b M6+, U-07, U-09, U-12 untouched.
- ❌ U-04 / U-05 / U-06 / BILL-MAIN P7 — independent.

---

## 6. What this PR ships

1. This audit doc.
2. No source code change. The existing print pipeline + 14
   umrah smokes (the catalog post U-05 + U-04 + U-06 audits)
   continue to protect the surface unchanged.

---

## 7. Closure verdict

- 🟢 **U-14 closes with INVENTORY DOCUMENTED + 7 GAPS DOCUMENTED
  + 5 RECOVERY PHASES SCOPED.** The print engine is mature
  enough that "unify" is narrower than the backlog title
  implies: 2 aliases need fixing, 3-4 new presets needed, 1
  seed migration recommended.
- ➜ **Next autonomous step**: U-14-P1 (alias fixes).
- ➜ **No owner decision needed** for any U-14 phase. All 5 are
  🟢 autonomous code/migration additions.
- ➜ **Hard-pause queue unchanged.** FIN-P4-CONTRACT code,
  BILL-MAIN P4+/P5, U-02b M6+, U-07 stay hard-paused.
