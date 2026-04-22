import { useState, useRef, useCallback } from "react";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload, Download, Plus, X, FileUp, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachmentPreview, type PreviewableAttachment } from "./attachment-preview";

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
  approved: { label: "معتمد", color: "bg-green-100 text-green-700" },
  cancelled: { label: "ملغي", color: "bg-red-100 text-red-700" },
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface EntityDocumentsProps {
  entityType: string;
  entityId: number | string;
  title?: string;
}

export function EntityDocuments({ entityType, entityId, title = "المستندات المرتبطة" }: EntityDocumentsProps) {
  const { data: docsResp, refetch } = useApiQuery<any>(
    ["entity-docs", entityType, String(entityId)],
    `/documents?entity=${entityType}&entityId=${entityId}`,
    !!entityId
  );
  const docs = asList(docsResp);
  const [previewDoc, setPreviewDoc] = useState<PreviewableAttachment | null>(null);

  const handleDownload = async (docId: number, fileName: string) => {
    try {
      const token = localStorage.getItem("erp_token");
      const res = await fetch(`${BASE}/api/documents/${docId}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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
      alert(err.message);
    }
  };

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
          <div className="space-y-2">
            {docs.map((d: any) => {
              const st = STATUS_MAP[d.status] || STATUS_MAP.draft;
              const cat = CATEGORIES.find(c => c.value === d.category);
              return (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{d.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {d.fileName && <span className="text-xs text-gray-400">{d.fileName}</span>}
                        {d.fileSize && <span className="text-xs text-gray-400">({formatSize(d.fileSize)})</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {cat && <Badge variant="outline" className="text-[10px]">{cat.label}</Badge>}
                    <Badge className={cn("text-[10px]", st.color)}>{st.label}</Badge>
                    {d.currentVersion > 1 && <Badge variant="secondary" className="text-[10px]">v{d.currentVersion}</Badge>}
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <AttachmentPreview attachment={previewDoc} open={!!previewDoc} onOpenChange={(o) => !o && setPreviewDoc(null)} />
    </Card>
  );
}

function UploadEntityDocDialog({ entityType, entityId, onSuccess }: { entityType: string; entityId: number | string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ title: "", description: "", category: "" });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async () => {
    if (!file || !form.title) return;
    setUploading(true);
    try {
      const token = localStorage.getItem("erp_token");
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("فشل الرفع");
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });

      await apiFetch("/documents/upload", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          category: form.category || null,
          storageKey: objectPath,
          entityLinks: [{ entityType, entityId: Number(entityId) }],
        }),
      });

      setOpen(false);
      setFile(null);
      setForm({ title: "", description: "", category: "" });
      onSuccess();
    } catch (err: any) {
      alert(err.message || "حدث خطأ");
    } finally {
      setUploading(false);
    }
  }, [file, form, entityType, entityId, onSuccess]);

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
        <div className="space-y-4">
          <div>
            <Label>العنوان *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label>التصنيف</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الملف *</Label>
            <div
              onClick={() => inputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all text-sm",
                file ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-gray-300"
              )}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileUp className="h-4 w-4 text-green-600" />
                  <span>{file.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-red-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-6 w-6 mx-auto mb-1 text-gray-300" />
                  <p className="text-gray-500">اختر الملف</p>
                </>
              )}
              <input ref={inputRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]); e.target.value = ""; }} />
            </div>
          </div>
          <Button onClick={handleUpload} disabled={!form.title || !file || uploading} className="w-full">
            {uploading ? "جاري الرفع..." : "رفع"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
