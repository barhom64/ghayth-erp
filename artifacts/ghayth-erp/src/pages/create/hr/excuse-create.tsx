import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { CreatePageLayout, AutoField, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { LogOut } from "lucide-react";
import { TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "hr_excuse_create";

export default function ExcuseCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const createMut = useApiMutation("/hr/excuse-requests", "POST", [["excuse-requests"]], {
    successMessage: "تم تقديم طلب الاستئذان بنجاح",
  });
  const { isLoading, isError } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, {
    excuseDate: "",
    excuseType: "early_leave",
    startTime: "",
    endTime: "",
    estimatedMinutes: "",
    reason: "",
    assignmentId: "",
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = () => {
    const firstError = validate({
      excuseDate: form.excuseDate ? null : "تاريخ الاستئذان مطلوب",
      endTime: form.startTime && form.endTime && form.endTime <= form.startTime
        ? "وقت الانتهاء يجب أن يكون بعد وقت البدء"
        : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate(
      {
        excuseDate: form.excuseDate,
        excuseType: form.excuseType,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : undefined,
        reason: form.reason || undefined,
        assignmentId: form.assignmentId ? Number(form.assignmentId) : undefined,
      },
      {
        onSuccess: () => {
          clearDraft();
          setLocation("/hr/excuse-requests");
        },
        onError: (err: any) => {
          setApiError(err);
        },
      },
    );
  };

  return (
    <CreatePageLayout title="طلب استئذان" backPath="/hr/excuse-requests">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <AutoField label="الموظف" value={user?.name || "-"} />
        <AutoField label="الرقم الوظيفي" value={user?.empNumber || "-"} />
        <CreationDateField />
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <LogOut className="w-4 h-4" />
            تفاصيل الاستئذان
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormFieldWrapper label="تاريخ الاستئذان" required error={fieldErrors.excuseDate}>
              <DatePicker value={form.excuseDate} onChange={(v) => setForm((f) => ({ ...f, excuseDate: v }))} />
            </FormFieldWrapper>
            <FormFieldWrapper label="نوع الاستئذان">
              <Select value={form.excuseType} onValueChange={(v) => setForm((f) => ({ ...f, excuseType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="early_leave">خروج مبكر</SelectItem>
                  <SelectItem value="late_arrival">تأخر عن الحضور</SelectItem>
                  <SelectItem value="personal">استئذان شخصي</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <FormFieldWrapper label="وقت البدء">
              <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} dir="ltr" />
            </FormFieldWrapper>
            <FormFieldWrapper label="وقت الانتهاء" error={fieldErrors.endTime}>
              <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} dir="ltr" />
            </FormFieldWrapper>
            <NumberField label="المدة التقديرية (دقائق)" value={form.estimatedMinutes} onChange={(v) => setForm((f) => ({ ...f, estimatedMinutes: v }))} placeholder="60" min={0} />
          </div>
        </div>

        <TextAreaField label="السبب" value={form.reason} onChange={(v) => setForm((f) => ({ ...f, reason: v }))} placeholder="سبب طلب الاستئذان..." />
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/hr/excuse-requests")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.excuseDate || createMut.isPending} size="lg" rateLimitAware>
          {createMut.isPending ? "جاري الإرسال..." : "تقديم الطلب"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
