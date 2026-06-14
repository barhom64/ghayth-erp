# Umrah Canonical Glossary

**Status:** Source of truth for terminology in the umrah module.
First slice of U-18 (PR #2311) recovery plan.

This glossary maps the **API field name** (wire format, never
renamed without a migration) to the **Arabic UI label** (operator-
facing) and **English label** (developer-facing) for every
umrah-domain concept. New code referencing these concepts must
use the canonical form in the appropriate context:

- **Wire / DB / API contract** → API field name.
- **User-visible text** → Arabic label.
- **Developer comments / dev docs** → English label.

When the same concept appears under two labels in the codebase
today, the canonical form below is the one to use.

---

## Core entities

| API field name | Arabic UI label | English label | Notes |
| --- | --- | --- | --- |
| `umrah_pilgrims` | المعتمر | Pilgrim | Singular. Plural label: see "Plural forms" below. |
| `umrah_agents` | الوكيل الرئيسي | Main Agent | The marketing/distribution agent of record. |
| `umrah_sub_agents` | الوكيل الفرعي | Sub-Agent | Operates under a main agent. |
| `umrah_seasons` | الموسم | Season | A bounded period (typically Hijri year) framing all umrah activity. |
| `umrah_groups` | المجموعة | Group | A collection of pilgrims sharing a trip / season / agent. |
| `umrah_packages` | الباقة | Package | Product catalog row (price, includes-* booleans). See U-15. |
| `umrah_hotels` | الفندق | Hotel | Accommodation entity (migration 246). |
| `umrah_room_blocks` | حجز الغرف | Room Block | Per-season per-hotel allotment. |
| `umrah_room_allocations` | توزيع الغرف | Room Allocation | Pilgrim → room assignment. |
| `umrah_sales_invoices` | فاتورة مبيعات العمرة | Umrah Sales Invoice | Issued to a sub-agent (today) or main agent (post-BILL-MAIN P4, hard-pause). |
| `umrah_agent_invoices` | فاتورة الوكيل | Agent Invoice | Distinct billing artifact for the main agent path. |
| `umrah_nusk_invoices` | فاتورة نُسُك (شراء) | NUSK Voucher | Purchase voucher from the NUSK system. |
| `umrah_penalties` | الغرامة | Penalty | Operator-applied penalty (overstay, no-show, etc.). |
| `umrah_violations` | المخالفة النظامية | Violation | Regulatory violation flagged by ops. |
| `umrah_transport` | النقل والمواصلات | Transport | Operational transport segment. |
| `employee_commission_plans` | خطة العمولة | Commission Plan | Marketer's commission scheme (per season). |
| `employee_commission_calculations` | حساب العمولة | Commission Calculation | Calculated commission row per period. |

## Plural forms

The codebase mixes accusative (`المعتمرين`) and nominative
(`المعتمرون`) plurals. Per U-18 audit §1.2 the canonical choice is:

| Context | Form to use | Example |
| --- | --- | --- |
| Standalone sidebar label or page title | **Nominative** (subject of clause / heading) | `المعتمرون` / `الوكلاء الرئيسيون` / `الوكلاء الفرعيون` |
| Phrase with a head noun (object position) | **Accusative** (object position) | `حركات المعتمرين` / `كشف المعتمرين` / `قائمة الوكلاء الرئيسيين` |

Both forms are grammatical; the rule above eliminates mixing
within the same context (a page heading vs an object phrase).

## Technical jargon that should NOT leak to the UI

| API field name | Acceptable in code/API | UI label |
| --- | --- | --- |
| `nuskCode` | yes | رمز الوكيل الفرعي |
| `nuskAgentNumber` | yes | رقم وكيل نُسُك |
| `nuskGroupNumber` | yes | رقم المجموعة في نُسُك |
| `contractRef` | yes | رقم العقد |

The API field names stay as the wire format (do NOT change the
contract). The UI must display the Arabic label above. A bare
`nuskCode` showing in an operator-facing string is a bug.

## Pricing + financial dimensions

| API field name | Arabic UI label | English label | Notes |
| --- | --- | --- | --- |
| `costPrice` | السعر التكلفة | Cost Price | On `umrah_packages`. Cost to the agency. |
| `sellPrice` | السعر البيع | Sell Price | What we charge the sub-agent. |
| `ratePerNight` | السعر لكل ليلة | Rate per Night | On `umrah_room_blocks`. |
| `commissionAmount` | مبلغ العمولة المحتسب | Calculated Commission | Pre-condition-check amount. |
| `finalAmount` | المبلغ النهائي | Final Amount | Post-condition-check + violation flag. |
| `mutamerCount` | عدد المعتمرين | Pilgrim Count | On group / season rollups. |

## Status enums (umrah_pilgrims.status)

| API value | Arabic UI label | English label |
| --- | --- | --- |
| `pending` | بانتظار | Pending |
| `active` | نشط | Active |
| `arrived` | وصل | Arrived |
| `departed` | غادر | Departed |
| `overstayed` | متجاوز | Overstayed |
| `violated` | مخالف | Violated |
| `cancelled` | ملغى | Cancelled |

## Status enums (commission calculations)

| API value | Arabic UI label | English label |
| --- | --- | --- |
| `calculated` | محتسبة | Calculated |
| `approved` | معتمدة | Approved |
| `paid` | مدفوعة | Paid |
| `posted` | مرحَّلة | Posted |
| `pending` | بانتظار الاعتماد | Pending Approval |
| `cancelled` | ملغاة | Cancelled |

## Catalog policy keys

| Key | Arabic operator description | Default value |
| --- | --- | --- |
| `umrah.auto_link.clientLinkagePolicy` | سياسة ربط العميل (`operational_until_linked` / `sub_agent_client_required` / `main_agent_client`) | `operational_until_linked` |
| `commission_via_hr` | توجيه العمولة عبر HR (false = حساب عمولة مستحقة منفصل) | `true` |
| `umrah.financial.taxableByDefault` | الافتراضي الضريبي لبنود الفاتورة | (see BILL-MAIN P4 plan) |

## Cross-references

- BILL-LINK: agent ↔ financial client linkage (closed).
- BILL-MAIN: main agent as billing entity (P2/P3/P6/P7 merged; P4+ hard-pause).
- U-04, U-05, U-06: commission attribution + report + capture (audits merged, P1 slices in execution).
- U-14: print template unification (P1 alias fix merged).
- U-15: package ↔ accommodation classification.
- U-16: document path flow.
- U-17: notifications flow.
- U-19: import → link → invoice → collect journey UX.

## How to use this glossary

1. **New API field** — add the row here BEFORE merging the
   schema migration. Includes Arabic + English label.
2. **New UI text** — pick the Arabic label from the row.
3. **Code review check** — if a PR's UI string uses raw API
   field names (e.g., `nuskCode`), flag it; replace with the
   glossary's Arabic label.
4. **Renaming a UI label** — update both this doc AND the
   underlying string. Do NOT rename API fields without a
   migration story.

## Out of scope for this glossary

- API field names themselves — those are the wire format, the
  canonical names already.
- Operator-defined business names (agency name, employee name,
  client name) — those are user input, never localised here.
- Charter-level vocabulary outside the umrah module (finance
  engine terms, HR module terms, transport module terms).
