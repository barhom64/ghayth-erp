import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, AutoField, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { DatePicker } from "@/components/ui/date-picker";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "crm_create";
const INITIAL = {
  title: "", clientId: "", stage: "lead", assignedTo: "",
  contactName: "", contactPhone: "", contactEmail: "", source: "",
  value: "", probability: "50", expectedCloseDate: "", nextFollowUp: "", notes: "",
};

export default function CrmCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addOpp = useApiMutation("/crm/opportunities", "POST", [["crm-opportunities"], ["crm-stats"], ["crm-pipeline"]]);
  const { data: clientsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  // CRM-003 — /crm/assignees is gated by the CRM feature; GET /employees
  // required hr.employees and 403'd for CRM-only users.
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["crm-assignees"], "/crm/assignees");
  const clients = clientsData?.data || [];
  const employees = employeesData?.data || [];
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleSubmit = async () => {
    const firstError = validate({
      title: form.title ? null : "يرجى إدخال عنوان الفرصة",
      probability: form.probability && (Number(form.probability) < 0 || Number(form.probability) > 100) ? "نسبة الاحتمال يجب أن تكون بين 0 و 100" : null,
      value: form.value && Number(form.value) < 0 ? "القيمة يجب أن تكون 0 أو أكثر" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await addOpp.mutateAsync({
        title: form.title,
        clientId: form.clientId ? Number(form.clientId) : null,
        stage: form.stage,
        assignedTo: form.assignedTo ? Number(form.assignedTo) : null,
        contactName: form.contactName || undefined,
        contactPhone: form.contactPhone || undefined,
        contactEmail: form.contactEmail || undefined,
        source: form.source || undefined,
        value: Number(form.value) || 0,
        probability: Number(form.probability) || 50,
        expectedCloseDate: form.expectedCloseDate || undefined,
        nextFollowUp: form.nextFollowUp || undefined,
        notes: form.notes || undefined,
      });
      clearDraft();
      toast({ title: "تمت إضافة الفرصة بنجاح" });
      setLocation("/crm");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة الفرصة", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="فرصة تجارية جديدة" backPath="/crm">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="المسؤول" value={user?.name || "-"} />
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="عنوان الفرصة" required value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="عنوان الفرصة" error={fieldErrors.title} />
          <FormFieldWrapper label="العميل">
            <Select value={form.clientId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, clientId: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="بدون عميل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">بدون عميل</SelectItem>
                {clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {form.clientId && (
              <div className="mt-3">
                <ClientContextCard clientId={form.clientId} section="opportunity" />
              </div>
            )}
          </FormFieldWrapper>
          <FormFieldWrapper label="المرحلة">
            <Select value={form.stage} onValueChange={(v) => setForm((f) => ({ ...f, stage: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">فرصة أولية</SelectItem>
                <SelectItem value="qualified">مؤهلة</SelectItem>
                <SelectItem value="proposal">عرض سعر</SelectItem>
                <SelectItem value="negotiation">تفاوض</SelectItem>
                <SelectItem value="closed_won">مكسوبة</SelectItem>
                <SelectItem value="closed_lost">خاسرة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="المسند إليه">
            <Select value={form.assignedTo || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, assignedTo: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر الموظف</SelectItem>
                {employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <TextField label="جهة الاتصال" value={form.contactName} onChange={(v) => setForm((f) => ({ ...f, contactName: v }))} placeholder="اسم جهة الاتصال" />
          <TextField label="الهاتف" type="tel" inputMode="tel" dir="ltr" value={form.contactPhone} onChange={(v) => setForm((f) => ({ ...f, contactPhone: v }))} placeholder="05xxxxxxxx" />
          <TextField label="البريد الإلكتروني" type="email" dir="ltr" value={form.contactEmail} onChange={(v) => setForm((f) => ({ ...f, contactEmail: v }))} placeholder="email@example.com" />
          <FormFieldWrapper label="المصدر">
            <Select value={form.source || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, source: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="اختر المصدر" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر المصدر</SelectItem>
                <SelectItem value="website">الموقع</SelectItem>
                <SelectItem value="referral">إحالة</SelectItem>
                <SelectItem value="social_media">وسائل التواصل</SelectItem>
                <SelectItem value="cold_call">اتصال مباشر</SelectItem>
                <SelectItem value="exhibition">معرض</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <NumberField label={`القيمة المتوقعة (${getCurrencySymbol()})`} value={form.value} onChange={(v) => setForm((f) => ({ ...f, value: v }))} placeholder="٠" step={0.01} min={0} error={fieldErrors.value} />
          <NumberField label="نسبة الاحتمال (%)" value={form.probability} onChange={(v) => setForm((f) => ({ ...f, probability: v }))} placeholder="50" min={0} max={100} error={fieldErrors.probability} />
          <FormFieldWrapper label="تاريخ الإغلاق المتوقع">
            <DatePicker value={form.expectedCloseDate} onChange={(v) => setForm((f) => ({ ...f, expectedCloseDate: v }))} />
          </FormFieldWrapper>
          <FormFieldWrapper label="المتابعة القادمة">
            <DatePicker value={form.nextFollowUp} onChange={(v) => setForm((f) => ({ ...f, nextFollowUp: v }))} />
          </FormFieldWrapper>
        </div>
        <TextAreaField label="ملاحظات" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="ملاحظات حول الفرصة..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/crm")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addOpp.isPending} rateLimitAware>{addOpp.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
