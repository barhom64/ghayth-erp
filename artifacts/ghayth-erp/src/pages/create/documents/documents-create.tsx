import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

export default function DocumentsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("documents_create", {
    title: "", category: "", status: "draft", description: "",
  });
  const createMut = useApiMutation<unknown, Record<string, string | Attachment[] | undefined>>("/documents", "POST", [["documents"]]);

  const handleSubmit = () => {
    if (!form.title) {
      toast({ variant: "destructive", title: "يرجى إدخال عنوان المستند" });
      return;
    }
    createMut.mutate({
      title: form.title,
      category: form.category || undefined,
      status: form.status,
      description: form.description || undefined,
      ...(attachments.length > 0 ? { attachments } : {}),
    }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إضافة المستند بنجاح" }); setLocation("/documents"); },
      onError: (err) => toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المستند", description: err.message }),
    });
  };

  return (
    <CreatePageLayout title="إضافة مستند جديد" backPath="/documents">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <button onClick={clearDraft} className="underline text-amber-600 hover:text-amber-800">تجاهل</button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>عنوان المستند <span className="text-red-500">*</span></Label><Input className="mt-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="عنوان المستند" /></div>
          <div>
            <Label>التصنيف</Label>
            <Select value={form.category || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, category: v === "_none" ? "" : v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="بدون تصنيف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">بدون تصنيف</SelectItem>
                <SelectItem value="contract">عقد</SelectItem>
                <SelectItem value="report">تقرير</SelectItem>
                <SelectItem value="policy">سياسة</SelectItem>
                <SelectItem value="template">قالب</SelectItem>
                <SelectItem value="invoice">فاتورة</SelectItem>
                <SelectItem value="hr">موارد بشرية</SelectItem>
                <SelectItem value="legal">قانوني</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الحالة</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="archived">مؤرشف</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>الوصف</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="وصف المستند..." /></div>
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="رفع الملفات" />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/documents")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
