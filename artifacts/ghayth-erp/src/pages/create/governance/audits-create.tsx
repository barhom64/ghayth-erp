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

const DRAFT_KEY = "governance_audits_create";
const INITIAL = { title: "", status: "planned", auditorName: "", startDate: "", endDate: "", scope: "", findings: "" };

export default function AuditsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, string | Attachment[]>>("/governance/audits", "POST", [["governance-audits"]]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);

  const handleSubmit = async () => {
    if (!form.title) {
      toast({ variant: "destructive", title: "يرجى إدخال عنوان التدقيق" });
      return;
    }
    try {
      await createMut.mutateAsync({ ...form, ...(attachments.length > 0 ? { attachments } : {}) });
      clearDraft();
      toast({ title: "تم إنشاء التدقيق بنجاح" });
      setLocation("/governance/audits");
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء التدقيق", description: err.message });
    }
  };

  return (
    <CreatePageLayout title="تدقيق جديد" backPath="/governance/audits">
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
          <div><Label>عنوان التدقيق</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="عنوان التدقيق" /></div>
          <div>
            <Label>الحالة</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">مخطط</SelectItem>
                <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                <SelectItem value="completed">مكتمل</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>المدقق</Label><Input className="mt-1" value={form.auditorName} onChange={(e) => setForm((f) => ({ ...f, auditorName: e.target.value }))} placeholder="اسم المدقق" /></div>
          <div><Label>تاريخ البدء</Label><div className="mt-1"><DatePicker value={form.startDate} onChange={(v) => setForm((f) => ({ ...f, startDate: v }))} /></div></div>
          <div><Label>تاريخ الانتهاء</Label><div className="mt-1"><DatePicker value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} /></div></div>
        </div>
        <div><Label>نطاق التدقيق</Label><Textarea className="mt-1" value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} placeholder="نطاق وأهداف التدقيق..." /></div>
        <div><Label>النتائج</Label><Textarea className="mt-1" value={form.findings} onChange={(e) => setForm((f) => ({ ...f, findings: e.target.value }))} placeholder="نتائج التدقيق..." /></div>
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات التدقيق" />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/governance/audits")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
