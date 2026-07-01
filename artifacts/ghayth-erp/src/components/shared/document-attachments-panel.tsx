import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Upload, Trash2, ExternalLink } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * DocumentAttachmentsPanel — م١-ب: two-level tagged attachments (قرار docs/25
 * §٨.٢). One panel for the whole document; each attachment is tagged «متعلّق
 * بـ» the document OR a specific line (financial_attachments.lineId). Feeds the
 * attachments[] of POST /finance/documents (lineNo = null → document-level).
 */
export type DocAttachment = {
  url: string;
  fileName: string;
  mimeType: string;
  documentType: string;
  /** null = document-level; 1-based line number = line-level */
  lineNo: number | null;
};

const DOC_TYPES: { value: string; label: string }[] = [
  { value: "invoice", label: "فاتورة" },
  { value: "receipt", label: "وصل استلام" },
  { value: "transfer", label: "إشعار تحويل" },
  { value: "check", label: "شيك" },
  { value: "contract", label: "عقد" },
  { value: "other", label: "أخرى" },
];

export function DocumentAttachmentsPanel({
  value,
  onChange,
  lineCount,
}: {
  value: DocAttachment[];
  onChange: (v: DocAttachment[]) => void;
  lineCount: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        onChange([
          ...value,
          { url: reader.result as string, fileName: file.name, mimeType: file.type, documentType: "invoice", lineNo: null },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };
  const update = (i: number, patch: Partial<DocAttachment>) => onChange(value.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="rounded-lg border p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          <h3 className="font-semibold text-sm text-muted-foreground">المرفقات (مستوى المستند والبند)</h3>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> رفع مرفق
        </Button>
        <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا مرفقات بعد. ارفع الفاتورة/الوصل/الإشعار، ووسِم كل مرفق: متعلّق بالمستند أو ببند محدّد.</p>
      ) : (
        <div className="space-y-2">
          {value.map((a, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_140px_160px_auto] gap-2 items-center rounded-md border bg-muted/20 p-2">
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-status-info-foreground hover:underline min-w-0">
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{a.fileName}</span>
              </a>
              <Select value={a.documentType} onValueChange={(v) => update(i, { documentType: v })}>
                <SelectTrigger><SelectValue placeholder="النوع" /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={a.lineNo == null ? "doc" : String(a.lineNo)} onValueChange={(v) => update(i, { lineNo: v === "doc" ? null : Number(v) })}>
                <SelectTrigger><SelectValue placeholder="متعلّق بـ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="doc">متعلّق بالمستند</SelectItem>
                  {Array.from({ length: lineCount }, (_, n) => (
                    <SelectItem key={n + 1} value={String(n + 1)}>متعلّق بالبند {n + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-status-error-foreground" aria-label="حذف المرفق">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
