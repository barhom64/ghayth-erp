# U-10 — 11-Policy Effectiveness Audit

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §7.

**Backlog title:** "Verify 11-policy effectiveness (no silent
hardcode)" — canonical governance backlog under #2080 / Charter
#1870.

**TL;DR:** The `umrah` settings catalog declares **45 fields
across 11 categories**, of which only **2 are actually
consumed** by code (4.4%). 3 notification fields are wired but
under **different key names** than the catalog declares, so
operator-set values are silently ignored. 3 cron-side keys are
read but **not declared in the catalog at all**, so operators
have no UI to set them. The remaining 37 fields are pure
"vapor": UI declarations with no engine consumer. This audit
inventories the gap; **wiring is hard-pause** because every
unwired field would require new engine logic (penalty engine,
GL post helpers, import validator, scheduler) — all
behaviour-class changes per the roadmap §3.

---

## 1. Method

For every field declared in
`lib/umrahSettingsPoliciesCatalog.ts`, the audit searched the
entire `artifacts/api-server/src/` tree for the literal string
`"umrah.<categoryId>.<fieldKey>"` passed to `resolveSettings()`
(the canonical settings consumer). A field is classified:

- **WIRED** — at least one production consumer reads the exact
  key and acts on it.
- **DECLARED-ONLY** — no consumer found, OR the consumer reads
  a different key.

---

## 2. Per-category inventory

| Cat | Field | Consumer | Status |
| --- | --- | --- | --- |
| season | defaultProgramDays | — | DECLARED-ONLY |
| season | autoClosePastSeasons | — | DECLARED-ONLY |
| season | requireSeasonForImport | — | DECLARED-ONLY |
| visa | expiryWarningDays | — | DECLARED-ONLY |
| visa | blockOverstayAfterExpiry | — | DECLARED-ONLY |
| visa | allowNoVisaImport | — | DECLARED-ONLY |
| overstay_grace | graceDays | — | DECLARED-ONLY |
| overstay_grace | dailyPenalty | — | DECLARED-ONLY |
| overstay_grace | tierDays | — | DECLARED-ONLY |
| overstay_grace | tierAmount | — | DECLARED-ONLY |
| violations | autoCreateOnAbscond | — | DECLARED-ONLY |
| violations | blockCommissionOnOpenViolation | — | DECLARED-ONLY |
| violations | violationGracePeriodDays | — | DECLARED-ONLY |
| import | maxRowsPerFile | — | DECLARED-ONLY |
| import | requireNuskNumber | — | DECLARED-ONLY |
| import | rejectOnDuplicatePassport | — | DECLARED-ONLY |
| auto_link | autoCreateMissingAgents | — | DECLARED-ONLY |
| auto_link | autoCreateMissingGroups | — | DECLARED-ONLY |
| auto_link | fuzzyMatchMinConfidence | — | DECLARED-ONLY |
| auto_link | **clientLinkagePolicy** | `umrahInvoicingEngine.ts:26`; `umrahImportEngine.ts:692` | **WIRED** ✅ |
| pricing | suggestLastPriceByAgent | — | DECLARED-ONLY |
| pricing | freezePricesAfterInvoice | — | DECLARED-ONLY |
| commission | maxAutoApprovalAmount | — | DECLARED-ONLY |
| commission | clawbackOnCancellation | — | DECLARED-ONLY |
| commission | clawbackOnRefund | — | DECLARED-ONLY |
| financial | autoPostNuskAp | — | DECLARED-ONLY |
| financial | autoPostSalesRevenue | — | DECLARED-ONLY |
| financial | blockOnAccountMappingMissing | — | DECLARED-ONLY |
| financial | **legacyTransportWritesDisabled** | `routes/umrah.ts:145` | **WIRED** ✅ |
| calendar | defaultEnabledLayers | — | DECLARED-ONLY |
| calendar | maxWindowDays | — | DECLARED-ONLY |
| notifications | notifyVisaExpiring | 🔑 KEY MISMATCH — cron reads `umrah.notify.visa_expiry` | DECLARED-ONLY |
| notifications | notifyDepartureTomorrow | 🔑 KEY MISMATCH — cron reads `umrah.notify.departure_reminder` | DECLARED-ONLY |
| notifications | notifyOverstay | 🔑 KEY MISMATCH — cron reads `umrah.notify.overstay_warning` | DECLARED-ONLY |
| notifications | notifyImportUnlinked | — | DECLARED-ONLY |

---

## 3. Summary stats

- Total catalog fields: **45** (across 11 categories).
- **WIRED**: **2** (4.4%) — `auto_link.clientLinkagePolicy` and
  `financial.legacyTransportWritesDisabled`, both wired by
  recent governance work (BILL-LINK Phase 2 + U-02b M3).
