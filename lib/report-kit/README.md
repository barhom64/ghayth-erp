# @workspace/report-kit

> **Phase 1 (contract package)** — Print, PDF, export.
>
> راجع `docs/UNIFICATION_PLAN.md` §P8.

## الغرض

كل ما يخص إخراج الوثائق: print preview، direct print، export (CSV /
Excel)، PDF templating. الهدف: قالب موحَّد بدل 21 نقطة print/PDF
متفرّقة عبر الكود.

## ما يدخل هذه الحزمة

| الفئة | المُمكِّنات |
| --- | --- |
| Print | `PrintDocument`, `PrintPreviewModal`, `PrintActions`, `directPrint`, `LetterheadHeader`, `LetterheadFooter` |
| Entity print | `EntityPrintButton`, `PrintSections` |
| Export | `ExportButton`, `MultiExportButton` |

## ما لا يدخل هذه الحزمة (مخطط للنمو)

- `PdfRenderer` — مُحرّك PDF موحَّد (Puppeteer / @react-pdf)
- `DocumentTemplate` API + jdbm template versioning
- Variable engine (`{{company.name}}`, `{{invoice.total | currency}}`)
- `document_templates` admin UI

كل هذا في Track D من `docs/production-hardening/enterprise-hardening-roadmap.md`.

## الحالة الفعلية (Phase 1)

re-export shim من
`artifacts/ghayth-erp/src/components/print-layout.tsx` +
`shared/entity-print.tsx` + `shared/export-buttons.tsx`. الكود الفعلي
ينتقل في Phase 2.

## الاستهلاك

```tsx
import {
  PrintActions,
  ExportButton,
  EntityPrintButton,
} from "@workspace/report-kit";

export function InvoiceToolbar({ invoiceId }: { invoiceId: number }) {
  return (
    <>
      <PrintActions documentTitle={`فاتورة #${invoiceId}`} />
      <ExportButton endpoint="/api/finance/invoices/export" filename="invoices.xlsx" type="xlsx" />
    </>
  );
}
```
