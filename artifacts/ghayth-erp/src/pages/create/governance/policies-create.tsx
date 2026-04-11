import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { DatePicker } from "@/components/ui/date-picker";

const DRAFT_KEY = "governance_policies_create";
const INITIAL = { title: "", category: "general", status: "draft", effectiveDate: "", expiryDate: "", description: "" };

export default function PoliciesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, string | Attachment[]>>("/governance/policies", "POST", [["governance-policies"]]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);

  const handleSubmit = async () => {
    if (!form.title) {
      toast({ variant: "destructive", title: "عنوان السياسة مطلوب" });
      return;
    }
    try {
      await createMut.mutateAsync({ ...form, ...(attachments.length > 0 ? { attachments } : {}) });
      clearDraft();
      toast({ title: "تم إضافة السياسة بنجاح" });
      setLocation("/governance/policies");
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة السياسة", description: err.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة سياسة جديدة" backPath="/governance/policies">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>عنوان السياسة</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="عنوان السياسة" /></div>
          <div>
            <Label>الفئة</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">عامة</SelectItem>
                <SelectItem value="hr">موارد بشرية</SelectItem>
                <SelectItem value="finance">مالية</SelectItem>
                <SelectItem value="it">تقنية معلومات</SelectItem>
                <SelectItem value="security">أمن وسلامة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الحالة</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="active">سارية</SelectItem>
                <SelectItem value="archived">مؤرشفة</SelectItem>
                <SelectItem value="under_review">قيد المراجعة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>تاريخ السريان</Label><div className="mt-1"><DatePicker value={form.effectiveDate} onChange={(v) => setForm((f) => ({ ...f, effectiveDate: v }))} /></div></div>
          <div><Label>تاريخ الانتهاء</Label><div className="mt-1"><DatePicker value={form.expiryDate} onChange={(v) => setForm((f) => ({ ...f, expiryDate: v }))} /></div></div>
        </div>
        <div><Label>محتوى السياسة</Label><Textarea className="mt-1 min-h-[120px]" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="نص السياسة..." /></div>
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات السياسة" />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/governance/policies")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
