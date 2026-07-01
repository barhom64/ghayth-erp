import { useState, useRef, useEffect } from "react";
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
import { FileText, Upload, Download, Plus, X, FileUp, Eye, List, LayoutGrid, ClipboardCheck, Printer, MessageCircle, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { AttachmentPreview, type PreviewableAttachment } from "./attachment-preview";
import { DecisionImpactPreview } from "./decision-impact";
import { EntityComments } from "./entity-comments";
import { computeDuplicateMarks, computeFileSha256, type DuplicateKind } from "@/lib/duplicate-detection";
import { buildBundleHtml, openBundlePrint, type BundleImage, type BundleOtherFile } from "@/lib/print-bundle";
import { renderDocument, decodeRenderResponse } from "@/lib/print-client";
import { formatDateAr } from "@/lib/formatters";

const uploadDocSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  category: z.string(),
});

type DocCategory = { value: string; label: string };

// القيم تطابق تعداد DOCUMENT_CATEGORIES الخلفي (وعليه تُحسب فترة الحفظ) — وإلا يُرفض
// الرفع (Invalid enum). official/financial/other لم تكن ضمنه فكان الرفع بها يفشل؛
// صُحّحت (التسميات العربية كما هي).
const CATEGORIES: DocCategory[] = [
  { value: "contracts", label: "عقود" },
  { value: "compliance", label: "وثائق رسمية" },
  { value: "finance", label: "مالية" },
  { value: "hr", label: "موارد بشرية" },
  { value: "legal", label: "قانونية" },
  { value: "general", label: "أخرى" },
];

/**
 * تصنيفات مرفقات الأملاك — مشتركة مع صفحات العقود والوحدات. تُمرَّر عبر prop
 * `categories` فلا تغيّر التصنيفات الافتراضية لباقي الاستخدامات.
 */
export const PROPERTY_ATTACHMENT_CATEGORIES: DocCategory[] = [
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
];

/**
 * تصنيفات مرفقات العمرة — موحَّدة مع صفحات تفاصيل العمرة (المعتمر/الوكيل/الوكيل
 * الفرعي/الموسم). تُمرَّر عبر prop `categories` فلا تؤثر على التصنيفات الافتراضية
 * لباقي الاستخدامات.
 */
export const UMRAH_ATTACHMENT_CATEGORIES: DocCategory[] = [
  { value: "passport",         label: "جواز سفر" },
  { value: "visa",             label: "تأشيرة" },
  { value: "contract",         label: "عقد" },
  { value: "nusk_file",        label: "ملف نسك" },
  { value: "identity",         label: "هوية / إقامة" },
  { value: "transfer_receipt", label: "إيصال تحويل" },
  { value: "other",            label: "أخرى" },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "bg-gray-100 text-gray-700" },
  active: { label: "نشط", color: "bg-blue-100 text-status-info-foreground" },
  approved: { label: "معتمد", color: "bg-green-100 text-status-success-foreground" },
  cancelled: { label: "ملغي", color: "bg-red-100 text-status-error-foreground" },
  archived: { label: "مؤرشف", color: "bg-gray-100 text-gray-500" },
};

// Per-link reviewer verdict (backend: document_entity_links.reviewStatus).
const REVIEW_STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: "لم يُراجَع", color: "bg-gray-100 text-gray-600" },
  accepted: { label: "مقبول", color: "bg-green-100 text-status-success-foreground" },
  rejected: { label: "مرفوض", color: "bg-red-100 text-status-error-foreground" },
  needs_replacement: { label: "يحتاج استبدال", color: "bg-amber-100 text-amber-700" },
  duplicate: { label: "مكرر", color: "bg-purple-100 text-purple-700" },
};

// Verdicts a reviewer can pick. Reject / needs-replacement require a reason.
const REVIEW_VERDICTS = [
  { value: "accepted", label: "قبول" },
  { value: "needs_replacement", label: "يحتاج استبدال" },
  { value: "rejected", label: "رفض" },
  { value: "duplicate", label: "مكرر" },
];
const REASON_REQUIRED = new Set(["rejected", "needs_replacement"]);

