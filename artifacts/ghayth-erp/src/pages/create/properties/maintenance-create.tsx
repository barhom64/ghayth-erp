import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Autocomplete } from "@/components/ui/autocomplete";

export default function PropertyMaintenanceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/properties/maintenance-requests", "POST", [["maintenance-requests"]]);
  const { data: unitsData } = useApiQuery<{ data: any[] }>(["property-units"], "/properties/units");
  const units = unitsData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("property_maintenance_create", {
    unitId: "", category: "", description: "", priority: "medium",
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const handleSubmit = async () => {
    if (!form.unitId) {
      toast({ variant: "destructive", title: "يرجى اختيار الوحدة" });
      return;
    }
    if (!form.description) {
      toast({ variant: "destructive", title: "وصف الطلب مطلوب" });
      return;
    }
    try {
      await createMut.mutateAsync({
        unitId: Number(form.unitId),
        category: form.category || undefined,
        description: form.description,
        priority: form.priority,
      });
      clearDraft();
      toast({ title: "تم إنشاء طلب الصيانة بنجاح" });
      setLocation("/properties");
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الطلب" });
    }
  };

  return (
    <CreatePageLayout title="طلب صيانة جديد" backPath="/properties">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <button onClick={clearDraft} className="underline text-amber-600 hover:text-amber-800">تجاهل</button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>الوحدة</Label>
          <Autocomplete
            className="mt-1"
            placeholder="ابحث عن الوحدة..."
            value={form.unitId}
            onChange={(v) => setForm((f) => ({ ...f, unitId: String(v) }))}
            options={units.map((u: any) => ({ value: String(u.id), label: `${u.unitNumber} - ${u.buildingName || ""}` }))}
          />
        </div>
        <div>
          <Label>الفئة</Label>
          <Select value={form.category || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, category: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر الفئة</SelectItem>
              <SelectItem value="plumbing">سباكة</SelectItem>
              <SelectItem value="electrical">كهرباء</SelectItem>
              <SelectItem value="hvac">تكييف</SelectItem>
              <SelectItem value="general">عامة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>الأولوية</Label>
          <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">منخفضة</SelectItem>
              <SelectItem value="medium">متوسطة</SelectItem>
              <SelectItem value="high">عالية</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2"><Label>الوصف</Label><Textarea className="mt-1" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} /></div>
      </div>
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <p className="font-semibold mb-1">العمليات المالية المرتبطة:</p>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li>عند إكمال الصيانة: سيتم إنشاء قيد محاسبي تلقائي (مدين مصروف صيانة عقار / دائن النقدية)</li>
          <li>إنشاء فاتورة تلقائية مرتبطة بطلب الصيانة</li>
          <li>إنشاء مهمة متابعة رضا المستأجر</li>
        </ul>
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/properties")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الإرسال..." : "إرسال الطلب"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
