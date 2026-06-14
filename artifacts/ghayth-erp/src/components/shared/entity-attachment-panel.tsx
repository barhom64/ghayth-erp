/**
 * EntityAttachmentPanel — عرض ورفع المرفقات المرتبطة بكيان.
 *
 * تدفق الرفع (ثلاث خطوات):
 *   1. POST /api/storage/uploads/request-url  → uploadURL, objectPath
 *   2. PUT  uploadURL  (مباشرة للتخزين السحابي)
 *   3. POST /api/documents/upload  (تسجيل في قاعدة البيانات + ربط الكيان)
 *
 * الصور تُفتح في AttachmentPreview (لوحة جانبية) بدل تبويب جديد.
 * ملفات PDF والوثائق كذلك.
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useApiQuery } from "@/lib/api";
import { AttachmentPreview, type PreviewableAttachment } from "./attachment-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload, FileText, Image as ImageIcon, File, Loader2,
  Eye, Trash2, AlertCircle, Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";

/* ─── category helpers ─────────────────────────────────────────────── */
export const PROPERTY_ATTACHMENT_CATEGORIES = [
  { value: "property_photo",       label: "صورة عقار" },
  { value: "unit_photo_before",    label: "صورة وحدة (قبل)" },
  { value: "unit_photo_after",     label: "صورة وحدة (بعد)" },
  { value: "unit_handover",        label: "صورة تسليم" },
  { value: "contract_pdf",         label: "ملف عقد" },
  { value: "title_deed",           label: "صك ملكية" },
  { value: "tenant_id",            label: "هوية مستأجر" },
  { value: "payment_receipt",      label: "سند قبض" },
  { value: "maintenance_photo",    label: "صورة صيانة" },
  { value: "eviction_photo",       label: "صورة إخلاء" },
  { value: "legal_notice",         label: "إشعار قانوني" },
  { value: "other",                label: "أخرى" },
] as const;

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  PROPERTY_ATTACHMENT_CATEGORIES.map(c => [c.value, c.label])
);

function categoryLabel(cat?: string) {
  return cat ? (CATEGORY_LABELS[cat] ?? cat) : "";
}

function isImage(mime?: string, name?: string): boolean {
  if (mime?.startsWith("image/")) return true;
  return !!name && /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(name);
}