// What the review endpoint actually triggers per verdict (verdict stamp +
// notification event + audit trail) — shown as «الأثر المتوقع» before confirm.
const REVIEW_IMPACT: Record<string, string[]> = {
  accepted: ["اعتماد المرفق للكيان", "إشعار مقدم الطلب", "تسجيل القرار في سجل التدقيق"],
  rejected: ["رفض المرفق", "إشعار المقدم بسبب الرفض", "تسجيل القرار في سجل التدقيق"],
  needs_replacement: ["طلب استبدال المرفق", "إشعار المقدم بالمطلوب", "تسجيل القرار في سجل التدقيق"],
  duplicate: ["وسم المرفق كمكرر", "تسجيل القرار في سجل التدقيق"],
};

const BASE = API_BASE;

function formatSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Arabic label for a document category (falls back to the raw value). */
function categoryLabel(value?: string, cats: DocCategory[] = CATEGORIES): string {
  if (!value) return "غير مصنّف";
  return cats.find((c) => c.value === value)?.label ?? value;
}

/** Whether a document is an image (by mime, falling back to file extension). */
function isImageDoc(mime?: string, name?: string): boolean {
  if (mime?.startsWith("image/")) return true;
  return !!name && /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(name);
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
  /** Show reviewer verdict controls (قبول/رفض/استبدال/مكرر) on each attachment.
   *  The caller gates this (e.g. reviewer perspective); the server enforces the
   *  approver-role permission regardless. Default false. */
  canReview?: boolean;
  /** Category list used for labels + the upload picker. Defaults to the generic
   *  document categories — pass a domain set (e.g. PROPERTY_ATTACHMENT_CATEGORIES)
   *  to relabel without affecting other usages. */
  categories?: DocCategory[];
  /** Pre-selects this category in the upload dialog and is the category applied
   *  to one-click quick uploads. */
  defaultCategory?: string;
  /** Compact attachment mode: a one-click upload button (no dialog) plus inline
   *  image thumbnails in the grid. Off by default so existing usages are
   *  unchanged. */
  quickUpload?: boolean;
  /** Show a per-document delete action (ghost Trash2 → ConfirmDeleteDialog →
   *  DELETE /documents/:id, RBAC-gated on documents.delete + soft-delete). The
   *  caller gates visibility; the server enforces the permission regardless.
   *  Off by default so existing usages are unchanged. */
  canDelete?: boolean;
}

