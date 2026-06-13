# U-08 — E2E Import + False-Success-Prevention Audit

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §7.

**Backlog title:** "E2E import test with false-success
prevention contract."

**TL;DR:** The umrah E2E coverage is **substantially better
than the backlog item implies**. Seven umrah-specific
integration suites exist under
`tests/integration/`, including a full-cycle suite
(`umrahFullCycleE2E.dynamic.test.ts`) that walks NUSK purchase
→ sales invoice → commission accrual JE end-to-end. The
false-success-prevention pattern is partially present (exact
equality assertions on JE line counts, debit/credit values,
agent/season dimensions). The **gap** is narrower than
"missing e2e": the import preview's **counters** and the
import-confirm's **return shape** are not verified end-to-end
with exact-equality assertions in a single happy-path scenario.
Closing the gap is autonomous (test additions only) and is
suggested as a follow-up track **U-08-CLOSE**.

---

## 1. Inventory — what already exists

| Suite | File | Purpose |
| --- | --- | --- |
| Full-cycle E2E | `tests/integration/umrahFullCycleE2E.dynamic.test.ts` | Walks NUSK purchase JE → sales invoice JE (inclusive VAT) → commission accrual JE → agent + season drilldowns. 5 `it` blocks. |
| Import linking | `tests/integration/umrahImportLinking.dynamic.test.ts` | Repro for Task #577 — exercises `confirmMutamersImport` directly + asserts agent/sub-agent/group columns populate + pilgrim counts. |
| NUSK purchase JE | `tests/integration/umrahNuskPurchaseJE.dynamic.test.ts` | NUSK voucher import → AP journal entry shape. |
| Invoice 2-line posting | `tests/integration/umrahInvoicePostingTwoLine.dynamic.test.ts` | Sales invoice with two-line JE shape verification. |
| Commission via HR JE | `tests/integration/umrahCommissionViaHrJE.dynamic.test.ts` | Commission accrual routed via HR payable, not commission_payable. |
| C27 overstay | `tests/integration/umrahC27Overstay.dynamic.test.ts` | Penalty engine overstay flow. |
| Agent `clientId` column | `tests/integration/umrahAgentsClientIdColumn.dynamic.test.ts` | BILL-MAIN P2 column presence. |

Plus three import-related unit smokes
(`umrahImportColumnMappingSmoke`, `umrahImportPreviewWiringSmoke`,
`umrahImportUnlinkedDetectionSmoke`) that pin static contracts.

---

## 2. False-success-prevention patterns ALREADY present

Reading `umrahFullCycleE2E.dynamic.test.ts`:

- **Exact line counts**, not `>0`:
  ```ts
  expect(lines.length).toBe(2);
  ```
- **Exact value equality** on debit / credit / VAT extraction:
  ```ts
  expect(dr.accountCode).toBe("5201-T");
  expect(cr.accountCode).toBe("2101-T");
  expect(Number(dr.debit)).toBe(550);
  expect(Number(cr.credit)).toBe(550);
  ```
- **Dimension assertions** that lock agentId + seasonId on
  every JE line:
  ```ts
  for (const l of lines) {
    expect(l.umrahAgentId).toBe(ids.agentId);
    expect(l.umrahSeasonId).toBe(ids.seasonId);
  }
  ```
- **JE type assertion** so a refactor that changes the journal
  type to a generic string still fails the test:
  ```ts
  expect(je.type).toBe("purchase");
  ```

The integration suite **passes the bar** the backlog item
implies: it asserts exact equality, not just "something
happened".

---

## 3. The actual gap

The backlog item's "false-success contract" implies four kinds
of checks that should run end-to-end against a single import:

