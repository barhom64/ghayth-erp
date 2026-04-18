import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, AutoField, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { DatePicker } from "@/components/ui/date-picker";
import { ClientContextCard } from "@/components/shared/client-context-card";

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
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const clients = clientsData?.data || [];
  const employees = employeesData?.data || [];
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const errCls = (field: string) => fieldErrors[field] ? "border-red-500 ring-1 ring-red-300" : "";
  const FieldHint = ({ field }: { field: string }) => fieldErrors[field] ? <p className="text-xs text-red-600 mt-1">{fieldErrors[field]}</p> : null;

  const handleSubmit = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.title) localErrors.title = "يرجى إدخال عنوان الفرصة";
    if (form.probability && (Number(form.probability) < 0 || Number(form.probability) > 100)) localErrors.probability = "نسبة الاحتمال يجب أن تكون بين 0 و 100";
    if (form.value && Number(form.value) < 0) localErrors.value = "القيمة يجب أن تكون 0 أو أكثر";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
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
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة الفرصة", description: err.message });
    }
  };

  return (
    <CreatePageLayout title="فرصة تجارية جديدة" backPath="/crm">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="المسؤول" value={user?.name || "-"} />
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>عنوان الفرصة <span className="text-red-500">*</span></Label><Input className={`mt-1 ${errCls("title")}`} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="عنوان الفرصة" /><FieldHint field="title" /></div>
          <div>
            <Label>العميل</Label>
            <Select value={form.clientId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, clientId: v === "_none" ? "" : v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="بدون عميل" /></SelectTrigger>
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
          </div>
          <div>
            <Label>المرحلة</Label>
            <Select value={form.stage} onValueChange={(v) => setForm((f) => ({ ...f, stage: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">فرصة أولية</SelectItem>
                <SelectItem value="qualified">مؤهلة</SelectItem>
                <SelectItem value="proposal">عرض سعر</SelectItem>
                <SelectItem value="negotiation">تفاوض</SelectItem>
                <SelectItem value="closed_won">مكسوبة</SelectItem>
                <SelectItem value="closed_lost">خاسرة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>المسند إليه</Label>
            <Select value={form.assignedTo || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, assignedTo: v === "_none" ? "" : v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر الموظف</SelectItem>
                {employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>جهة الاتصال</Label><Input className="mt-1" value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} placeholder="اسم جهة الاتصال" /></div>
          <div><Label>الهاتف</Label><Input className="mt-1" dir="ltr" value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} placeholder="05xxxxxxxx" /></div>
          <div><Label>البريد الإلكتروني</Label><Input className="mt-1" dir="ltr" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} placeholder="email@example.com" /></div>
          <div>
            <Label>المصدر</Label>
            <Select value={form.source || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, source: v === "_none" ? "" : v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="اختر المصدر" /></SelectTrigger>
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
          </div>
          <div><Label>{`القيمة المتوقعة (${getCurrencySymbol()})`}</Label><Input className={`mt-1 ${errCls("value")}`} type="number" step="0.01" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder="٠" /><FieldHint field="value" /></div>
          <div><Label>نسبة الاحتمال (%)</Label><Input className={`mt-1 ${errCls("probability")}`} type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm((f) => ({ ...f, probability: e.target.value }))} placeholder="50" /><FieldHint field="probability" /></div>
          <div><Label>تاريخ الإغلاق المتوقع</Label><div className="mt-1"><DatePicker value={form.expectedCloseDate} onChange={(v) => setForm((f) => ({ ...f, expectedCloseDate: v }))} /></div></div>
          <div><Label>المتابعة القادمة</Label><div className="mt-1"><DatePicker value={form.nextFollowUp} onChange={(v) => setForm((f) => ({ ...f, nextFollowUp: v }))} /></div></div>
        </div>
        <div><Label>ملاحظات</Label><Textarea className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات حول الفرصة..." /></div>
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/crm")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addOpp.isPending}>{addOpp.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