export function EntityDocuments({ entityType, entityId, title = "المستندات المرتبطة", viewMode = "list", canReview = false, categories, defaultCategory, quickUpload = false, canDelete = false }: EntityDocumentsProps) {
  const { toast } = useToast();
  const cats = categories ?? CATEGORIES;
  const [view, setView] = useState<"list" | "grid">(viewMode);
  const [grouped, setGrouped] = useState(false);
  const [reviewDoc, setReviewDoc] = useState<any | null>(null);
  const [commentsDoc, setCommentsDoc] = useState<any | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<any | null>(null);
  const [bundling, setBundling] = useState(false);
  const [quickUploading, setQuickUploading] = useState(false);
  const quickInputRef = useRef<HTMLInputElement>(null);
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

  // Required-documents checklist for this entity type (config). The completeness
  // is DERIVED (requirements ∩ loaded docs) — nothing is stored per entity.
  const { data: reqsResp, refetch: refetchReqs } = useApiQuery<any>(
    ["entity-doc-reqs", entityType],
    `/documents/requirements?entityType=${entityType}`,
    !!entityType,
  );
  const requirements = asList(reqsResp);

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

  // Fetch one document's bytes and return a data URL (for inline embedding).
  const fetchDataUrl = async (docId: number): Promise<string | null> => {
    try {
      const res = await fetch(`${BASE}/api/documents/${docId}/download`, {
        credentials: "include",
        headers: { ...nativeAuthHeaders() },
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  // «طباعة مجمّعة» — compose the record print + image attachments into one
  // browser-printed document. Reuses the HTML print pipeline (no server PDF).
  const handleBundlePrint = async () => {
    if (bundling) return;
    setBundling(true);
    try {
      const images: BundleImage[] = [];
      const others: BundleOtherFile[] = [];
      for (const d of docs) {
        if (!d.storageKey) continue;
        const name = d.title || d.fileName || `مستند #${d.id}`;
        if (typeof d.mimeType === "string" && d.mimeType.startsWith("image/")) {
          const dataUrl = await fetchDataUrl(d.id);
          if (dataUrl) images.push({ name, dataUrl });
          else others.push({ name });
        } else {
          others.push({ name });
        }
      }
      // Best-effort: render the entity's record print HTML; bundle still works
      // (attachments only) if the entity has no print profile.
      let recordHtml: string | null = null;
      try {
        const resp = await renderDocument({ entityType, entityId: Number(entityId), inline: false });
        recordHtml = decodeRenderResponse(resp);
      } catch {
        recordHtml = null;
      }
      if (!recordHtml && images.length === 0 && others.length === 0) {
        toast({ title: "لا يوجد ما يُطبع", description: "لا سجل قابل للطباعة ولا مرفقات." });
        return;
      }
      const opened = openBundlePrint(buildBundleHtml({ title, recordHtml, images, otherFiles: others }));
      if (!opened) {
        toast({ variant: "destructive", title: "تعذّر فتح نافذة الطباعة", description: "اسمح بالنوافذ المنبثقة ثم أعد المحاولة." });
      }
    } finally {
      setBundling(false);
    }
  };

  // One-click quick upload (quickUpload mode): same 3-step contract as the
  // dialog — request-url → PUT → /documents/upload — but auto-titles with the
  // file name and applies `defaultCategory`. Keeps the content-hash fingerprint.
  const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setQuickUploading(true);
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
      const putRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("فشل رفع الملف للتخزين");

      // Best-effort content fingerprint for exact-duplicate detection.
      const contentHash = await computeFileSha256(file);

      await apiFetch("/documents/upload", {
        method: "POST",
        body: JSON.stringify({
          title: file.name,
          description: "",
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          category: defaultCategory || null,
          storageKey: objectPath,
          ...(contentHash ? { contentHash } : {}),
          entityLinks: [{ entityType, entityId: Number(entityId) }],
        }),
      });

      toast({ title: "تم رفع المرفق بنجاح" });
      refetch();
    } catch (err: any) {
      if (err instanceof RateLimitError) {
        // notifyRateLimited already showed the debounced rate-limit toast.
        return;
      }
      toast({ variant: "destructive", title: "فشل رفع المستند", description: err?.message || "حدث خطأ" });
    } finally {
      setQuickUploading(false);
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

  // Two-tier duplicate detection (derived, no backend): exact = same content
  // hash (renamed-but-identical), likely = same name + size. Reviewer decides
  // the «مكرر» verdict; this only flags.
  const duplicateMarks: Map<number | string, DuplicateKind> = computeDuplicateMarks(docs);
  const DUP_BADGE: Record<DuplicateKind, { label: string; color: string }> = {
    exact: { label: "مكرر", color: "bg-red-100 text-status-error-foreground" },
    likely: { label: "مكرر محتمل", color: "bg-purple-100 text-purple-700" },
  };

  const docBadges = (d: any) => {
    const st = STATUS_MAP[d.status] || STATUS_MAP.draft;
    const cat = cats.find((c) => c.value === d.category);
    const rv = d.reviewStatus ? REVIEW_STATUS_MAP[d.reviewStatus] : null;
    // Show the verdict once a decision exists, or always to a reviewer.
    const showReview = rv && (d.reviewStatus !== "new" || canReview);
    const dup = duplicateMarks.get(d.id);
    return (
      <>
        {cat && <Badge variant="outline" className="text-[10px]">{cat.label}</Badge>}
        <Badge className={cn("text-[10px]", st.color)}>{st.label}</Badge>
        {d.currentVersion > 1 && <Badge variant="secondary" className="text-[10px]">v{d.currentVersion}</Badge>}
        {isExpired(d) && <Badge className="text-[10px] bg-amber-100 text-amber-700">منتهي</Badge>}
        {dup && <Badge className={cn("text-[10px]", DUP_BADGE[dup].color)}>{DUP_BADGE[dup].label}</Badge>}
        {showReview && <Badge className={cn("text-[10px]", rv!.color)}>{rv!.label}</Badge>}
      </>
    );
  };

  const docActions = (d: any) => (
    <>
      {d.storageKey && (
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
      )}
      {/* مرفقات العمرة المُرحَّلة قد تحمل رابطًا خارجيًا (fileUrl) بلا storageKey.
          مُقيَّد بوجود d.fileUrl فلا يظهر للاستخدامات العامة (fileUrl = null). */}
      {d.fileUrl && (
        <a
          href={d.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md p-0 text-status-info-foreground hover:bg-surface-subtle"
          title="فتح الرابط الخارجي"
          aria-label="فتح"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setCommentsDoc(d)} title="تعليقات المرفق">
        <MessageCircle className="h-3.5 w-3.5" />
      </Button>
      {canReview && (
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setReviewDoc(d)} title="مراجعة المرفق">
          <ClipboardCheck className="h-3.5 w-3.5" />
        </Button>
      )}
      {canDelete && (
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-status-error-foreground" onClick={() => setDeleteDoc(d)} title="حذف المرفق">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </>
  );

  /** Reviewer note shown under a row/card once a reviewer left one. */
  const docNote = (d: any) =>
    d.reviewNote ? (
      <p className="text-[11px] text-muted-foreground">
        <span className="font-medium">ملاحظة المراجع:</span> {d.reviewNote}
      </p>
    ) : null;

  const docListRow = (d: any) => (
    <div key={d.id} className="p-3 rounded-lg border hover:bg-surface-subtle transition-colors">
      <div className="flex items-center justify-between gap-2">
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
      {d.reviewNote && <div className="mt-1.5 ps-11">{docNote(d)}</div>}
    </div>
  );

  const docGridCard = (d: any) => (
    <div key={d.id} className="flex flex-col gap-2 rounded-lg border p-3 hover:bg-surface-subtle transition-colors">
      <div className="flex items-start gap-2 min-w-0">
        {quickUpload && d.storageKey && isImageDoc(d.mimeType, d.fileName) ? (
          // Inline thumbnail for image attachments (quickUpload mode only); falls
          // back to the FileText icon if the preview endpoint can't render it.
          <div className="w-8 h-8 rounded overflow-hidden bg-status-info-surface flex items-center justify-center flex-shrink-0">
            <img
              src={`/api/documents/${d.id}/preview`}
              alt={d.title || d.fileName || "صورة"}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
                (e.currentTarget.nextElementSibling as HTMLElement | null)?.classList.remove("hidden");
              }}
            />
            <FileText className="hidden h-4 w-4 text-status-info-foreground" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded bg-status-info-surface flex items-center justify-center flex-shrink-0">
            <FileText className="h-4 w-4 text-status-info-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{d.title}</p>
          {d.fileName && <p className="text-xs text-muted-foreground truncate">{d.fileName}</p>}
          {d.fileSize ? <p className="text-[11px] text-muted-foreground">{formatSize(d.fileSize)}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{docBadges(d)}</div>
      {docNote(d)}
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

  // Derive completeness: a requirement is satisfied when a linked document
  // matches its category (or any document, when the requirement is category-less).
  const requirementStatus = requirements.map((r: any) => ({
    ...r,
    present: r.docCategory
      ? docs.some((d: any) => d.category === r.docCategory)
      : docs.length > 0,
  }));
  const missingRequired = requirementStatus.filter((r: any) => r.required && !r.present);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            {title} ({docs.length})
          </CardTitle>
          {quickUpload ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={quickUploading}
                onClick={() => quickInputRef.current?.click()}
              >
                {quickUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {quickUploading ? "جاري الرفع..." : "رفع ملف"}
              </Button>
              <input
                ref={quickInputRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                onChange={handleQuickUpload}
              />
            </>
          ) : (
            <UploadEntityDocDialog entityType={entityType} entityId={entityId} onSuccess={refetch} cats={cats} defaultCategory={defaultCategory} />
          )}
        </div>
      </CardHeader>
      <CardContent>
        {(requirementStatus.length > 0 || canReview) && (
          <RequirementsCompletenessCard
            entityType={entityType}
            items={requirementStatus}
            missingCount={missingRequired.length}
            canManage={canReview}
            onChanged={refetchReqs}
            cats={cats}
          />
        )}
        {docs.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">لا توجد مستندات مرتبطة</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 me-auto"
                disabled={bundling}
                onClick={handleBundlePrint}
                title="طباعة السجل والمرفقات في ملف واحد"
              >
                <Printer className="h-3.5 w-3.5" />
                {bundling ? "جاري التجهيز..." : "طباعة مجمّعة"}
              </Button>
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
                      {categoryLabel(catVal, cats)} ({items.length})
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
      <ReviewVerdictDialog
        doc={reviewDoc}
        entityType={entityType}
        entityId={entityId}
        onClose={() => setReviewDoc(null)}
        onReviewed={() => { setReviewDoc(null); refetch(); }}
      />
      <Dialog open={!!commentsDoc} onOpenChange={(o) => !o && setCommentsDoc(null)}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعليقات المرفق{commentsDoc?.title ? ` — ${commentsDoc.title}` : ""}</DialogTitle>
          </DialogHeader>
          {commentsDoc && (
            <EntityComments entityType={entityType} entityId={entityId} documentId={commentsDoc.id} />
          )}
        </DialogContent>
      </Dialog>
      {canDelete && deleteDoc && (
        <ConfirmDeleteDialog
          open={!!deleteDoc}
          onOpenChange={(o) => { if (!o) setDeleteDoc(null); }}
          entity={{ type: "document", id: deleteDoc.id, name: deleteDoc.title || deleteDoc.fileName || `مستند #${deleteDoc.id}` }}
          deletePath={`/documents/${deleteDoc.id}`}
          invalidateKeys={[["entity-docs", entityType, String(entityId)]]}
          onDeleted={() => { setDeleteDoc(null); refetch(); }}
        />
      )}
    </Card>
  );
}

/**
 * «اكتمال المرفقات» — derived checklist of the documents an entity type is
 * expected to carry (config from /documents/requirements). Read-only for most;
 * admins (canManage) can add/deactivate requirements inline so the checklist is
 * configurable without a separate settings trip. Adds no per-entity storage.
 */
function RequirementsCompletenessCard({
  entityType, items, missingCount, canManage, onChanged, cats,
}: {
  entityType: string;
  items: any[];
  missingCount: number;
  canManage: boolean;
  onChanged: () => void;
  cats: DocCategory[];
}) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const complete = items.length > 0 && missingCount === 0;

  const addRequirement = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/documents/requirements`, {
        method: "POST",
        body: JSON.stringify({ entityType, label: label.trim(), docCategory: category || null }),
      });
      setLabel(""); setCategory(""); setAdding(false);
      onChanged();
    } catch (err: any) {
      if (!(err instanceof RateLimitError)) toast({ variant: "destructive", title: "تعذّر إضافة المتطلب", description: err?.message });
    } finally { setBusy(false); }
  };

  const removeRequirement = async (id: number) => {
    setBusy(true);
    try {
      await apiFetch(`/documents/requirements/${id}`, { method: "DELETE" });
      onChanged();
    } catch (err: any) {
      if (!(err instanceof RateLimitError)) toast({ variant: "destructive", title: "تعذّر حذف المتطلب", description: err?.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="mb-3 rounded-lg border p-3" data-testid="requirements-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          اكتمال المرفقات
          {items.length > 0 && (
            <Badge className={cn("ms-2 text-[10px]", complete ? "bg-green-100 text-status-success-foreground" : "bg-amber-100 text-amber-700")}>
              {complete ? "مكتمل" : `ناقص (${missingCount})`}
            </Badge>
          )}
        </p>
        {canManage && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setAdding((a) => !a)}>
            <Plus className="h-3.5 w-3.5" /> إضافة متطلب
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">لا متطلبات معرّفة لهذا النوع بعد.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5">
                {r.present ? (
                  <Badge className="text-[10px] bg-green-100 text-status-success-foreground">متوفر</Badge>
                ) : r.required ? (
                  <Badge className="text-[10px] bg-red-100 text-status-error-foreground">ناقص</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">اختياري</Badge>
                )}
                <span>{r.label}</span>
                {r.docCategory && <span className="text-muted-foreground">({categoryLabel(r.docCategory, cats)})</span>}
              </span>
              {canManage && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={busy} onClick={() => removeRequirement(r.id)} title="حذف المتطلب">
                  <X className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && adding && (
        <div className="mt-2 flex flex-wrap items-end gap-2 border-t pt-2">
          <div className="flex-1 min-w-[140px]">
            <Label className="text-[11px]">اسم المتطلب</Label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="مثال: صورة الهوية"
              className="mt-1 w-full rounded-md border px-2 py-1 text-xs"
            />
          </div>
          <div className="min-w-[120px]">
            <Label className="text-[11px]">التصنيف (اختياري)</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-md border px-2 py-1 text-xs"
            >
              <option value="">أي تصنيف</option>
              {cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <Button size="sm" className="h-7 text-xs" disabled={busy || !label.trim()} onClick={addRequirement} rateLimitAware>
            حفظ
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Captures a reviewer's verdict on one attachment and PATCHes the per-link
 * review endpoint. Reject / needs-replacement require a reason (enforced both
 * here and server-side). Adds no approval engine — it records the decision.
 */
function ReviewVerdictDialog({
  doc, entityType, entityId, onClose, onReviewed,
}: {
  doc: any | null;
  entityType: string;
  entityId: number | string;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const { toast } = useToast();
  const [verdict, setVerdict] = useState<string>("accepted");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset the form whenever a different document opens.
  const docId = doc?.id ?? null;
  useEffect(() => {
    setVerdict(doc?.reviewStatus && doc.reviewStatus !== "new" ? doc.reviewStatus : "accepted");
    setNote(doc?.reviewNote ?? "");
  }, [docId]);

  const reasonRequired = REASON_REQUIRED.has(verdict);
  const canSubmit = !saving && !(reasonRequired && !note.trim());

  const submit = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      await apiFetch(`/documents/${doc.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ entityType, entityId: Number(entityId), reviewStatus: verdict, reviewNote: note.trim() || undefined }),
      });
      toast({ title: "تم تسجيل المراجعة", description: REVIEW_STATUS_MAP[verdict]?.label });
      onReviewed();
    } catch (err: any) {
      if (err instanceof RateLimitError) return;
      toast({ variant: "destructive", title: "تعذّر تسجيل المراجعة", description: err?.message || "حدث خطأ" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>مراجعة المرفق{doc?.title ? ` — ${doc.title}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">القرار</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {REVIEW_VERDICTS.map((v) => (
                <Button
                  key={v.value}
                  type="button"
                  variant={verdict === v.value ? "default" : "outline"}
                  size="sm"
                  aria-pressed={verdict === v.value}
                  onClick={() => setVerdict(v.value)}
                >
                  {v.label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-sm">
              السبب{reasonRequired && <span className="text-red-500 ms-1">*</span>}
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={reasonRequired ? "سبب الرفض أو الاستبدال (إلزامي)" : "ملاحظة للمقدم (اختياري)"}
              className="mt-1.5"
            />
          </div>
          <DecisionImpactPreview
            title="عند حفظ المراجعة سيتم:"
            effects={(REVIEW_IMPACT[verdict] ?? []).map((label) => ({ label }))}
          />
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>إلغاء</Button>
            <Button type="button" size="sm" onClick={submit} disabled={!canSubmit} rateLimitAware>
              {saving ? "جاري الحفظ..." : "حفظ المراجعة"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

function UploadEntityDocDialog({ entityType, entityId, onSuccess, cats = CATEGORIES, defaultCategory }: { entityType: string; entityId: number | string; onSuccess: () => void; cats?: DocCategory[]; defaultCategory?: string }) {
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

      // Best-effort content fingerprint for exact-duplicate detection.
      const contentHash = await computeFileSha256(file);

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
          ...(contentHash ? { contentHash } : {}),
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
          defaultValues={{ title: "", category: defaultCategory ?? "" }}
          hideSubmit
          className="space-y-4"
          onSubmit={handleUpload}
        >
          <FormTextField name="title" label="العنوان" required />
          <FormSelectField
            name="category"
            label="التصنيف"
            placeholder="اختر التصنيف"
            options={cats}
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
