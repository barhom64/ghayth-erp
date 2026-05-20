# Task #684 — Umrah Event Emit ↔ Catalog Drift Report

**Generated:** 2026-05-20 · **Mode:** report-only (route/event changes banned by standing directive)
**Sources:**
- `artifacts/api-server/src/routes/umrah.ts` + `artifacts/api-server/src/routes/umrah-entities.ts` (emit sites)
- `artifacts/api-server/src/lib/eventCatalog.ts` (catalog declarations)
- Extraction script: `/tmp/extract-umrah-events.mjs` (raw output `/tmp/umrah-events.json`)

## Headline

| Metric | Count |
|--------|-------|
| Distinct event names actually emitted by Umrah routes (static) | **40** |
| Distinct event names emitted via template literals (dynamic) | **1** (`umrah.season.${b.status}`) |
| Umrah events declared in `eventCatalog.ts` | **59** |
| Emitted but **NOT declared** in catalog (silent — no consumer wiring) | **0** ✅ |
| Declared but **NEVER emitted** by any route (dead declarations) | **19** ⚠️ |

**No "silent-emit" bugs of the Task #224 class** — every static emit name appears in the catalog. The drift is in the **opposite direction**: 19 catalog entries advertise events that no route ever fires, so any consumer (notification, auditTrail, side-effect engine) wired to them is dormant. This matches the original Task #684 description "half writes silent to event bus" — i.e. half the catalog promises are never delivered.

## 19 Declared-but-Never-Emitted Umrah Events

Cross-referenced against the "Umrah operational endpoints" section of `replit.md` to identify the **owning route** that *should* be emitting each one:

| # | Catalog event | Likely owning route | Status |
|---|---|---|---|
| 1 | `umrah.attachment.created` | `POST /api/umrah/attachments` | Route exists per replit.md — emit missing |
| 2 | `umrah.group.merged` | `POST /api/umrah/groups/merge` | Route exists — emit missing |
| 3 | `umrah.group.split` | `POST /api/umrah/groups/:id/split` | Route exists — emit missing |
| 4 | `umrah.import.previewed` | Import preview endpoint | Emit missing (only `umrah.import.completed` fires) |
| 5 | `umrah.invoice.gl_auto_posted` | Auto-GL posting on invoice generate | Emit missing |
| 6 | `umrah.invoice.gl_posted` | Manual GL post handler | Emit missing |
| 7 | `umrah.letter.dispatched` | Letter dispatch handler | Emit missing |
| 8 | `umrah.mutamers.imported` | Mutamers import handler | Emit missing |
| 9 | `umrah.package.deleted` | `DELETE /umrah/packages/:id` | Route exists — emit missing |
| 10 | `umrah.penalty.waived` | Single-penalty waive | Emit missing |
| 11 | `umrah.penalty.waived_bulk` | `POST /api/umrah/penalties/waive-bulk` | Route exists — emit missing |
| 12 | `umrah.pilgrim.arrived` | Pilgrim arrival webhook/cron | Emit missing |
| 13 | `umrah.pilgrim.departed` | Pilgrim departure webhook/cron | Emit missing |
| 14 | `umrah.pilgrim.overstayed` | C27 overstay scan cron (covered by `umrah_daily_overstay_scan`) | **Cron writes `umrah_violations` rows but does not emit this event** |
| 15 | `umrah.pilgrim.status_changed` | Pilgrim status update handler | Emit missing |
| 16 | `umrah.pilgrim.violated` | Violation create handler (closest emit today: `umrah.violation.created`) | Mis-named or duplicate intent |
| 17 | `umrah.transport.status_changed` | Transport status patch handler | Emit missing |
| 18 | `umrah.violation.updated` | Violation update handler | Emit missing (only `created` + `deleted` fire) |
| 19 | `umrah.vouchers.imported` | Vouchers import handler | Emit missing |

## Dynamic Emit Caveat (Task #224 class — partial)

`artifacts/api-server/src/routes/umrah.ts` line 423:
```ts
emitEvent({ ..., action: `umrah.season.${b.status}`, ... })
```

`b.status` is request-controlled. Possible runtime values per the season state transitions: `open`, `closed`, `active`. **None of those exact strings exist in the catalog** — only `umrah.season.opened` (past-tense) is declared (line 544 of `eventCatalog.ts`).

This means **every season status mutation today emits an event name not in the catalog** — bypassing any consumer wiring (`auditTrail`, `notification`) declared on the cataloged `umrah.season.opened` entry.

The `check:event-name-tense` guard (guard suite step 4b) catches *literal* present-tense emit names but not template-literal forms. Recommend extending the guard to walk template-literal `action: \`...\${...}\`` expressions and flag the literal prefix as "dynamic emit name — verify all branches are in catalog".

## Recommended action (owner approval required)

This report is **diagnosis only** — every fix below modifies route handlers / event-emission logic, which is blocked by the current standing directive (no route/event changes):

1. **19 missing emits** — add `emitEvent({ action: "<catalog-name>", ... })` calls in each owning route after the corresponding DB mutation succeeds. Mirror the established pattern: `.catch((e) => logger.error(e, "umrah background task failed"))`.
2. **Dynamic season emit** — either:
   - (a) change to a switch over `b.status` emitting literal cataloged names (`umrah.season.opened`, `umrah.season.closed`, `umrah.season.activated`), and add the missing 2 to the catalog, or
   - (b) keep template-literal but declare every branch in catalog and extend `check:event-name-tense` to walk template-literal forms.
3. **`umrah.pilgrim.overstayed`** — either remove the dead catalog entry, or wire the cron handler at `umrah_daily_overstay_scan` (whose smoke test already lives at `artifacts/api-server/scripts/smoke-umrah-c27-overstay.mjs`) to also `emitEvent({ action: "umrah.pilgrim.overstayed", ... })` per violation row inserted.
4. **Catalog hygiene** — `umrah.violation.updated` declares an event no handler exists for; either add the update handler or drop the catalog entry. Same for `umrah.package.deleted` and `umrah.attachment.created` (both have routes that should emit).

## Self-verification

Re-run `node /tmp/extract-umrah-events.mjs` against any future branch — output JSON at `/tmp/umrah-events.json`. CI can wrap this in a future `check:umrah-emit-vs-catalog` guard following the established `scripts/src/check-*.mjs` + `*.test.mjs` pattern. Out of scope for this report.
