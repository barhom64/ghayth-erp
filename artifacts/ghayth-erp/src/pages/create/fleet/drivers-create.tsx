import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";

const DRAFT_KEY = "fleet_drivers_create";
const INITIAL = { name: "", phone: "", licenseNumber: "", licenseExpiry: "", licenseType: "", employeeId: "", status: "available" };

export default function DriversCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/drivers", "POST", [["drivers"]]);
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const employees = employeesData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const handleEmployeeSelect = (empId: string) => {
    const emp = employees.find((e: any) => String(e.id) === empId);
    if (emp) {
      setForm((f) => ({ ...f, employeeId: empId, name: emp.name || f.name, phone: emp.phone || f.phone }));
    } else {
      setForm((f) => ({ ...f, employeeId: empId }));
    }
  };

  const handleSubmit = async () => {
    if (!form.name) {
      toast({ variant: "destructive", title: "اسم السائق مطلوب" });
      return;
    }
    try {
      await createMut.mutateAsync({
        ...form,
        employeeId: form.employeeId ? Number(form.employeeId) : undefined,
      });
      clearDraft();
      toast({ title: "تم إضافة السائق بنجاح" });
      setLocation("/fleet/drivers");
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة السائق", description: err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة سائق جديد" backPath="/fleet/drivers">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>ربط بموظف</Label>
          <Select value={form.employeeId || "_none"} onValueChange={(v) => handleEmployeeSelect(v === "_none" ? "" : v)}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="— اختر موظف أو أدخل يدوياً —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— اختر موظف أو أدخل يدوياً —</SelectItem>
              {employees.map((emp: any) => (
                <SelectItem key={emp.id} value={String(emp.id)}>{emp.name} - {emp.jobTitle || emp.department || ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.employeeId && (
            <div className="mt-3">
              <EmployeeContextCard employeeId={form.employeeId} />
            </div>
          )}
        </div>
        <div><Label>الاسم <span className="text-red-500">*</span></Label><Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
        <div><Label>الهاتف</Label><Input className="mt-1" dir="ltr" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
        <div><Label>رقم الرخصة</Label><Input className="mt-1" value={form.licenseNumber} onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value }))} /></div>
        <div>
          <Label>نوع الرخصة</Label>
          <Select value={form.licenseType || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, licenseType: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="اختر النوع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر النوع</SelectItem>
              <SelectItem value="private">خاصة</SelectItem>
              <SelectItem value="public">عامة</SelectItem>
              <SelectItem value="heavy">ثقيلة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>انتهاء الرخصة</Label><div className="mt-1"><DatePicker value={form.licenseExpiry} onChange={(v) => setForm((f) => ({ ...f, licenseExpiry: v }))} /></div></div>
        <div>
          <Label>الحالة</Label>
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">متاح</SelectItem>
              <SelectItem value="on_trip">في رحلة</SelectItem>
              <SelectItem value="off_duty">خارج الخدمة</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/fleet/drivers")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
