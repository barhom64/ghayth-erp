import { useState, useRef } from "react";
import { API_BASE, nativeAuthHeaders } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { z } from "zod";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { notifyRateLimited, RateLimitError } from "@/lib/rate-limit-toast";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormShell, FormTextField, FormSelectField } from "@workspace/ui-core";
import { FileText, Upload, Download, Plus, X, FileUp, Eye, List, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachmentPreview, type PreviewableAttachment } from "./attachment-preview";
import { formatDateAr } from "@/lib/formatters";

const uploadDocSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  category: z.string(),
});

const CATEGORIES = [
  { value: "contracts", label: "عقود" },
  { value: "official", label: "وثائق رسمية" },
  { value: "financial", label: "مالية" },
  { value: "hr", label: "موارد بشرية" },
  { value: "legal", label: "قانونية" },
  { value: "other", label: "أخرى" },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "bg-gray-100 text-gray-700" },
  active: { label: "نشط", color: "bg-blue-100 text-status-info-foreground" },
  approved: { label: "معتمد", color: "bg-green-100 text-status-success-foreground" },
  cancelled: { label: "ملغي", color: "bg-red-100 text-status-error-foreground" },
  archived: { label: "مؤرشف", color: "bg-gray-100 text-gray-500" },
};

const BASE = API_BASE;

function formatSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Arabic label for a document category (falls back to the raw value). */
function categoryLabel(value?: string): string {
  if (!value) return "غير مصنّف";
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/**
 * A document is "expired" when its retention date has passed. Derived purely
 * from data already on the row — when the API doesn't send `retentionUntil`
 * the badge simply never shows (no breakage, no dead UI).
 */
function isExpired(d: any): boolean {
  if (!d?.retentionUntil) return false;
  const t = new Date(d.retentionUntil).getTime();
  return Number.isFinite(t) && t < Date.now();
}

interface EntityDocumentsProps {
  entityType: string;
  entityId: number | string;
  title?: string;
  /** Initial presentation: compact list (default) or a card grid. The user
   *  can switch at runtime via the toolbar toggle. */
  viewMode?: "list" | "grid";
}

export function EntityDocuments({ entityType, entityId, title = "المستندات المرتبطة", viewMode = "list" }: EntityDocumentsProps) {
  const { toast } = useToast();
  const [view, setView] = useState<"list" | "grid">(viewMode);
  const [grouped, setGrouped] = useState(false);
  const { data: docsResp, refetch } = useApiQuery<any>(
    ["entity-docs", entityType, String(entityId)],
    `/documents?entity=${entityType}&entityId=${entityId}`,
    !!entityId
  );
  const docs = asList(docsResp);

  // GET /print/archive/:entityType/:entityId — printed copies of this
  // entity (PDFs the engine rendered). Shown alongside user-uploaded
  // documents so the operator sees both in one place.
  const { data: printArchiveResp } = useApiQuery<{ items: any[] }>(
    ["entity-print-archive", entityType, String(entityId)],
    entityType && entityId
      ? `/print/archive/${entityType}/${entityId}`
      : null,
    !!(entityType && entityId),
  );
  const printArchive: any[] = printArchiveResp?.items ?? [];
  const [previewDoc, setPreviewDoc] = useState<PreviewableAttachment | null>(null);

  const handleDownload = async (docId: number, fileName: string) => {
    try {
      const res = await fetch(`${BASE}/api/documents/${docId}/download`, {
        credentials: "include",
        headers: { ...nativeAuthHeaders() },
      });
      if (res.status === 429) {
        throw new RateLimitError(notifyRateLimited(res));
      }
      if (!res.ok) throw new Error("فشل التنزيل");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "file";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      if (err instanceof RateLimitError) {
        // notifyRateLimited already showed the debounced rate-limit toast.
        return;
      }
      toast({ variant: "destructive", title: "فشل التنزيل", description: err.message });
    }
  };

  // Group documents by category, preserving first-seen order. Display-only.
  const docGroups: [string, any[]][] = (() => {
    const m = new Map<string, any[]>();
    for (const d of docs) {
      const k = String(d.category ?? "");
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    return Array.from(m.entries());
  })();

  const docBadges = (d: any) => {
    const st = STATUS_MAP[d.status] || STATUS_MAP.draft;
    const cat = CATEGORIES.find((c) => c.value === d.category);
    return (
      <>
        {cat && <Badge variant="outline" className="text-[10px]">{cat.label}</Badge>}
        <Badge className={cn("text-[10px]", st.color)}>{st.label}</Badge>
        {d.currentVersion > 1 && <Badge variant="secondary" className="text-[10px]">v{d.currentVersion}</Badge>}
        {isExpired(d) && <Badge className="text-[10px] bg-amber-100 text-amber-700">منتهي</Badge>}
      </>
    );
  };

  const docActions = (d: any) =>
    d.storageKey ? (
      <>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setPreviewDoc({
            id: d.id,
            title: d.title,
            fileName: d.fileName,
            mimeType: d.mimeType,
            fileSize: d.fileSize,
            category: d.category,
            uploadedAt: d.createdAt,
            uploaderName: d.uploaderName,
          })}
          title="معاينة"
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownload(d.id, d.fileName)} title="تنزيل">
          <Download className="h-3.5 w-3.5" />
        </Button>
      </>
    ) : null;

  const docListRow = (d: any) => (
    <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-surface-subtle transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded bg-status-info-surface flex items-center justify-center flex-shrink-0">
          <FileText className="h-4 w-4 text-status-info-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{d.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {d.fileName && <span className="text-xs text-muted-foreground truncate">{d.fileName}</span>}
            {d.fileSize && <span className="text-xs text-muted-foreground">({formatSize(d.fileSize)})</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {docBadges(d)}
        {docActions(d)}
      </div>
    </div>
  );

  const docGridCard = (d: any) => (
    <div key={d.id} className="flex flex-col gap-2 rounded-lg border p-3 hover:bg-surface-subtle transition-colors">
      <div className="flex items-start gap-2 min-w-0">
        <div className="w-8 h-8 rounded bg-status-info-surface flex items-center justify-center flex-shrink-0">
          <FileText className="h-4 w-4 text-status-info-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{d.title}</p>
          {d.fileName && <p className="text-xs text-muted-foreground truncate">{d.fileName}</p>}
          {d.fileSize ? <p className="text-[11px] text-muted-foreground">{formatSize(d.fileSize)}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{docBadges(d)}</div>
      <div className="flex items-center gap-1">{docActions(d)}</div>
    </div>
  );

  const renderDocItems = (items: any[]) =>
    view === "grid" ? (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="docs-grid">
        {items.map(docGridCard)}
      </div>
    ) : (
      <div className="space-y-2" data-testid="docs-list">
        {items.map(docListRow)}
      </div>
    );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            {title} ({docs.length})
          </CardTitle>
          <UploadEntityDocDialog entityType={entityType} entityId={entityId} onSuccess={refetch} />
        </div>
      </CardHeader>
      <CardContent>
        {docs.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">لا توجد مستندات مرتبطة</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-end gap-1">
              <Button
                variant={grouped ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                aria-pressed={grouped}
                onClick={() => setGrouped((g) => !g)}
                title="تجميع حسب النوع"
              >
                تجميع حسب النوع
              </Button>
              <Button
                variant={view === "list" ? "default" : "outline"}
                size="sm"
                className="h-7 w-7 p-0"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
                title="عرض قائمة"
              >
                <List className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={view === "grid" ? "default" : "outline"}
                size="sm"
                className="h-7 w-7 p-0"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
                title="عرض شبكي"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
            </div>
            {grouped
              ? docGroups.map(([catVal, items]) => (
                  <div key={catVal || "__none__"} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {categoryLabel(catVal)} ({items.length})
                    </p>
                    {renderDocItems(items)}
                  </div>
                ))
              : renderDocItems(docs)}
          </div>
        )}
        {printArchive.length > 0 && (
          <div className="mt-4 pt-3 border-t">
            <p className="text-xs font-semibold text-muted-foreground mb-2">نسخ مطبوعة محفوظة ({printArchive.length})</p>
            <div className="space-y-1">
              {printArchive.slice(0, 5).map((p: any) => (
                <div key={p.id ?? p.jobId} className="flex items-center justify-between p-2 rounded bg-surface-subtle text-xs">
                  <span className="font-mono">{p.format ?? p.templateName ?? "PDF"}</span>
                  <span className="text-muted-foreground">{p.createdAt ? formatDateAr(p.createdAt) : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <AttachmentPreview attachment={previewDoc} open={!!previewDoc} onOpenChange={(o) => !o && setPreviewDoc(null)} />
    </Card>
  );
}

// Render-only submit that watches the form's title + the side-state file
// so it stays disabled until both are present, and shows the "uploading"
// label while the mutation runs.
function UploadSubmitButton({ file, uploading }: { file: File | null; uploading: boolean }) {
  const { watch } = useFormContext<z.infer<typeof uploadDocSchema>>();
  const title = watch("title");
  return (
    <Button type="submit" disabled={!title || !file || uploading} className="w-full" rateLimitAware>
      {uploading ? "جاري الرفع..." : "رفع"}
    </Button>
  );
}

function UploadEntityDocDialog({ entityType, entityId, onSuccess }: { entityType: string; entityId: number | string; onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (values: z.infer<typeof uploadDocSchema>) => {
    if (!file) return;
    setUploading(true);
    try {
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { ...nativeAuthHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (urlRes.status === 429) {
        throw new RateLimitError(notifyRateLimited(urlRes));
      }
      if (!urlRes.ok) throw new Error("فشل الرفع");
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });

      await apiFetch("/documents/upload", {
        method: "POST",
        body: JSON.stringify({
          title: values.title,
          description: "",
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          category: values.category || null,
          storageKey: objectPath,
          entityLinks: [{ entityType, entityId: Number(entityId) }],
        }),
      });

      setOpen(false);
      setFile(null);
      onSuccess();
    } catch (err: any) {
      if (err instanceof RateLimitError) {
        // notifyRateLimited already showed the debounced rate-limit toast.
        return;
      }
      toast({ variant: "destructive", title: "فشل رفع المستند", description: err.message || "حدث خطأ" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Plus className="h-3.5 w-3.5" /> رفع مستند
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>رفع مستند</DialogTitle>
        </DialogHeader>
        <FormShell
          schema={uploadDocSchema}
          defaultValues={{ title: "", category: "" }}
          hideSubmit
          className="space-y-4"
          onSubmit={handleUpload}
        >
          <FormTextField name="title" label="العنوان" required />
          <FormSelectField
            name="category"
            label="التصنيف"
            placeholder="اختر التصنيف"
            options={CATEGORIES}
          />
          <div>
            <Label>الملف *</Label>
            <div
              onClick={() => inputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all text-sm",
                file ? "border-green-400 bg-status-success-surface" : "border-border hover:border-border"
              )}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileUp className="h-4 w-4 text-status-success-foreground" />
                  <span>{file.name}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-red-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-6 w-6 mx-auto mb-1 text-gray-300" />
                  <p className="text-muted-foreground">اختر الملف</p>
                </>
              )}
              <input ref={inputRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]); e.target.value = ""; }} />
            </div>
          </div>
          <UploadSubmitButton file={file} uploading={uploading} />
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}
