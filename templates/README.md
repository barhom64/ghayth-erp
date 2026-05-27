# Print Platform — Template Registry

Phase 3 of the Print Platform roadmap. This directory is the **canonical manifest** of every print template the platform ships with. Each JSON file describes one template; the actual HTML lives in `artifacts/api-server/src/lib/print/templateResolver.ts` (under `BESPOKE_PRESETS` or `universalFallback`) for now, but the manifests here are the source of truth for:

- which entity types have a tailored layout
- what the template's stable `code` is (referenced from `documentTemplate` props)
- the version of the layout
- locale + paper size + branding flags
- whether the template requires a signature, a QR, or branding

## Why a separate registry?

In-memory `BESPOKE_PRESETS` is convenient but invisible. The filesystem registry:

1. **Audit-friendly** — a code review can see every template the system owns in one `ls templates/finance/`.
2. **Localizable** — `invoice.ar.json`, `invoice.en.json` can ship side-by-side.
3. **Version-able** — every template carries `version` + `status` for staged rollouts.
4. **Indexable** — `pnpm print:audit-templates` walks this tree and cross-checks against the resolver.

## Layout

```
templates/
├── _generic/                # universalFallback + auto-token presets
│   └── universal-fallback.ar.json
├── finance/
│   ├── invoice.ar.json
│   ├── credit-note.ar.json
│   ├── payment-voucher.ar.json
│   ├── purchase-order.ar.json
│   └── …
├── hr/
│   ├── employee-contract.ar.json
│   ├── payslip.ar.json
│   ├── leave-request.ar.json
│   └── …
├── umrah/
│   ├── invoice.ar.json
│   ├── statement.ar.json
│   ├── runsheet.ar.json
│   └── …
├── legal/
│   ├── official-letter.ar.json
│   ├── legal-contract.ar.json
│   ├── rental-contract.ar.json
│   └── …
└── admin/
    └── …
```

## Manifest schema

```json
{
  "$schema": "../../docs/schemas/print-template.schema.json",
  "code": "finance.invoice",
  "version": "1.0.0",
  "locale": "ar",
  "entityType": "invoice",
  "layout": "a4",
  "paperSize": "A4",
  "isThermal": false,
  "branding": true,
  "signature": true,
  "qr": true,
  "status": "published",
  "domain": "finance",
  "title": "فاتورة ضريبية",
  "description": "ZATCA-compliant tax invoice with buyer, items table, totals, and verify QR.",
  "implementation": {
    "kind": "bespoke-preset",
    "key": "invoice_classic"
  },
  "sections": ["letterhead", "buyer-block", "items-table", "totals", "verify-block", "footer"],
  "ownerTeam": "finance"
}
```

### Field reference

| Field | Meaning |
|---|---|
| `code` | Stable identifier — referenced from `<ListPage documentTemplate="finance.invoice">`. Format: `<domain>.<name>`. |
| `version` | semver. Bump on layout changes; the resolver picks the highest `published` version. |
| `locale` | `ar`, `en`, `ar-SA`, etc. Multiple files for the same template can co-exist with different locales. |
| `entityType` | Must match an entry in `entityRegistry`. |
| `layout` | High-level family: `a4`, `thermal_80`, `thermal_58`, `label`, `excel`. |
| `paperSize` | The `PaperSize` enum from `lib/print/types.ts`. |
| `branding` | When `true`, branchContext fills `{{branch.letterhead}}` + `{{branch.footer}}`. |
| `signature` | When `true`, footer reserves space for handwritten signature + stamp. |
| `qr` | When `true`, `{{system.verifyBlock}}` is included (Phase 6 verify endpoint). |
| `status` | `draft`, `review`, `approved`, `published`, `archived`. Only `published` is served. |
| `implementation.kind` | `bespoke-preset` (in templateResolver), `db-template` (document_templates row), `universal-fallback` (synthesized). |
| `implementation.key` | When `bespoke-preset`, the key in `BESPOKE_PRESETS`. When `db-template`, the `presetKey` column value. |
| `sections` | Documentation-only — what the rendered doc contains, top to bottom. |
| `ownerTeam` | Who owns layout changes — for routing template change requests. |

## Lifecycle

```
draft → review → approved → published → archived
```

The resolver only serves `published`. `archived` rows are kept for audit (printed docs that were rendered with the old layout still verify correctly).

## Adding a new template

1. Decide the code (`<domain>.<name>`) and create `templates/<domain>/<name>.<locale>.json`.
2. Add the HTML implementation to `BESPOKE_PRESETS` in `templateResolver.ts` (or a `document_templates` row).
3. Reference from the registry via `<ListPage documentTemplate="<code>">` or `<PrintButton documentTemplate="<code>">`.
4. Run `pnpm print:audit-templates` to verify the registry agrees with the implementation.

## Audit cross-check

The script `scripts/src/audit-print-templates.mjs` (TBD) walks this directory, parses each manifest, and asserts:

- Every `implementation.key: bespoke-preset` resolves to an entry in `BESPOKE_PRESETS`.
- Every `implementation.key: db-template` resolves to a `document_templates` row at runtime.
- No orphan presets (in code but not in manifests) — those go in `_generic/`.
- `entityType` matches the dataLoader's switch case.

Wire this into `guard.sh` once the registry covers all 30 production entityTypes.

## Out of scope (future phases)

- **Template editor UI** — a designer that round-trips manifest ↔ DB. Phase 3.5.
- **Workflow approvals** — `draft → review → approved` flows that route through `print:template:approve`. Phase 3.7.
- **Localization service** — pulling translations from a CMS. Phase 5 sub-task.
