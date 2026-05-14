import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Eye, X } from "lucide-react";

export interface BranchLetterhead {
  name?: string;
  nameEn?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  taxNumber?: string;
  crNumber?: string;
  footerText?: string;
  city?: string;
}

interface PrintLayoutProps {
  branch?: BranchLetterhead;
  documentTitle?: string;
  documentRef?: string;
  documentDate?: string;
  children: React.ReactNode;
  showPreviewButton?: boolean;
  showPrintButton?: boolean;
}

function LetterheadHeader({ branch }: { branch?: BranchLetterhead }) {
  if (!branch) return null;
  return (
    <div className="print-header border-b-2 border-gray-800 pb-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {branch.logoUrl && (
            <img
              src={branch.logoUrl}
              alt="شعار الشركة"
              className="w-20 h-20 object-contain"
            />
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{branch.name || ""}</h1>
            {branch.nameEn && (
              <p className="text-sm text-muted-foreground font-medium" dir="ltr">{branch.nameEn}</p>
            )}
            {branch.city && (
              <p className="text-sm text-muted-foreground mt-1">{branch.city}</p>
            )}
          </div>
        </div>
        <div className="text-left text-xs text-muted-foreground space-y-0.5">
          {branch.phone && <p>هاتف: <span dir="ltr">{branch.phone}</span></p>}
          {branch.email && <p>بريد إلكتروني: <span dir="ltr">{branch.email}</span></p>}
          {branch.website && <p>الموقع الإلكتروني: <span dir="ltr">{branch.website}</span></p>}
          {branch.taxNumber && <p>الرقم الضريبي: <span dir="ltr">{branch.taxNumber}</span></p>}
          {branch.crNumber && <p>السجل التجاري: <span dir="ltr">{branch.crNumber}</span></p>}
        </div>
      </div>
      {branch.address && (
        <p className="text-xs text-muted-foreground mt-2">{branch.address}</p>
      )}
    </div>
  );
}

function LetterheadFooter({ branch, documentRef }: { branch?: BranchLetterhead; documentRef?: string }) {
  return (
    <div className="print-footer border-t border-border pt-3 mt-8 text-xs text-muted-foreground">
      <div className="flex justify-between items-center">
        <span>{branch?.footerText || ""}</span>
        <span>{documentRef && `Ref: ${documentRef}`}</span>
      </div>
    </div>
  );
}

function DocumentMeta({ title, ref, date }: { title?: string; ref?: string; date?: string }) {
  if (!title && !ref && !date) return null;
  return (
    <div className="mb-6 text-center">
      {title && <h2 className="text-lg font-bold text-gray-900 mb-1">{title}</h2>}
      <div className="flex justify-center gap-6 text-sm text-muted-foreground">
        {ref && <span>الرقم المرجعي: <strong>{ref}</strong></span>}
        {date && <span>التاريخ: <strong>{date}</strong></span>}
      </div>
    </div>
  );
}

export function PrintDocument({
  branch,
  documentTitle,
  documentRef,
  documentDate,
  children,
}: Omit<PrintLayoutProps, "showPreviewButton" | "showPrintButton">) {
  return (
    <div className="print-document bg-white" dir="rtl">
      <LetterheadHeader branch={branch} />
      <DocumentMeta title={documentTitle} ref={documentRef} date={documentDate} />
      <div className="print-body">{children}</div>
      <LetterheadFooter branch={branch} documentRef={documentRef} />
    </div>
  );
}