1. **Preview counters** must match the source row count
   exactly. `previewMutamersImport` returns
   `{ newRows, updatedRows, skippedCount, errorRows,
   unlinkedSubAgents, newAgentsToCreate, rowsWithoutAgent,
   rowsWithoutGroup, rowsWithoutSubAgent, totalRows,
   clientLinkagePolicy, unlinkedSubAgentInvoicingHint, ... }`.
   The existing import-linking suite asserts the **side
   effects** (rows landed in `umrah_pilgrims`), but does not
   assert the preview's counter return values against the
   source CSV shape.

2. **Confirm result** must reconcile with preview counters.
   `confirmMutamersImport` returns counts (created /
   updated / skipped). No suite asserts that confirm-side
   counts == preview-side counts on the same input.

3. **Unlinked recovery** must not silently linger. The
   import-linking suite asserts unlinked rows recoverable, but
   does not assert that the post-confirm `unlinked` count
   matches preview's prediction.

4. **Catalog policy surface** (Phase 3a) must surface on the
   preview return. The unit smoke
   (`umrahImportUnlinkedDetectionSmoke`) pins the field
   presence, but no integration test asserts that the active
   policy value flows through the preview return when settings
   are explicitly set.

---

## 4. Recovery — autonomous track (recommended)

All four gaps are pure test additions:

- Add a single integration suite
  `umrahImportFalseSuccessContract.dynamic.test.ts` that:
  1. Builds a CSV with a known number of mutamer rows
     (e.g. 7 rows: 3 new, 2 update, 1 skip, 1 error).
  2. Asserts `preview.totalRows === 7`, plus the four
     `newRows`/`updatedRows`/`skippedCount`/`errorRows.length`
     counts exactly.
  3. Calls `confirmMutamersImport` with the same rows and
     asserts the returned counts match the preview's
     predictions.
  4. Asserts `preview.unlinkedSubAgents.length` equals the
     number of unlinked nuskCodes in the test fixtures.
  5. Sets `umrah.auto_link.clientLinkagePolicy` =
     `"sub_agent_client_required"` and asserts the preview
     returns that string.
  6. Re-runs preview after confirm — `newRows` should now be 0
     because the imported rows already exist (idempotency
     proof).

This is **autonomous class** under the roadmap §4 (tests +
regression). No engine change, no migration, no behaviour
change. Suggested track id: **U-08-CLOSE**.

---

## 5. Why this PR doesn't ship U-08-CLOSE

The new integration test depends on the existing test harness
(Postgres fixture in `tests/integration/_fixtures/`) and would
need to be reviewed for fixture isolation (the existing tests
use a `__IMPORT_LINK_COMPANY__` magic name; the new suite
needs its own). That's modest engineering but it's
deliberately punted to a separate PR so this audit closes
quickly with the inventory + recovery shape recorded.

---

## 6. Out of scope for THIS PR (explicit)

- ❌ No new test file.
- ❌ No engine touch / route touch.
- ❌ No catalog edit.
- ❌ No migration.
- ❌ U-12 not opened. U-02b stopped at M5b. BILL-MAIN P4+
  remains hard-pause.

---

## 7. What this PR ships

1. This audit doc.
2. No source code change. The existing 13 umrah smokes
   (223/223), the 7 umrah integration suites, and the
   3 import unit smokes continue to protect the surface
   unchanged.

---

## 8. Closure verdict

- 🟢 **U-08 closes with INVENTORY DOCUMENTED + RECOVERY
  TRACK SCOPED.** The E2E coverage is real and already
  enforces exact-equality assertions on the critical JE shape;
  the gap is the preview/confirm reconciliation, not "no
  e2e".
- ➜ **Suggested follow-up track** (autonomous):
  **U-08-CLOSE** — single integration suite adding the four
  reconciliation assertions in §4.
- ➜ **Audit batch complete.** Per roadmap §8, the autonomous
  audit queue (U-03, U-10, U-12c, U-13c, U-08) is now closed.
  Next autonomous tracks: BILL-MAIN P6 (preview re-orientation),
  BILL-MAIN P7 (closure tests), U-08-CLOSE (this audit's
  suggested track). Hard-pause queue unchanged.
