import { useState, useRef, useCallback } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Upload, FileText, Save } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = "";

function formatSize(bytes: number) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function VersionUploadPage() {
  const [, params] = useRoute("/documents/:docId/versions") as [boolean, { docId: string }];
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const docId = params?.docId;

  const { data: versionsResp, refetch } = useApiQuery<any>(
    ["doc-versions", docId],
    docId ? `/documents/${docId}/versions` : null,
    { enabled: !!docId }
  );
  const versions = asList(versionsResp);

  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUploadVersion = useCallback(async () => {
    if (!file || !docId) return;
    setUploading(true);
    try {
      const token = localStorage.getItem("erp_token");
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
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
          notes,
        }),
      });

      toast({ title: "تم رفع الإصدار بنجاح" });
      setFile(null);
      setNotes("");
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message || "حدث خطأ" });
    } finally {
      setUploading(false);
    }
  }, [file, notes, docId, refetch, toast]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/documents">
          <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">إصدارات المستند</h1>
          <p className="text-gray-500 text-sm mt-1">عرض ورفع إصدارات جديدة</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5 text-blue-500" /> رفع إصدار جديد
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onClick={() => inputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all",
              file ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-gray-300"
            )}
          >
            {file ? (
              <span className="text-green-700 font-medium">{file.name} ({formatSize(file.size)})</span>
            ) : (
              <div className="space-y-2">
                <Upload className="h-8 w-8 mx-auto text-gray-400" />
                <span className="text-gray-400">اضغط لاختيار الملف</span>
              </div>
            )}
            <input ref={inputRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]); e.target.value = ""; }} />
          </div>
          <div>
            <Label>ملاحظات (اختياري)</Label>
            <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="وصف التغييرات في هذا الإصدار" />
          </div>
          <Button onClick={handleUploadVersion} disabled={!file || uploading} className="gap-2">
            <Save className="h-4 w-4" /> {uploading ? "جاري الرفع..." : "رفع الإصدار"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-gray-500" /> الإصدارات السابقة
          </CardTitle>
        </CardHeader>
        <CardContent>
          {versions.length > 0 ? (
            <div className="space-y-3">
              {versions.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">v{v.versionNumber}</Badge>
                      <span className="text-sm font-medium">{v.fileName}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{formatSize(v.fileSize)} — {v.createdAt ? formatDateAr(v.createdAt) : ""}</p>
                    {v.notes && <p className="text-xs text-gray-400 mt-0.5">{v.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-400 py-6">لا توجد إصدارات سابقة</p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Link href="/documents">
          <Button variant="outline">العودة للمستندات</Button>
        </Link>
      </div>
    </div>
  );
}