export function PrintPreviewModal({
  open,
  onClose,
  branch,
  documentTitle,
  documentRef,
  documentDate,
  children,
}: {
  open: boolean;
  onClose: () => void;
  branch?: BranchLetterhead;
  documentTitle?: string;
  documentRef?: string;
  documentDate?: string;
  children: React.ReactNode;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>${documentTitle || "طباعة"}</title>
        <style>
          @page { size: A4; margin: 1.5cm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: "Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif;
            direction: rtl;
            color: #111;
            font-size: 11pt;
            line-height: 1.6;
          }
          .print-document { padding: 0; }
          .print-header { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
          .print-header > div:first-child { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
          .print-header .logo-section { display: flex; align-items: center; gap: 12px; }
          .print-header img { width: 70px; height: 70px; object-fit: contain; }
          .print-header h1 { font-size: 18pt; font-weight: bold; color: #111; }
          .print-header .en-name { font-size: 10pt; color: #555; }
          .print-header .contact-info { text-align: left; font-size: 8pt; color: #555; direction: ltr; }
          .print-header .contact-info p { margin: 1px 0; }
          .print-header .address { font-size: 8pt; color: #777; margin-top: 8px; }
          .doc-meta { text-align: center; margin-bottom: 20px; }
          .doc-meta h2 { font-size: 14pt; font-weight: bold; margin-bottom: 4px; }
          .doc-meta .meta-row { display: flex; justify-content: center; gap: 24px; font-size: 10pt; color: #555; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: right; font-size: 10pt; }
          th { background: #f5f5f5; font-weight: bold; }
          .print-footer { border-top: 1px solid #ccc; padding-top: 8px; margin-top: 30px; font-size: 8pt; color: #777; display: flex; justify-content: space-between; }
          .summary-table td { border: none; padding: 4px 8px; }
          .summary-table .label { color: #555; }
          .summary-table .value { font-weight: bold; }
          .text-left { text-align: left; }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .text-status-success-foreground { color: #16a34a; }
          .text-status-error-foreground { color: #dc2626; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
          .info-grid .info-item { display: flex; gap: 4px; font-size: 10pt; }
          .info-grid .info-label { color: #555; }
          .info-grid .info-value { font-weight: 600; }
          .letter-body { white-space: pre-wrap; line-height: 2; font-size: 12pt; margin: 20px 0; }
          .signature-area { margin-top: 60px; display: flex; justify-content: space-between; }
          .signature-box { text-align: center; min-width: 150px; }
          .signature-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; font-size: 9pt; }
          @page { @bottom-center { content: counter(page) " / " counter(pages); font-size: 8pt; color: #999; } }
        </style>
      </head>
      <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 300);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-auto p-4">
      <div className="bg-gray-100 rounded-lg shadow-2xl w-full max-w-4xl my-4">
        <div className="flex items-center justify-between p-4 border-b bg-white rounded-t-lg no-print">
          <h3 className="font-semibold text-lg">معاينة الطباعة</h3>
          <div className="flex gap-2">
            <Button onClick={handlePrint} size="sm">
              <Printer className="h-4 w-4 me-1" />طباعة
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4 me-1" />إغلاق
            </Button>
          </div>
        </div>
        <div className="p-8">
          <div
            ref={printRef}
            className="bg-white shadow-lg mx-auto p-10"
            style={{ width: "210mm", minHeight: "297mm", maxWidth: "100%" }}
          >
            <PrintDocument
              branch={branch}
              documentTitle={documentTitle}
              documentRef={documentRef}
              documentDate={documentDate}
            >
              {children}
            </PrintDocument>
          </div>
        </div>
      </div>
    </div>
  );
}

export function directPrint(contentEl: HTMLElement | null, documentTitle?: string) {
  if (!contentEl) return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8" />
      <title>${documentTitle || "طباعة"}</title>
      <style>
        @page { size: A4; margin: 1.5cm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: "Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif;
          direction: rtl; color: #111; font-size: 11pt; line-height: 1.6;
        }
        .print-document { padding: 0; }
        .print-header { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
        .print-header > div:first-child { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .print-header img { width: 70px; height: 70px; object-fit: contain; }
        .print-header h1 { font-size: 18pt; font-weight: bold; color: #111; }
        .print-header .en-name { font-size: 10pt; color: #555; }
        .print-header .contact-info { text-align: left; font-size: 8pt; color: #555; direction: ltr; }
        .print-header .contact-info p { margin: 1px 0; }
        .print-header .address { font-size: 8pt; color: #777; margin-top: 8px; }
        .doc-meta { text-align: center; margin-bottom: 20px; }
        .doc-meta h2 { font-size: 14pt; font-weight: bold; margin-bottom: 4px; }
        .doc-meta .meta-row { display: flex; justify-content: center; gap: 24px; font-size: 10pt; color: #555; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: right; font-size: 10pt; }
        th { background: #f5f5f5; font-weight: bold; }
        .print-footer { border-top: 1px solid #ccc; padding-top: 8px; margin-top: 30px; font-size: 8pt; color: #777; display: flex; justify-content: space-between; }
        .summary-table td { border: none; padding: 4px 8px; }
        .text-left { text-align: left; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .text-status-success-foreground { color: #16a34a; }
        .text-status-error-foreground { color: #dc2626; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
        .info-grid .info-item { display: flex; gap: 4px; font-size: 10pt; }
        .info-grid .info-label { color: #555; }
        .info-grid .info-value { font-weight: 600; }
        .letter-body { white-space: pre-wrap; line-height: 2; font-size: 12pt; margin: 20px 0; }
        .signature-area { margin-top: 60px; display: flex; justify-content: space-between; }
        .signature-box { text-align: center; min-width: 150px; }
        .signature-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; font-size: 9pt; }
        @page { @bottom-center { content: counter(page) " / " counter(pages); font-size: 8pt; color: #999; } }
      </style>
    </head>
    <body>${contentEl.innerHTML}</body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 300);
}

export function PrintActions({
  onPreview,
  onPrint,
}: {
  onPreview?: () => void;
  onPrint?: () => void;
}) {
  return (
    <div className="flex gap-2 no-print">
      {onPreview && (
        <Button variant="outline" onClick={onPreview}>
          <Eye className="h-4 w-4 me-1" />معاينة الطباعة
        </Button>
      )}
      {onPrint && (
        <Button variant="outline" onClick={onPrint}>
          <Printer className="h-4 w-4 me-1" />طباعة
        </Button>
      )}
    </div>
  );
}

export { LetterheadHeader, LetterheadFooter };