function isPdf(mime?: string, name?: string): boolean {
  if (mime?.includes("pdf")) return true;
  return !!name && /\.pdf$/i.test(name);
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ─── types ────────────────────────────────────────────────────────── */
interface DocumentRow {
  id: number;
  title?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  category?: string;
  storageKey?: string;
  createdAt?: string;
  uploaderName?: string;
}

interface EntityAttachmentPanelProps {
  entityType: string;
  entityId: number | string;
  /** Label shown in the header (e.g. "مرفقات الوحدة") */
  label?: string;
  /** Default category for uploaded files in this context */
  defaultCategory?: string;
  /** Whether to show the upload button (default: true) */
  canUpload?: boolean;
  /** Optional list of categories to filter displayed attachments */
  filterCategories?: string[];
  className?: string;
}

/* ─── main component ───────────────────────────────────────────────── */
export function EntityAttachmentPanel({
  entityType,
  entityId,
  label = "المرفقات",
  defaultCategory = "other",
  canUpload = true,
  filterCategories,
  className,
}: EntityAttachmentPanelProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [preview, setPreview] = useState<PreviewableAttachment | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  /* fetch documents for this entity */
  const { data: docs, isLoading, isError, refetch } = useApiQuery<DocumentRow[]>(
    ["entity-attachments", entityType, String(entityId)],
    `/documents?entity=${entityType}&entityId=${entityId}`,
    !!entityId
  );

  const documents = (docs ?? []).filter(d =>
    !filterCategories || filterCategories.includes(d.category ?? "")
  );

  const images = documents.filter(d => isImage(d.mimeType, d.fileName));
  const files = documents.filter(d => !isImage(d.mimeType, d.fileName));

  /* ── upload flow ── */
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      /* step 1: request upload URL */
      setUploadProgress("جاري الحصول على رابط الرفع...");
      const { uploadURL, objectPath } = await apiFetch<{ uploadURL: string; objectPath: string }>(
        "/storage/uploads/request-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        }
      );

      /* step 2: upload file to cloud storage */
      setUploadProgress("جاري رفع الملف...");
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error("فشل رفع الملف للتخزين");

      /* step 3: register document in DB */
      setUploadProgress("جاري تسجيل المرفق...");
      await apiFetch("/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: file.name,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          storageKey: objectPath,
          category: defaultCategory,
          entityLinks: [{ entityType, entityId: Number(entityId) }],
        }),
      });

      toast({ title: "تم رفع المرفق بنجاح", variant: "default" });
      qc.invalidateQueries({ queryKey: ["entity-attachments", entityType, String(entityId)] });
    } catch (err: any) {
      toast({ title: "فشل الرفع", description: err?.message || "حاول مرة أخرى", variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  }

  /* ── open preview ── */
  function openPreview(doc: DocumentRow) {
    setPreview({
      id: doc.id,
      title: doc.title || doc.fileName,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      category: doc.category,
      uploadedAt: doc.createdAt,
      uploaderName: doc.uploaderName,
    });
    setPreviewOpen(true);
  }

  /* ── render ── */
  return (
    <div className={cn("space-y-3", className)}>
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          {label}
          {documents.length > 0 && (
            <Badge variant="secondary" className="text-xs">{documents.length}</Badge>
          )}
        </div>
        {canUpload && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-1.5 h-7 text-xs"
            >
              {uploading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Upload className="h-3.5 w-3.5" />
              }
              {uploading ? uploadProgress || "جاري الرفع..." : "رفع ملف"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={handleFileChange}
            />
          </>
        )}
      </div>

      {/* loading */}
      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          جاري تحميل المرفقات...
        </div>
      )}

      {/* error */}
      {isError && (
        <div className="flex items-center gap-2 text-xs text-red-500 py-2">
          <AlertCircle className="h-4 w-4" />
          تعذّر تحميل المرفقات
          <Button size="sm" variant="ghost" className="h-5 text-xs" onClick={() => refetch()}>إعادة المحاولة</Button>
        </div>
      )}

      {/* empty */}
      {!isLoading && !isError && documents.length === 0 && (
        <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-lg">
          <Paperclip className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
          لا توجد مرفقات
          {canUpload && <span className="block mt-0.5">ارفع ملف لإضافته</span>}
        </div>
      )}

      {/* images grid */}
      {images.length > 0 && (
        <div>
          <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
            <ImageIcon className="h-3 w-3" /> الصور ({images.length})
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
            {images.map(doc => (
              <button
                key={doc.id}
                onClick={() => openPreview(doc)}
                className="group relative aspect-square rounded-md overflow-hidden border bg-surface-subtle hover:ring-2 hover:ring-primary transition-all"
                title={doc.title || doc.fileName}
              >
                {/* thumbnail via preview endpoint */}
                <img
                  src={`/api/documents/${doc.id}/preview`}
                  alt={doc.title || doc.fileName || "صورة"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={e => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                  }}
                />
                {/* fallback icon */}
                <div className="hidden absolute inset-0 flex items-center justify-center bg-surface-subtle">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                {/* hover overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Eye className="h-5 w-5 text-white" />
                </div>
                {/* category badge */}
                {doc.category && doc.category !== "other" && (
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5">
                    <span className="text-[10px] text-white truncate block">{categoryLabel(doc.category)}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* non-image files list */}
      {files.length > 0 && (
        <div>
          <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
            <FileText className="h-3 w-3" /> وثائق ({files.length})
          </p>
          <div className="space-y-1">
            {files.map(doc => {
              const _isPdf = isPdf(doc.mimeType, doc.fileName);
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-2 p-2 rounded-md border bg-surface-subtle hover:bg-surface text-xs"
                >
                  <div className={cn(
                    "w-7 h-7 rounded flex items-center justify-center shrink-0",
                    _isPdf ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-500"
                  )}>
                    {_isPdf ? <FileText className="h-4 w-4" /> : <File className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{doc.title || doc.fileName || "ملف"}</p>
                    <div className="flex items-center gap-1.5 text-muted-foreground mt-0.5">
                      {doc.category && <span>{categoryLabel(doc.category)}</span>}
                      {doc.fileSize && <span>· {formatBytes(doc.fileSize)}</span>}
                      {doc.createdAt && <span>· {formatDateAr(doc.createdAt)}</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => openPreview(doc)}
                    title="معاينة"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* preview sheet */}
      <AttachmentPreview
        attachment={preview}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
}
