import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Download, Maximize2, ExternalLink, FileText, Image as ImageIcon, FileQuestion, X, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Shape of the attachment a caller passes in. The minimum is `id` + a way to
 * fetch the file; everything else is used for header chrome. `previewUrl` is
 * optional — if omitted, the default `/api/documents/:id/preview` endpoint
 * is used (which serves the file with Content-Disposition: inline so the
 * browser renders it instead of downloading).
 */
export interface PreviewableAttachment {
  id: number | string;
  title?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  category?: string;
  uploadedAt?: string;
  uploaderName?: string;
  /** Override the preview URL. If omitted, /api/documents/:id/preview is used. */
  previewUrl?: string;
  /** Override the download URL. If omitted, /api/documents/:id/download is used. */
  downloadUrl?: string;
}

interface AttachmentPreviewProps {
  attachment: PreviewableAttachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function isImageMime(mime?: string): boolean {
  return !!mime && mime.startsWith("image/");
}

function isPdfMime(mime?: string, fileName?: string): boolean {
  if (mime?.includes("pdf")) return true;
  return !!fileName && /\.pdf$/i.test(fileName);
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * AttachmentPreview — side-panel preview for uploaded files. Renders PDFs
 * and images inline using the `/preview` endpoint (Content-Disposition:
 * inline). For unsupported types, shows a download prompt.
 *
 * Key UX rules (derived from the expert review):
 *   1. Preview opens in a sheet, NOT a new tab/window — user stays in context.
 *   2. For PDFs, uses the browser's built-in viewer via <object> so zoom,
 *      page navigation, print, etc. all work for free.
 *   3. For images, uses <img> with a loading state.
 *   4. The header always shows file name, type, size, uploader, date.
 *   5. Action buttons: Download (force download), Open full (new tab),
 *      Close.
 *
 * The preview URL carries the auth token via query string because <object>
 * and <img> can't set Authorization headers. The backend /preview endpoint
 * accepts the token via ?t= as a fallback for this case.
 *
 * Caller owns open/close state so the same dialog can be driven from a
 * table row, a document list, a timeline entry, etc.
 */
export function AttachmentPreview({ attachment, open, onOpenChange }: AttachmentPreviewProps) {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !attachment) {
      setSrcUrl(null);
      setError(null);
      return;
    }

    let revokeUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = attachment.previewUrl || `${BASE}/api/documents/${attachment.id}/preview`;
        const token = localStorage.getItem("erp_token");
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "تعذّر تحميل المعاينة");
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        revokeUrl = objectUrl;
        if (!cancelled) setSrcUrl(objectUrl);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "تعذّر تحميل المعاينة");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [open, attachment?.id]);

  const handleDownload = async () => {
    if (!attachment) return;
    try {
      const url = attachment.downloadUrl || `${BASE}/api/documents/${attachment.id}/download`;
      const token = localStorage.getItem("erp_token");
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("فشل التنزيل");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = attachment.fileName || attachment.title || "file";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!attachment) return null;

  const isImage = isImageMime(attachment.mimeType);
  const isPdf = isPdfMime(attachment.mimeType, attachment.fileName);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-2xl lg:max-w-3xl p-0 flex flex-col" dir="rtl">
        <SheetHeader className="p-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className={cn(
                "w-10 h-10 rounded flex items-center justify-center shrink-0",
                isImage ? "bg-purple-50 text-purple-600" :
                isPdf ? "bg-red-50 text-red-600" :
                "bg-blue-50 text-blue-600"
              )}>
                {isImage ? <ImageIcon className="h-5 w-5" /> :
                 isPdf ? <FileText className="h-5 w-5" /> :
                 <FileQuestion className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-base truncate text-right">
                  {attachment.title || attachment.fileName || "معاينة مستند"}
                </SheetTitle>
                <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-gray-500">
                  {attachment.fileName && attachment.fileName !== attachment.title && (
                    <span className="truncate">{attachment.fileName}</span>
                  )}
                  {attachment.fileSize && <span>· {formatSize(attachment.fileSize)}</span>}
                  {attachment.mimeType && <Badge variant="outline" className="text-[10px] h-4">{attachment.mimeType}</Badge>}
                </div>
                {(attachment.uploaderName || attachment.uploadedAt) && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {attachment.uploaderName && <span>بواسطة {attachment.uploaderName}</span>}
                    {attachment.uploaderName && attachment.uploadedAt && <span> · </span>}
                    {attachment.uploadedAt && <span>{formatDateAr(attachment.uploadedAt)}</span>}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={handleDownload} title="تنزيل">
                <Download className="h-4 w-4" />
              </Button>
              {srcUrl && (
                <Button size="sm" variant="ghost" onClick={() => window.open(srcUrl, "_blank")} title="فتح في نافذة جديدة">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} title="إغلاق">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto bg-gray-50 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                <p className="text-xs text-gray-500">جاري تحميل المعاينة...</p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center space-y-3 max-w-sm">
                <div className="rounded-full bg-red-50 w-12 h-12 flex items-center justify-center mx-auto">
                  <FileQuestion className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">تعذّرت المعاينة</p>
                  <p className="text-sm text-gray-500 mt-1">{error}</p>
                </div>
                <Button size="sm" variant="outline" onClick={handleDownload}>
                  <Download className="h-3.5 w-3.5 ms-1" />
                  تنزيل الملف
                </Button>
              </div>
            </div>
          )}

          {!loading && !error && srcUrl && (
            <>
              {isPdf && (
                <object data={srcUrl} type="application/pdf" className="w-full h-full min-h-[70vh]">
                  <div className="flex items-center justify-center p-6">
                    <div className="text-center space-y-3">
                      <FileText className="h-10 w-10 text-gray-400 mx-auto" />
                      <p className="text-sm text-gray-500">متصفحك لا يدعم عرض PDF مباشرة</p>
                      <Button size="sm" variant="outline" onClick={handleDownload}>
                        <Download className="h-3.5 w-3.5 ms-1" />
                        تنزيل
                      </Button>
                    </div>
                  </div>
                </object>
              )}
              {isImage && (
                <div className="flex items-center justify-center p-4 min-h-[70vh]">
                  <img src={srcUrl} alt={attachment.title || attachment.fileName} className="max-w-full max-h-[80vh] object-contain" />
                </div>
              )}
              {!isPdf && !isImage && (
                <div className="flex items-center justify-center p-6 min-h-[40vh]">
                  <div className="text-center space-y-3 max-w-sm">
                    <div className="rounded-full bg-blue-50 w-12 h-12 flex items-center justify-center mx-auto">
                      <FileQuestion className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">لا يوجد عرض مباشر لهذا النوع</p>
                      <p className="text-sm text-gray-500 mt-1">يمكنك تنزيل الملف لمشاهدته</p>
                    </div>
                    <Button size="sm" variant="default" onClick={handleDownload}>
                      <Download className="h-3.5 w-3.5 ms-1" />
                      تنزيل الملف
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Convenience trigger button — opens preview on click. Designed to be dropped
 * into any file row where the old code showed a download icon only.
 */
interface PreviewButtonProps {
  attachment: PreviewableAttachment;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "ghost" | "outline" | "default";
  className?: string;
  label?: string;
}

export function PreviewButton({ attachment, size = "sm", variant = "ghost", className, label }: PreviewButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} className={cn("gap-1", className)} onClick={() => setOpen(true)} title="معاينة">
        <Eye className="h-3.5 w-3.5" />
        {label}
      </Button>
      <AttachmentPreview attachment={attachment} open={open} onOpenChange={setOpen} />
    </>
  );
}
