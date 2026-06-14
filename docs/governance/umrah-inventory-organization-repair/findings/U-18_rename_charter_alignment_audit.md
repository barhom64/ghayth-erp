# U-18 — Rename list for charter-term alignment audit

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §4 + §7.

**Backlog title:** "Rename list for charter-term alignment."

**TL;DR:** Charter #1870 governance docs use canonical Arabic terms
(`المعتمر`, `الوكيل الرئيسي`, `الوكيل الفرعي`, `الموسم`, `المجموعة`).
The codebase + UI labels are **mostly aligned**, with a small set
of inconsistencies: Arabic plural form mixing (`المعتمرين`
accusative vs `المعتمرون` nominative), free-text technical terms
leaking to UI (`nuskCode`, `nuskAgentNumber`), and a few cases
where the same concept appears under two labels in different
pages. Recovery is a deterministic find+replace + a smoke pinning
the canonical glossary.

---

## 1. Inventory — current naming surface

### 1.1 Charter canonical terms (from governance docs)
| Concept | Charter term (Arabic) | Charter term (English) |
| --- | --- | --- |
| Individual pilgrim | المعتمر | Pilgrim |
| Plural pilgrim | المعتمرون / المعتمرين | Pilgrims |
| Main agent | الوكيل الرئيسي | Main Agent |
| Sub-agent | الوكيل الفرعي | Sub-Agent |
| Season | الموسم | Season |
| Group | المجموعة | Group |
| Visa | تأشيرة / فيزا | Visa |
| Overstay | تجاوز الإقامة | Overstay |
| NUSK invoice / voucher | فاتورة نُسُك / سند نُسُك | NUSK invoice |

### 1.2 Sidebar (navigation.registry.ts:622-670) labels
| Label | Path | Canonical? |
| --- | --- | --- |
| إدارة العمرة | `/umrah` | ✅ |
| المعتمرين | `/umrah/pilgrims` | ⚠️ accusative form on a nominative list label (should be `المعتمرون`) |
| الوكلاء الرئيسيين | `/umrah/agents` | ⚠️ accusative form (should be `الوكلاء الرئيسيون`) |
| الوكلاء الفرعيين | `/umrah/sub-agents` | ⚠️ same |
| المواسم | `/umrah/seasons` | ✅ |
| الباقات | `/umrah/packages` | ✅ |
| المجموعات | `/umrah/groups` | ✅ |
| المعتمرون المعفون | `/umrah/exempt-pilgrims` | ✅ correct nominative — but inconsistent with line 634 |
| حركات المعتمرين | `/umrah/reports/pilgrim-movements` | ✅ correct (accusative after the head noun "حركات") |

**Pattern observed:** the plural form is correct in object-position
phrases (`حركات المعتمرين`, `كشف المعتمرين`) and as a standalone
label SHOULD be nominative (`المعتمرون`) but is rendered as
`المعتمرين`. The same applies to `الوكلاء الرئيسيين/الفرعيين`.

### 1.3 Mixed-form occurrences across the codebase
Quick check on FE labels:

| Form | Files using it (sample) |
| --- | --- |
| `المعتمرين` (accusative-as-label) | navigation.registry.ts:634, several `pilgrims.tsx` page titles |
| `المعتمرون` (nominative-as-label) | exempt-pilgrims registry entry, U-04 commission report |

The two forms coexist. Neither is "wrong" Arabic — both are
grammatically valid — but a *consistent* choice would read
better.

### 1.4 Technical jargon leaking into UI
- `nuskCode` (sub-agent identifier) appears in UI text in
  several places. Charter term: `رمز المكتب` or simply `رمز
  الوكيل الفرعي`. The raw API field name should NOT be the user-
  facing label.
- `nuskGroupNumber` similarly appears. Charter term: `رقم
  المجموعة في نسك`.
- `contractRef` on the main agent → `رقم العقد`.

### 1.5 Inconsistent column header capitalisation in mixed-language CSV exports
- Some exports use English headers (`Group`, `Status`).
- Others use Arabic headers (`المجموعة`, `الحالة`).
- A few are mixed (`Group / المجموعة`).

This isn't a "wrong" thing but a stylistic choice that should be
unified per the charter's "Arabic-first with English fallback"
direction.

---

## 2. Inconsistency catalog (8 items)

