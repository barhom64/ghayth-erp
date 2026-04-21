import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { PrintPreviewModal } from "@/components/print-layout";
import { useBranchLetterhead } from "@/hooks/use-branch-letterhead";

/**
 * Structured print section — caller composes a document from these blocks
 * so every entity's print output has the same rhythm: meta grid on top,
 * then sections (info/items/summary/text), then signature block.
 */
export type PrintSection =
  | { kind: "info-grid"; items: Array<{ label: string; value: ReactNode }> }
  | { kind: "table"; columns: string[]; rows: ReactNode[][]; title?: string }
  | { kind: "summary"; items: Array<{ label: string; value: ReactNode; bold?: boolean }> }
  | { kind: "text"; title?: string; body: ReactNode }
  | { kind: "signature"; parties: Array<{ label: string; name?: string }> }
  | { kind: "divider" };

/**
 * EntityPrintButton — drop-in trigger for any detail page. Handles the
 * open/close state + fetches the branch letterhead automatically.
 *
 *   <EntityPrintButton
 *     branchId={invoice.branchId}
 *     title="فاتورة ضريبية"
 *     ref={invoice.invoiceNumber}
 *     date={invoice.issueDate}
 *     sections={[
 *       { kind: "info-grid", items: [
 *         { label: "العميل", value: invoice.clientName },
 *         { label: "المشروع", value: invoice.projectName },
 *       ]},
 *       { kind: "table", title: "البنود", columns: ["الصنف", "الكمية", "السعر", "الإجمالي"], rows: ... },
 *       { kind: "summary", items: [
 *         { label: "الإجمالي الفرعي", value: "10,000 ر.س" },
 *         { label: "الضريبة 15%", value: "1,500 ر.س" },
 *         { label: "الإجمالي النهائي", value: "11,500 ر.س", bold: true },
 *       ]},
 *     ]}
 *   />
 */

interface EntityPrintButtonProps {
  branchId?: number;
  title: string;
  ref?: string;
  date?: string;
  sections: PrintSection[];
  /** Pre-sections content (e.g. an arabic cover letter). */
  preamble?: ReactNode;
  /** Button label override. */
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

export function EntityPrintButton({
  branchId,
  title,
  ref,
  date,
  sections,
  preamble,
  label = "طباعة / معاينة",
  variant = "outline",
  size = "sm",
}: EntityPrintButtonProps) {
  const [open, setOpen] = useState(false);
  const letterhead = useBranchLetterhead(branchId);

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} className="gap-1">
        <Printer className="h-4 w-4" />
        {label}
      </Button>
      <PrintPreviewModal
        open={open}
        onClose={() => setOpen(false)}
        branch={letterhead}
        documentTitle={title}
        documentRef={ref}
        documentDate={date}
      >
        {preamble}
        <PrintSections sections={sections} />
      </PrintPreviewModal>
    </>
  );
}

/** Render a list of structured sections into print-friendly HTML. */
export function PrintSections({ sections }: { sections: PrintSection[] }) {
  return (
    <div className="space-y-5">
      {sections.map((s, i) => {
        switch (s.kind) {
          case "info-grid":
            return (
              <div key={i} className="info-grid">
                {s.items.map((it, j) => (
                  <div key={j} className="info-item">
                    <span className="info-label">{it.label}:</span>
                    <span className="info-value">{it.value ?? "-"}</span>
                  </div>
                ))}
              </div>
            );
          case "table":
            return (
              <div key={i}>
                {s.title && <h3 className="text-sm font-bold mb-1">{s.title}</h3>}
                <table className="w-full">
                  <thead>
                    <tr>
                      {s.columns.map((c, j) => <th key={j}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => <td key={c}>{cell ?? "-"}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "summary":
            return (
              <table key={i} className="summary-table mt-2">
                <tbody>
                  {s.items.map((it, j) => (
                    <tr key={j}>
                      <td className="label w-1/2">{it.label}:</td>
                      <td className={`value ${it.bold ? "font-bold text-base" : ""}`}>{it.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          case "text":
            return (
              <div key={i}>
                {s.title && <h3 className="text-sm font-bold mb-2">{s.title}</h3>}
                <div className="letter-body">{s.body}</div>
              </div>
            );
          case "signature":
            return (
              <div key={i} className="signature-area">
                {s.parties.map((p, j) => (
                  <div key={j} className="signature-box">
                    <p className="text-xs text-gray-600">{p.label}</p>
                    <p className="signature-line">{p.name ?? ""}</p>
                  </div>
                ))}
              </div>
            );
          case "divider":
            return <hr key={i} className="border-t border-gray-300 my-3" />;
        }
      })}
    </div>
  );
}
