import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { EmployeeSelect } from "@/components/shared/entity-selects";

const DRAFT_KEY = "fleet_drivers_create";
const INITIAL = {
  name: "", phone: "",
  licenseNumber: "", licenseExpiry: "", licenseType: "", licenseClass: "",
  // #1812 KSA driver identity (user's operational review).
  nationalId: "", iqamaNumber: "",
  licenseIssueDate: "", licenseIssuingAuthority: "", licenseOrigin: "",
  employeeId: "", status: "available",
};

// KSA license-origin alphabet (mirrors LICENSE_ORIGIN_VALUES on the server).
const LICENSE_ORIGIN_OPTIONS = [
  { value: "saudi", label: "سعودية" },
  { value: "gcc", label: "خليجية" },
  { value: "international", label: "دولية" },
  { value: "temporary", label: "مؤقتة" },
] as const;

// KSA license classes (mirrors LICENSE_CLASS_VALUES on the server).
const LICENSE_CLASS_OPTIONS = [
  { value: "private", label: "خاصة" },
  { value: "light_trans", label: "نقل خفيف" },
  { value: "medium", label: "نقل متوسط" },
  { value: "heavy", label: "نقل ثقيل" },
  { value: "public_trans", label: "نقل عام" },
  { value: "motorcycle", label: "دراجة نارية" },
  { value: "equipment", label: "معدات ثقيلة" },
] as const;

export default function DriversCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/drivers", "POST", [["drivers"]]);
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleEmployeeSelect = (empId: string) => {
    const employees = employeesData?.data || [];
    const emp = employees.find((e: any) => String(e.id) === empId);
    if (emp) {
      setForm((f) => ({ ...f, employeeId: empId, name: emp.name || f.name, phone: emp.phone || f.phone }));
    } else {
      setForm((f) => ({ ...f, employeeId: empId }));
    }
  };

  const handleSubmit = async () => {
    const expiryInPast = form.licenseExpiry && new Date(form.licenseExpiry) < new Date();
    // #1812 KSA identity rule: saudi → nationalId required; otherwise → iqamaNumber.
    const needsIqama = form.licenseOrigin && form.licenseOrigin !== "saudi";
    const needsNationalId = form.licenseOrigin === "saudi";
    // Saudi licenses carry no separate license number — the national ID
    // is the license identity. Require licenseNumber only for non-Saudi.
    const needsLicenseNumber = form.licenseOrigin !== "saudi";
    const firstError = validate({
      name: form.name.trim() ? null : "اسم السائق مطلوب",
      phone: form.phone.trim() ? null : "رقم الهاتف مطلوب",
      licenseNumber: needsLicenseNumber && !form.licenseNumber.trim() ? "رقم الرخصة مطلوب" : null,
      licenseExpiry: expiryInPast ? "تاريخ انتهاء الرخصة يجب أن يكون في المستقبل" : null,
      nationalId: needsNationalId && !/^\d{10}$/.test(form.nationalId)
        ? "الهوية الوطنية مطلوبة (10 أرقام) للرخصة السعودية" : null,
      iqamaNumber: needsIqama && !/^\d{10}$/.test(form.iqamaNumber)
        ? "رقم الإقامة مطلوب (10 أرقام) للسائق غير السعودي" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: "الرجاء تصحيح الأخطاء في النموذج" });
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
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة السائق", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة سائق جديد" backPath="/fleet/drivers">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <EmployeeSelect
            value={form.employeeId}
            onChange={handleEmployeeSelect}
            label="ربط بموظف"
            allowCreate={false}
          />
          {form.employeeId && (
            <div className="mt-3">
              <EmployeeContextCard employeeId={form.employeeId} />
            </div>
          )}
        </div>

        <TextField
          label="الاسم"
          required
          value={form.name}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          error={fieldErrors.name}
        />

        <TextField
          label="الهاتف"
          required
          type="tel"
          inputMode="tel"
          dir="ltr"
          value={form.phone}
          onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
          error={fieldErrors.phone}
        />

        <TextField
          label="رقم الرخصة"
          required={form.licenseOrigin !== "saudi"}
          value={form.licenseNumber}
          onChange={(v) => setForm((f) => ({ ...f, licenseNumber: v }))}
          error={fieldErrors.licenseNumber}
        />

        <FormFieldWrapper label="مصدر الرخصة">
          <Select
            value={form.licenseOrigin || "_none"}
            onValueChange={(v) => setForm((f) => ({ ...f, licenseOrigin: v === "_none" ? "" : v }))}
          >
            <SelectTrigger><SelectValue placeholder="اختر المصدر" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر المصدر</SelectItem>
              {LICENSE_ORIGIN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>

        <FormFieldWrapper label="فئة الرخصة">
          <Select
            value={form.licenseClass || "_none"}
            onValueChange={(v) => setForm((f) => ({ ...f, licenseClass: v === "_none" ? "" : v }))}
          >
            <SelectTrigger><SelectValue placeholder="اختر الفئة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر الفئة</SelectItem>
              {LICENSE_CLASS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>

        <FormFieldWrapper label="تاريخ إصدار الرخصة">
          <DatePicker value={form.licenseIssueDate} onChange={(v) => setForm((f) => ({ ...f, licenseIssueDate: v }))} />
        </FormFieldWrapper>

        <FormFieldWrapper label="انتهاء الرخصة" error={fieldErrors.licenseExpiry}>
          <DatePicker value={form.licenseExpiry} onChange={(v) => setForm((f) => ({ ...f, licenseExpiry: v }))} />
        </FormFieldWrapper>

        <TextField
          label="جهة الإصدار"
          placeholder="الإدارة العامة للمرور"
          value={form.licenseIssuingAuthority}
          onChange={(v) => setForm((f) => ({ ...f, licenseIssuingAuthority: v }))}
        />

        <TextField
          label="رقم الهوية الوطنية"
          required={form.licenseOrigin === "saudi"}
          inputMode="numeric"
          dir="ltr"
          value={form.nationalId}
          onChange={(v) => setForm((f) => ({ ...f, nationalId: v.replace(/\D/g, "").slice(0, 10) }))}
          error={fieldErrors.nationalId}
        />

        <TextField
          label="رقم الإقامة"
          required={!!form.licenseOrigin && form.licenseOrigin !== "saudi"}
          inputMode="numeric"
          dir="ltr"
          value={form.iqamaNumber}
          onChange={(v) => setForm((f) => ({ ...f, iqamaNumber: v.replace(/\D/g, "").slice(0, 10) }))}
          error={fieldErrors.iqamaNumber}
        />

        <FormFieldWrapper label="الحالة">
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">متاح</SelectItem>
              <SelectItem value="on_trip">في رحلة</SelectItem>
              <SelectItem value="off_duty">خارج الخدمة</SelectItem>
              <SelectItem value="suspended">موقوف</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/fleet/drivers")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
