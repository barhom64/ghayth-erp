import { useEffect, useRef, useState } from "react";
import { Upload, Download, ExternalLink, RefreshCw, Trash2, ZoomIn, ZoomOut, FileWarning, ImageOff, Paperclip, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * FinancialAttachmentViewer (FIN-P7-ATTACHMENT-WORKSPACE #2237).
 *
 * A reusable financial-attachment workspace that turns the attachment from a
 * bottom-of-page upload into a side panel shown during ENTRY, APPROVAL and
 * VIEW. Single responsibility: DISPLAY an attachment and expose explicit
 * upload/replace/remove/download actions per mode. It does NOT do OCR, does NOT
 * extract data, and does NOT touch the journal — it only previews the document
 * and surfaces its link to the financial record (documentType/documentId) and
 * its internal serial when one exists.
 *
 * Modes:
 *   • create — operator sees the invoice while typing items; replace/remove allowed.
 *   • review — approver compares items to the document; edits only via an explicit
 *     gated action (canReplace, e.g. finance:approve).
 *   • detail — read-only; open / download only.
 *
 * Image/PDF are supported. With no bundled PDF.js, PDFs render in the browser's
 * native viewer via <iframe> (paging handled by the browser); a download/open
 * fallback always shows. Unsupported types and load failures have explicit states.
 */
export interface FinancialAttachment {
  id?: string | number;
  /** data: URL or a remote URL. */
  url: string;
  name?: string;
  /** MIME type when known (image/*, application/pdf, …). */
  type?: string | null;
  /** Business document type label (فاتورة / وصل استلام / …). */
  documentType?: string | null;
  /** Internal serial number of the financial attachment, when one exists. */
  serialNo?: string | null;
  /** Link/lifecycle status (linked / needs_replace / …). */
  status?: string | null;
}

export type AttachmentViewerMode = "create" | "review" | "detail";

const STATUS_LABELS: Record<string, string> = {
  linked: "مربوط بالسجل",
  needs_replace: "يحتاج استبدال",
  pending: "بانتظار الربط",
};

function classifyKind(att: FinancialAttachment): "image" | "pdf" | "unsupported" {
  const t = (att.type ?? "").toLowerCase();
  const u = (att.url ?? "").toLowerCase();
  if (t.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/.test(u) || u.startsWith("data:image/")) return "image";
  if (t === "application/pdf" || /\.pdf(\?|#|$)/.test(u) || u.startsWith("data:application/pdf")) return "pdf";
  return "unsupported";
}

export function FinancialAttachmentViewer({
  attachments,
  activeAttachmentId,
  mode = "create",
  documentType,
  documentId,
  canReplace = false,
  canDownload = true,
  loading = false,
  onUpload,
  onReplace,
  onRemove,
  className,
}: {
  attachments: FinancialAttachment[];
  activeAttachmentId?: string | number;
  mode?: AttachmentViewerMode;
  documentType?: string | null;
  documentId?: string | number | null;
  canReplace?: boolean;
  canDownload?: boolean;
  loading?: boolean;
  onUpload?: (file: File) => void;
  onReplace?: (file: File) => void;
  onRemove?: () => void;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [intent, setIntent] = useState<"upload" | "replace">("upload");
  const [zoom, setZoom] = useState(1);
  const [imgFailed, setImgFailed] = useState(false);

  const active =
    attachments.find((a) => activeAttachmentId != null && a.id === activeAttachmentId) ??
    attachments[0] ??
    null;

  // reset transient view state when the shown attachment changes.
  useEffect(() => { setZoom(1); setImgFailed(false); }, [active?.url]);

  // create mode may always replace; review only via the explicit gated action.
  const mayMutate = mode === "create" || (mode === "review" && canReplace);

  const pickFile = (which: "upload" | "replace") => {
    setIntent(which);
    fileInputRef.current?.click();
  };
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) (intent === "replace" ? onReplace : onUpload)?.(f);
    e.target.value = "";
  };

  const kind = active ? classifyKind(active) : null;

  return (
    <div className={cn("rounded-lg border bg-card flex flex-col", className)} data-attachment-viewer data-mode={mode}>
      {/* header — document type / internal serial / link status */}
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Paperclip className="h-4 w-4" />
          مستند السجل المالي
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {(active?.documentType ?? documentType) && (
            <span className="px-2 py-0.5 rounded bg-muted">{active?.documentType ?? documentType}</span>
          )}
          {active?.serialNo
            ? <span className="px-2 py-0.5 rounded bg-status-info-surface text-status-info-foreground inline-flex items-center gap-1"><Hash className="h-3 w-3" />{active.serialNo}</span>
            : <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground" title="لا يوجد رقم تسلسل داخلي للمرفق بعد">بلا رقم تسلسل</span>}
          {active?.status && STATUS_LABELS[active.status] && (
            <span className={cn("px-2 py-0.5 rounded", active.status === "needs_replace" ? "bg-status-warning-surface text-status-warning-foreground" : "bg-status-success-surface text-status-success-foreground")}>
              {STATUS_LABELS[active.status]}
            </span>
          )}
          {documentId != null && <span className="text-muted-foreground">#{String(documentId)}</span>}
        </div>
      </div>

      {/* toolbar — zoom (images) + actions per mode */}
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <div className="flex items-center gap-1">
          {kind === "image" && !imgFailed && (
            <>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(0.25, Math.round((z - 0.25) * 100) / 100))} aria-label="تصغير"><ZoomOut className="h-4 w-4" /></Button>
              <span className="text-xs tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))} aria-label="تكبير"><ZoomIn className="h-4 w-4" /></Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {active && canDownload && (
            <>
              <a href={active.url} target="_blank" rel="noopener noreferrer" className="inline-flex">
                <Button type="button" variant="ghost" size="sm" className="h-7"><ExternalLink className="h-3.5 w-3.5 me-1" />فتح</Button>
              </a>
              <a href={active.url} download={active.name ?? "attachment"} className="inline-flex">
                <Button type="button" variant="ghost" size="sm" className="h-7"><Download className="h-3.5 w-3.5 me-1" />تنزيل</Button>
              </a>
            </>
          )}
          {active && mayMutate && (
            <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => pickFile("replace")}><RefreshCw className="h-3.5 w-3.5 me-1" />استبدال</Button>
          )}
          {active && mode === "create" && onRemove && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-status-error" onClick={onRemove}><Trash2 className="h-3.5 w-3.5 me-1" />إزالة</Button>
          )}
        </div>
      </div>

      {/* body — the document preview / state */}
      <div className="relative flex-1 min-h-64 overflow-auto bg-muted/30 flex items-center justify-center p-3">
        {loading ? (
          <div className="text-sm text-muted-foreground" data-state="loading">جارٍ التحميل…</div>
        ) : !active ? (
          <div className="text-center text-sm text-muted-foreground space-y-3" data-state="empty">
            <ImageOff className="h-8 w-8 mx-auto opacity-50" />
            <p>لا يوجد مرفق</p>
            {mode === "create" && onUpload && (
              <Button type="button" variant="outline" size="sm" onClick={() => pickFile("upload")}><Upload className="h-4 w-4 me-1" />ارفع مستندًا</Button>
            )}
          </div>
        ) : kind === "image" ? (
          imgFailed ? (
            <div className="text-center text-sm text-status-error-foreground space-y-1" data-state="error"><ImageOff className="h-8 w-8 mx-auto" /><p>تعذّر تحميل الصورة</p></div>
          ) : (
            <img
              src={active.url}
              alt={active.name ?? "مرفق"}
              data-state="image"
              onError={() => setImgFailed(true)}
              style={{ transform: `scale(${zoom})` }}
              className="max-w-full max-h-[70vh] origin-top transition-transform"
            />
          )
        ) : kind === "pdf" ? (
          <iframe src={active.url} title={active.name ?? "PDF"} data-state="pdf" className="w-full h-[70vh] border-0 bg-white" />
        ) : (
          <div className="text-center text-sm text-muted-foreground space-y-1" data-state="unsupported">
            <FileWarning className="h-8 w-8 mx-auto opacity-60" />
            <p>نوع المرفق غير مدعوم للمعاينة</p>
            {canDownload && <p className="text-xs">استخدم «فتح» أو «تنزيل» لعرضه.</p>}
          </div>
        )}
      </div>

      {/* review-mode gate note */}
      {mode === "review" && !canReplace && active && (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">العرض للاعتماد فقط — استبدال المرفق يتطلب صلاحية وإجراءً صريحًا.</div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
    </div>
  );
}