- **DECLARED-ONLY**: **43** (95.6%).
- Notification fields with **silent key mismatch**: **3** —
  operator toggles them via the catalog UI but cron reads
  different keys.

---

## 4. Three notable defect categories

### 4.1 The silent vapor (37 fields)

The catalog promises operator control over season closure,
visa rules, overstay grace, violation auto-create, import
constraints, fuzzy-match thresholds, pricing freeze, commission
clawback, finance auto-post, calendar layers, and one
notification toggle. **None** of these is actually read by code
today. An operator who flips
`commission.clawbackOnCancellation = true` in the UI sees no
behavioural change; the commission engine uses its own
hard-coded behaviour regardless.

### 4.2 The notification key mismatch (3 fields)

The catalog declares the keys:
- `umrah.notifications.notifyVisaExpiring`
- `umrah.notifications.notifyDepartureTomorrow`
- `umrah.notifications.notifyOverstay`

But `cronScheduler.ts` reads:
- `umrah.notify.visa_expiry` (line 3646)
- `umrah.notify.departure_reminder` (line 3681)
- `umrah.notify.overstay_warning` (line 3726)

So an operator setting `notifications.notifyVisaExpiring=false`
believes they've silenced the visa-expiry reminders, but the
cron task is reading a never-set key and falls back to its
hard-coded default (`true`). **This is the worst class of vapor
— it actively misleads the operator.**

### 4.3 The orphaned cron settings (3 keys)

Three keys are READ by `cronScheduler.ts` but never DECLARED in
the catalog:
- `umrah.auto_penalty.enabled` (3914)
- `umrah.auto_penalty.overstay_days` (3918)
- `umrah.auto_penalty.daily_rate` (3919)

These predate the catalog. The auto-penalty cron acts on them,
but no operator UI exists to set them. They have to be edited
directly in the `settings` table by an admin.

---

## 5. Recovery options (all out of U-10's autonomous scope)

Every fix below would be a **behavioural change** (the field
either starts being honoured or stops being mis-routed), which
puts it in the hard-pause class per
`UMRAH_REMAINING_WORK_ROADMAP.md` §3:

| Defect class | Fix shape | Class |
| --- | --- | --- |
| 37 silent-vapor fields | Wire each consumer (penalty engine, import validator, GL post helpers, commission engine, calendar, scheduler) | 🔴 hard-pause (engine touch) |
| 3 notification key mismatch | EITHER rename the catalog keys to match cron, OR rename the cron consumers to match the catalog — both change observable behaviour for any operator that has already toggled the catalog version | 🔴 hard-pause (behaviour change) |
| 3 orphaned cron keys | Add the three keys to the `notifications` (or a new `automation`) category in the catalog so operators can set them via UI | 🟡 autonomous IF the wire-up is just catalog declaration (no consumer change) — but the consumer-side defaults need to stay backward-compatible. Borderline; recommend treating as hard-pause for safety. |

---

## 6. Out of scope for THIS PR (explicit)

Permanent hard rails from the roadmap §2, plus:

- ❌ No engine touch.
- ❌ No catalog edit (no field rename, no add, no remove).
- ❌ No consumer rewire.
- ❌ No backfill.
- ❌ No migration.
- ❌ No FE change.
- ❌ U-12 not opened. U-02b stopped at M5b. BILL-MAIN P4+
  remains hard-pause.

---

## 7. What this PR ships

1. This audit doc.
2. No source code change. The existing 13 umrah smokes
   (223/223) continue to protect the surface unchanged.

---

## 8. Closure verdict

- 🟡 **U-10 closes with INVENTORY GAP DOCUMENTED.** The
  catalog is, at best, 4.4% effective. Most of its promises are
  vapor or, in the notification case, actively misleading.
- ➜ **Suggested follow-up tracks** (each hard-pause, each
  needs explicit owner authorisation before any
  implementation PR):
  - **CATALOG-NOTIFY-FIX** — reconcile the 3 notification
    key mismatches. Decide direction: catalog↔cron or
    cron↔catalog.
  - **CATALOG-CRON-DECLARE** — surface the 3 orphaned
    `auto_penalty` keys in the catalog so they're operator-
    settable.
  - **CATALOG-WIRE-ENGINES** — sequence the 37 silent-vapor
    fields. Group by engine (penalty, GL, import, commission,
    scheduler) and slice into hard-pause PRs.
- ➜ **Next autonomous audit per roadmap §8:** U-12c (calendar
  layers — reconcile with M5b's already-shipped
  `transport_request` layer).