| # | Inconsistency | Severity |
| --- | --- | --- |
| 1 | `المعتمرين` (acc.) vs `المعتمرون` (nom.) as a label | Low (grammatical) |
| 2 | `الوكلاء الرئيسيين/الفرعيين` (acc.) vs `الوكلاء الرئيسيون/الفرعيون` (nom.) | Low |
| 3 | `nuskCode` leaks to UI vs `رمز الوكيل الفرعي` | Medium |
| 4 | `nuskAgentNumber` leaks to UI vs `رقم وكيل نُسُك` | Medium |
| 5 | `nuskGroupNumber` leaks vs `رقم المجموعة في نسك` | Medium |
| 6 | `contractRef` leaks vs `رقم العقد` | Medium |
| 7 | CSV export header language inconsistency | Low (style) |
| 8 | Page title vs sidebar label mismatch (e.g., `إدارة المعتمرين` on the page, `المعتمرين` in the sidebar) | Low |

---

## 3. Recovery — phased plan (proposed)

### 3.1 U-18-P1 — canonical glossary doc (🟢 autonomous)
- Add `docs/governance/umrah-inventory-organization-repair/UMRAH_CANONICAL_GLOSSARY.md`.
- 1-page table: API field name | Arabic UI label | English label | Notes.
- Becomes the source of truth FE/BE both reference.

### 3.2 U-18-P2 — sidebar plural form unification (🟢 autonomous)
Choose ONE form (audit recommends `المعتمرون` nominative for
standalone labels, kept as `المعتمرين` only in phrases with a
head noun) and apply:
- `navigation.registry.ts` line 634: `المعتمرين → المعتمرون`
- Same for `الوكلاء الرئيسيين/الفرعيين` → nominative form.

Mechanical text replacement. No semantic change.

### 3.3 U-18-P3 — technical jargon labels (🟢 autonomous)
Replace raw API field names appearing in UI text:
- `nuskCode → رمز الوكيل الفرعي`
- `nuskAgentNumber → رقم وكيل نُسُك`
- `nuskGroupNumber → رقم المجموعة في نُسُك`
- `contractRef → رقم العقد`

This is mechanical replacement of literal strings; no API
contract change.

### 3.4 U-18-P4 — CSV export header policy (🟢 autonomous)
Pick one: Arabic-first OR English-first. Audit recommends
**Arabic** with English as a parenthetical for clarity
(`المجموعة (Group)`), matching the charter's bilingual
direction. Apply across all umrah exporters.

### 3.5 U-18-P5 — page title vs sidebar smoke (🟢 autonomous)
Static smoke `umrahLabelConsistencySmoke.test.ts`:
- Reads `navigation.registry.ts` for each `/umrah/*` path.
- Reads the corresponding page component for `<PageShell title="..." />`.
- Asserts the page title contains the sidebar label as a substring
  (or matches the canonical glossary's entry for that path).

Pins consistency across additions.

---

## 4. Permanent hard rails preserved (U-18 will not cross)

- ❌ No engine touch.
- ❌ No migration.
- ❌ No catalog edit beyond the new glossary doc.
- ❌ No FE behaviour change — purely string updates.
- ❌ No API contract change. (Field names on `nuskCode` etc. stay
  as the wire format; only the UI label changes.)
- ❌ No silent linkage. ❌ No JE.
- ❌ Smokes additive only.

---

## 5. Out of scope for THIS PR (explicit)

- ❌ No string replacements. ❌ No engine touch. ❌ No smoke.
- ❌ No new glossary doc.
- ❌ FIN-P4-CONTRACT execution untouched.
- ❌ BILL-MAIN P4/P4a/P4b/P4c/P5 untouched (hard-pause).
- ❌ U-02b M6+, U-07, U-09, U-12 untouched.
- ❌ U-04 / U-05 / U-06 / U-14 / U-15 / U-16 / U-17 — independent.

---

## 6. What this PR ships

1. This audit doc.
2. No source code change. Existing umrah smokes continue to
   protect the surface unchanged.

---

## 7. Closure verdict

- 🟢 **U-18 closes with NAMING SURFACE INVENTORIED + 8
  INCONSISTENCIES + 5 RECOVERY PHASES SCOPED.** All 5 phases
  are 🟢 autonomous (doc + mechanical string replacements +
  smoke).
- ➜ **Next autonomous step**: U-18-P1 (canonical glossary doc).
- ➜ **No owner decision needed** for any U-18 phase.
- ➜ **Hard-pause queue unchanged.** FIN-P4-CONTRACT code,
  BILL-MAIN P4+/P5, U-02b M6+, U-07, U-15-P6 stay hard-paused.
