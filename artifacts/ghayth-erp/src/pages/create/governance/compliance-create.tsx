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

const DRAFT_KEY = "governance_compliance_create";
const INITIAL = { regulation: "", responsiblePerson: "", status: "compliant", dueDate: "", description: "", notes: "" };

export default function ComplianceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const createMut = useApiMutation<unknown, Record<string, string | undefined>>("/governance/compliance", "POST", [["governance-compliance"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);

  const handleSubmit = async () => {
    if (!form.regulation) {
      toast({ variant: "destructive", title: "يرجى إدخال اسم اللائحة أو البند" });
      return;
    }
    try {
      await createMut.mutateAsync({ ...form });
      clearDraft();
      toast({ title: "تم تسجيل بند الامتثال بنجاح" });
      setLocation("/governance/compliance");
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء تسجيل بند الامتثال", description: err.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة بند امتثال" backPath="/governance/compliance">
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
          <div><Label>اللائحة / البند</Label><Input className="mt-1" value={form.regulation} onChange={(e) => setForm((f) => ({ ...f, regulation: e.target.value }))} placeholder="اسم اللائحة أو البند" /></div>
          <div><Label>المسؤول</Label><Input className="mt-1" value={form.responsiblePerson} onChange={(e) => setForm((f) => ({ ...f, responsiblePerson: e.target.value }))} placeholder="المسؤول عن الامتثال" /></div>
          <div>
            <Label>الحالة</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compliant">ممتثل</SelectItem>
                <SelectItem value="non_compliant">غير ممتثل</SelectItem>
                <SelectItem value="in_progress">قيد المعالجة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>تاريخ الاستحقاق</Label><div className="mt-1"><DatePicker value={form.dueDate} onChange={(v) => setForm((f) => ({ ...f, dueDate: v }))} /></div></div>
        </div>
        <div><Label>الوصف</Label><Textarea className="mt-1" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="وصف بند الامتثال..." /></div>
        <div><Label>ملاحظات</Label><Textarea className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات إضافية..." /></div>
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/governance/compliance")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending ? "جاري التسجيل..." : "تسجيل"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
