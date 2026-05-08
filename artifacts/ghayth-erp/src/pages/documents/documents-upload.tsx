import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { notifyRateLimited, RateLimitError } from "@/lib/rate-limit-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { X, Upload, FileUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CATEGORIES = [
  { value: "contracts", label: "عقود" },
  { value: "official", label: "وثائق رسمية" },
  { value: "financial", label: "مالية" },
  { value: "hr", label: "موارد بشرية" },
  { value: "legal", label: "قانونية" },
  { value: "other", label: "أخرى" },
];

const ENTITY_TYPES = [
  { value: "employee", label: "موظف" },
  { value: "client", label: "عميل" },
  { value: "project", label: "مشروع" },
  { value: "invoice", label: "فاتورة" },
  { value: "vehicle", label: "مركبة" },
];

function formatSize(bytes: number) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsUpload() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ title: "", description: "", category: "" });
  const [entityLinks, setEntityLinks] = useState<{ entityType: string; entityId: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const addEntityLink = () => setEntityLinks([...entityLinks, { entityType: "", entityId: "" }]);
  const removeEntityLink = (idx: number) => setEntityLinks(entityLinks.filter((_, i) => i !== idx));
  const updateEntityLink = (idx: number, field: keyof { entityType: string; entityId: string }, value: string) => {
    setEntityLinks(prev => prev.map((link, i) => i === idx ? { ...link, [field]: value } : link));
  };

  const handleUpload = useCallback(async () => {
    if (!file || !form.title) {
      toast({ variant: "destructive", title: "يرجى إدخال عنوان الملف واختيار ملف" });
      return;
    }
    setUploading(true);
    try {
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (urlRes.status === 429) {
        throw new RateLimitError(notifyRateLimited(urlRes));
      }
      if (!urlRes.ok) throw new Error("فشل في الحصول على رابط الرفع");
      const { uploadURL, objectPath } = await urlRes.json();

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("فشل في رفع الملف");

      const validLinks = entityLinks
        .filter(l => l.entityType && l.entityId)
        .map(l => ({ entityType: l.entityType, entityId: Number(l.entityId) }));

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
          entityLinks: validLinks.length > 0 ? validLinks : undefined,
        }),
      });

      toast({ title: "تم رفع المستند بنجاح" });
      setLocation("/documents");
    } catch (err: any) {
      if (err instanceof RateLimitError) {
        // notifyRateLimited already showed the debounced rate-limit toast.
        setUploading(false);
        return;
      }
      toast({ variant: "destructive", title: "خطأ أثناء الرفع", description: err.message || "حدث خطأ" });
    } finally {
      setUploading(false);
    }
  }, [file, form, entityLinks, setLocation, toast]);

  return (
    <CreatePageLayout title="رفع مستند جديد" backPath="/documents">
      <div className="space-y-4">
        <div>
          <Label>العنوان <span className="text-red-500">*</span></Label>
          <Input
            className="mt-1"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="اسم المستند"
          />
        </div>

        <div>
          <Label>الوصف</Label>
          <Input
            className="mt-1"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="وصف المستند"
          />
        </div>

        <div>
          <Label>التصنيف</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>ربط بكيان</Label>
            <Button type="button" variant="ghost" size="sm" onClick={addEntityLink} className="text-xs gap-1 h-7">
              <Plus className="h-3 w-3" /> إضافة ربط
            </Button>
          </div>
          {entityLinks.map((link, idx) => (
            <div key={idx} className="flex gap-2 mb-2 items-center">
              <Select value={link.entityType} onValueChange={(v) => updateEntityLink(idx, "entityType", v)}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="نوع الكيان" /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="flex-1"
                placeholder="رقم المعرّف"
                value={link.entityId}
                onChange={(e) => updateEntityLink(idx, "entityId", e.target.value)}
              />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeEntityLink(idx)}>
                <X className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>

        <div>
          <Label>الملف <span className="text-red-500">*</span></Label>
          <div
            onClick={() => inputRef.current?.click()}
            className={cn(
              "mt-1 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
              file ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            )}
          >
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileUp className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium">{file.name}</span>
                <span className="text-xs text-gray-400">({formatSize(file.size)})</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="text-red-400 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-500">انقر لاختيار الملف أو اسحبه هنا</p>
                <p className="text-xs text-gray-400 mt-1">الحد الأقصى 10 ميجابايت</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) setFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/documents")}>إلغاء</Button>
          <Button onClick={handleUpload} disabled={!form.title || !file || uploading} rateLimitAware>
            {uploading ? "جاري الرفع..." : "رفع المستند"}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
