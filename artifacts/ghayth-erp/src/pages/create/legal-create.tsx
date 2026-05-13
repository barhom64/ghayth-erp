import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useApiMutation, useApiQuery, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Autocomplete } from "@/components/ui/autocomplete";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { DatePicker } from "@/components/ui/date-picker";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function LegalCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, hasDraft, clearDraft } = useAutoDraft("legal_create", {
    title: "", partyName: "", partyContact: "", contractType: "",
    value: "", status: "draft",
    startDate: "", endDate: "", notes: "",
  });
  const addContract = useApiMutation("/legal/contracts", "POST", [["legal-contracts"], ["legal-stats"]]);
  const { data: clientsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();
  const search = useSearch();
  const copyFromId = new URLSearchParams(search).get("copyFrom");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (copyFromId && !copied) {
      apiFetch(`/legal/contracts/${copyFromId}`)
        .then((res: any) => {
          const src = res.data || res;
          setCopied(true);
          setForm(f => ({
            ...f,
            title: `${src.title || ""} (نسخة)`,
            partyName: src.partyName || "",
            partyContact: src.partyContact || "",
            contractType: src.contractType || "",
            value: src.value ? String(src.value) : "",
            startDate: "",
            endDate: "",
          }));
        })
        .catch(() => {});
    }
  }, [copyFromId, copied]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const clients = clientsData?.data || [];

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const firstError = validate({
      title: form.title.trim() ? null : "يرجى إدخال عنوان العقد",
      partyName: form.partyName.trim() ? null : "الطرف الآخر مطلوب",
      startDate: form.startDate ? null : "يرجى تحديد تاريخ البداية",
      endDate: !form.endDate
        ? "يرجى تحديد تاريخ النهاية"
        : form.startDate && form.endDate <= form.startDate
          ? "تاريخ النهاية يجب أن يكون بعد تاريخ البداية"
          : null,
      value: form.value && Number(form.value) < 0 ? "القيمة يجب أن تكون 0 أو أكثر" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await addContract.mutateAsync({
        title: form.title,
        partyName: form.partyName,
        partyContact: form.partyContact || undefined,
        contractType: form.contractType || undefined,
        value: form.value ? Number(form.value) : undefined,
        status: form.status,
        startDate: form.startDate,
        endDate: form.endDate,
        notes: form.notes || undefined,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      clearDraft();
      toast({ title: "تمت إضافة العقد بنجاح" });
      setLocation("/legal");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة العقد", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title={copyFromId ? "نسخ عقد قانوني" : "عقد قانوني جديد"} backPath="/legal">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="عنوان العقد"
            required
            value={form.title}
            onChange={(v) => setForm(f => ({ ...f, title: v }))}
            placeholder="عنوان العقد"
            error={fieldErrors.title}
          />
          <FormFieldWrapper label="نوع العقد">
            <Select value={form.contractType || "_none"} onValueChange={(v) => setForm(f => ({ ...f, contractType: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر النوع</SelectItem>
                <SelectItem value="service">عقد خدمات</SelectItem>
                <SelectItem value="employment">عقد توظيف</SelectItem>
                <SelectItem value="rental">عقد إيجار</SelectItem>
                <SelectItem value="supply">عقد توريد</SelectItem>
                <SelectItem value="partnership">عقد شراكة</SelectItem>
                <SelectItem value="nda">اتفاقية سرية</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الطرف الآخر (عميل)" required error={fieldErrors.partyName}>
            <Autocomplete
              value={form.partyName}
              onChange={(v) => setForm(f => ({ ...f, partyName: String(v) }))}
              options={clients.map((c: any) => ({ value: String(c.id), label: c.name, subtitle: c.phone || c.email || "" }))}
              placeholder="ابحث عن العميل..."
              emptyMessage="لا يوجد عملاء"
            />
          </FormFieldWrapper>
          <TextField
            label="بيانات الاتصال"
            value={form.partyContact}
            onChange={(v) => setForm(f => ({ ...f, partyContact: v }))}
            placeholder="هاتف أو بريد"
          />
        </div>
        {form.partyName && (
          <div className="md:col-span-2">
            <ClientContextCard clientId={form.partyName} section="contract" />
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberField
            label={`القيمة (${getCurrencySymbol()})`}
            value={form.value}
            onChange={(v) => setForm(f => ({ ...f, value: v }))}
            placeholder="٠"
            step={0.01}
            min={0}
            error={fieldErrors.value}
          />
          <FormFieldWrapper label="الحالة">
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="active">ساري</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="من" required error={fieldErrors.startDate}>
            <DatePicker value={form.startDate} onChange={(v) => setForm(f => ({ ...f, startDate: v }))} />
          </FormFieldWrapper>
          <FormFieldWrapper label="إلى" required error={fieldErrors.endDate}>
            <DatePicker value={form.endDate} onChange={(v) => setForm(f => ({ ...f, endDate: v }))} />
          </FormFieldWrapper>
        </div>
        <TextAreaField
          label="ملاحظات"
          value={form.notes}
          onChange={(v) => setForm(f => ({ ...f, notes: v }))}
          placeholder="ملاحظات حول العقد..."
        />
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات العقد" />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/legal")}>إلغاء</Button>
          <Button type="submit" disabled={addContract.isPending} rateLimitAware>{addContract.isPending ? "جاري الحفظ..." : "حفظ"}</Button>
        </div>
      </div>
      </form>
    </CreatePageLayout>
  );
}
