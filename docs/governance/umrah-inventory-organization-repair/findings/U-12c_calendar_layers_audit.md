# U-12c — Calendar Layers Audit (reconcile with M5b)

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §7.

**Backlog title:** "Bind calendar.tsx to unified calendar with
layer support" — the canonical governance U-12 item. Because
this session previously used "U-12" as an unrelated identifier
and the owner ratified the BILL-LINK/BILL-MAIN renaming
(#2190 §0), this audit is filed as **U-12c** (the **c**anonical
calendar item) to keep history clean.

**TL;DR:** The calendar surface is **operationally healthy**
after M5b — 9 well-defined layers, additive `transport_request`
layer sits alongside the legacy `transport_trip` without
disturbing it, per the U-02b M5b smoke. The **gap** is between
the catalog and the actual calendar: the catalog's two
`calendar` fields (`defaultEnabledLayers`,
`maxWindowDays`) are **DECLARED-ONLY** (no consumer reads them
— see U-10 §2), so any operator setting via the UI has no
effect. Wiring is a behaviour change → hard-pause. The audit
closes with the model gap documented.

---

## 1. Surfaces inspected

| Surface | File | Lines |
| --- | --- | --- |
| Backend `CalendarLayer` union (9 layers) | `routes/umrah-entities.ts` | 4245–4264 |
| `CALENDAR_LAYER_META` (entityType + colour + label) | `routes/umrah-entities.ts` | 4266–4284 |
| `GET /calendar/events` route (window + layer filter) | `routes/umrah-entities.ts` | 4288+ |
| Hard-coded window cap (366 days) | `routes/umrah-entities.ts` | 4316 (`days > 366`) |
| FE `CalendarLayer` type (9 layers) | `pages/umrah/calendar.tsx` | 34–48 |
| FE `LAYER_HREF` drilldowns | `pages/umrah/calendar.tsx` | 81+ |
| FE `enabledLayers` initial state (all 9 enabled) | `pages/umrah/calendar.tsx` | 128–139 |
| Catalog `calendar.defaultEnabledLayers` declaration | `lib/umrahSettingsPoliciesCatalog.ts` | (calendar category) |
| Catalog `calendar.maxWindowDays` declaration | `lib/umrahSettingsPoliciesCatalog.ts` | (calendar category) |
| U-12 sentinel smokes | `tests/unit/umrahTransportRequestCalendarLayerSmoke.test.ts` | full file |

---

## 2. What's actually shipped (post-M5b)

### 2.1 Nine layers, well defined

| Layer | Source table | Colour | Owner |
| --- | --- | --- | --- |
| `pilgrim_arrival` | `umrah_pilgrims` | green | Wave 1 |
| `pilgrim_departure` | `umrah_pilgrims` | blue | Wave 1 |
| `visa_expiring` | `umrah_pilgrims` | yellow | Wave 1 |
| `overstay` | `umrah_pilgrims` | red | Wave 1 |
| `transport_trip` | `umrah_transport` (legacy) | purple | Wave 1 — kept intact for historical rows |
| `nusk_expiring` | `umrah_nusk_invoices` | yellow | Wave 1 |
| `nusk_invoice_issued` | `umrah_nusk_invoices` | blue | Phase 2 |
| `penalty_created` | `umrah_penalties` | red | Phase 2 |
| **`transport_request`** | **`transport_bookings`** | **gray** | **U-02b M5b — `ad7c8fa1`** |

### 2.2 FE / backend alignment is exact

The FE's nine-layer `CalendarLayer` type matches the backend
`CalendarLayer` union one-for-one. `enabledLayers` initial
state (calendar.tsx:128–139) enables all nine. `LAYER_HREF`
provides a drilldown for each. The U-02b M5b smoke pins this
alignment.

### 2.3 The window cap

`routes/umrah-entities.ts:4316` throws if `days > 366`. The
limit is hard-coded — it does NOT consult
`umrah.calendar.maxWindowDays`.

---

## 3. The model gap

### 3.1 Catalog `calendar.defaultEnabledLayers` is unwired

The catalog declares a `select` field with three values
`"all" / "operations_only" / "finance_only"`. **No code reads
this key.** The FE always enables all 9 layers regardless of
the operator's choice. Setting it to `finance_only` does
nothing.

Worse, the catalog's three values don't even map cleanly to
the nine-layer reality: "operations" vs "finance" would split
the layer set into groups, but the FE has no notion of layer
groups — every layer is individually toggleable. The catalog's
model is **the wrong shape** for the current calendar.

### 3.2 Catalog `calendar.maxWindowDays` is unwired

Catalog default is 90. The backend hard-codes 366. The catalog
value is ignored.

### 3.3 No M5b-aware catalog field

M5b shipped the `transport_request` layer as a code-level
addition. There's no catalog entry that surfaces the
sub-agent-as-billing-entity (legacy) vs unified-contract
choice — neither at the policy-default level nor as an "enable
the M5b layer by default for this company" toggle. Today the
choice is locked at the source-code default (all 9 layers
enabled).

---

## 4. What this gap IS NOT

- **Not a behaviour bug** — the calendar works correctly today.
  Operators see the right data; the M5b smoke (5 sections, 24
  invariants) verifies the contract.
- **Not a regression** — the gap predates M5b. M5b deliberately
  did NOT touch the catalog (per its scope authorisation) and
  punted reconciliation to U-12c, which is this audit.

---

## 5. Recovery options (all hard-pause)

| Fix | Class | Notes |
| --- | --- | --- |
| Wire `calendar.maxWindowDays` to the route's `days > N` check | 🔴 hard-pause | Behaviour change: a company with the catalog set lower would have its windows shrunk. Need a backward-compat default that falls back to 366 when unset. |
| Redesign `calendar.defaultEnabledLayers` to match the 9-layer reality | 🔴 hard-pause | Catalog change + FE change. Decide whether to remove the three-value enum and replace with per-layer booleans, OR keep the enum and define the three groups in code. |
| Add catalog control for `transport_request` default enablement | 🔴 hard-pause | Catalog add + FE consumer. |
| Leave as-is (document the gap + close U-12c) | 🟢 autonomous | What this PR does. |

---

## 6. Out of scope for THIS PR (explicit)

- ❌ No catalog edit.
- ❌ No FE change.
- ❌ No backend change.
- ❌ No engine touch.
- ❌ No migration.
- ❌ U-12 not opened. U-02b stopped at M5b. BILL-MAIN P4+
  remains hard-pause.

---

## 7. What this PR ships

1. This audit doc.
2. No source code change. The existing 13 umrah smokes
   (223/223), including the U-02b M5b sentinel, continue to
   protect the surface unchanged.

---

## 8. Closure verdict

- 🟡 **U-12c closes with MODEL GAP DOCUMENTED.** The calendar
  itself is healthy; the catalog promises operator control
  that the code doesn't honour. The mismatch overlaps with the
  broader U-10 catalog vapor finding.
- ➜ **Suggested follow-up track** (hard-pause):
  **CATALOG-CALENDAR-WIRE** — sequence the three fixes in §5.
  Best treated as one slice of the broader
  CATALOG-WIRE-ENGINES track from U-10 §8.
- ➜ **Next autonomous audit per roadmap §8:** U-13c
  (sensitive-permission isolation).
