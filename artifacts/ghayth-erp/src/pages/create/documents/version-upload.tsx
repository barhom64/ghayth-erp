import { useState, useRef } from "react";
import { z } from "zod";
import { useFormContext } from "react-hook-form";
import { useRoute } from "wouter";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { notifyRateLimited, RateLimitError } from "@/lib/rate-limit-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Save } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CreatePageLayout, FormShell, FormTextField } from "@workspace/ui-core";

const BASE = "";

function formatSize(bytes: number) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const uploadSchema = z.object({
  notes: z.string(),
});
type UploadForm = z.infer<typeof uploadSchema>;

function UploadSubmitButton({ file }: { file: File | null }) {
  const { formState } = useFormContext<UploadForm>();
  return (
    <Button type="submit" disabled={!file || formState.isSubmitting} className="gap-2" rateLimitAware>
      <Save className="h-4 w-4" /> {formState.isSubmitting ? "جاري الرفع..." : "رفع الإصدار"}
    </Button>
  );
}

export default function VersionUploadPage() {
  const [, params] = useRoute("/documents/:docId/versions") as [boolean, { docId: string }];
  const { toast } = useToast();
  const docId = params?.docId;

  const { data: versionsResp, isLoading, isError, refetch } = useApiQuery<any>(
    ["doc-versions", docId],
    docId ? `/documents/${docId}/versions` : null,
    { enabled: !!docId }
  );
  const versions = asList(versionsResp);

  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <CreatePageLayout
      title="إصدارات المستند"
      subtitle="عرض ورفع إصدارات جديدة"
      backPath="/documents"
    >
      <div className="space-y-6">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold mb-3">
            <Upload className="h-5 w-5 text-status-info" /> رفع إصدار جديد
          </h3>
          <FormShell
            schema={uploadSchema}
            defaultValues={{ notes: "" }}
            hideSubmit
            onSubmit={async (values, ctx) => {
              if (!file) {
                toast({ variant: "destructive", title: "يرجى اختيار ملف للرفع" });
                throw new Error("missing-file");
              }
              if (!docId) return;
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
                const putRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
                if (!putRes.ok) throw new Error("فشل في رفع الملف");

                await apiFetch(`/documents/${docId}/versions`, {
                  method: "POST",
                  body: JSON.stringify({
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type,
                    storageKey: objectPath,
                    notes: values.notes,
                  }),
                });

                toast({ title: "تم رفع الإصدار بنجاح" });
                setFile(null);
                ctx.reset();
                refetch();
              } catch (err: any) {
                if (err instanceof RateLimitError) {
                  // notifyRateLimited already showed the debounced rate-limit toast.
                  return;
                }
                toast({ variant: "destructive", title: err.message || "حدث خطأ" });
                throw err;
              }
            }}
          >
            <div
              onClick={() => inputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all",
                file ? "border-green-400 bg-status-success-surface" : "border-border hover:border-border"
              )}
            >
              {file ? (
                <span className="text-status-success-foreground font-medium">{file.name} ({formatSize(file.size)})</span>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <span className="text-muted-foreground">اضغط لاختيار الملف</span>
                </div>
              )}
              <input ref={inputRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]); e.target.value = ""; }} />
            </div>
            <FormTextField name="notes" label="ملاحظات (اختياري)" placeholder="وصف التغييرات في هذا الإصدار" />
            <UploadSubmitButton file={file} />
          </FormShell>
        </div>

        <div className="border-t pt-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold mb-3">
            <FileText className="h-5 w-5 text-muted-foreground" /> الإصدارات السابقة
          </h3>
          {versions.length > 0 ? (
            <div className="space-y-3">
              {versions.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">v{v.versionNumber}</Badge>
                      <span className="text-sm font-medium">{v.fileName}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{formatSize(v.fileSize)} — {v.createdAt ? formatDateAr(v.createdAt) : ""}</p>
                    {v.notes && <p className="text-xs text-muted-foreground mt-0.5">{v.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-6">لا توجد إصدارات سابقة</p>
          )}
        </div>
      </div>
    </CreatePageLayout>
  );
}
