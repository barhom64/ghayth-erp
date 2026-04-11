import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useApiMutation, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { DatePicker } from "@/components/ui/date-picker";

export default function LegalCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, hasDraft, clearDraft } = useAutoDraft("legal_create", {
    title: "", partyName: "", partyContact: "", contractType: "",
    value: "", status: "draft", renewalAlert: "true", alertDaysBefore: "30",
    startDate: "", endDate: "", notes: "",
  });
  const addContract = useApiMutation("/legal/contracts", "POST", [["legal-contracts"], ["legal-stats"]]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.title) {
      toast({ variant: "destructive", title: "يرجى إدخال عنوان العقد" });
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast({ variant: "destructive", title: "يرجى تحديد تاريخ البداية والنهاية" });
      return;
    }
    try {
      await addContract.mutateAsync({
        title: form.title,
        partyName: form.partyName || undefined,
        partyContact: form.partyContact || undefined,
        contractType: form.contractType || undefined,
        value: Number(form.value) || 0,
        status: form.status,
        renewalAlert: form.renewalAlert,
        alertDaysBefore: Number(form.alertDaysBefore) || 30,
        startDate: form.startDate,
        endDate: form.endDate,
        notes: form.notes || undefined,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      clearDraft();
      toast({ title: "تمت إضافة العقد بنجاح" });
      setLocation("/legal");
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة العقد", description: err.message });
    }
  };

  return (
    <CreatePageLayout title={copyFromId ? "نسخ عقد قانوني" : "عقد قانوني جديد"} backPath="/legal">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <button onClick={clearDraft} className="underline text-amber-600 hover:text-amber-800">تجاهل</button>
        </div>
      )}
      <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>عنوان العقد <span className="text-red-500">*</span></Label><Input className="mt-1" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="عنوان العقد" /></div>
          <div>
            <Label>نوع العقد</Label>
            <Select value={form.contractType || "_none"} onValueChange={(v) => setForm(f => ({ ...f, contractType: v === "_none" ? "" : v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
          </div>
          <div><Label>اسم الطرف الآخر</Label><Input className="mt-1" value={form.partyName} onChange={(e) => setForm(f => ({ ...f, partyName: e.target.value }))} placeholder="اسم الطرف" /></div>
          <div><Label>بيانات الاتصال</Label><Input className="mt-1" value={form.partyContact} onChange={(e) => setForm(f => ({ ...f, partyContact: e.target.value }))} placeholder="هاتف أو بريد" /></div>
          <div><Label>{`القيمة (${getCurrencySymbol()})`}</Label><Input className="mt-1" type="number" step="0.01" value={form.value} onChange={(e) => setForm(f => ({ ...f, value: e.target.value }))} placeholder="٠" /></div>
          <div>
            <Label>الحالة</Label>
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="active">ساري</SelectItem>
                <SelectItem value="pending">قيد المراجعة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>من <span className="text-red-500">*</span></Label><div className="mt-1"><DatePicker value={form.startDate} onChange={(v) => setForm(f => ({ ...f, startDate: v }))} /></div></div>
          <div><Label>إلى <span className="text-red-500">*</span></Label><div className="mt-1"><DatePicker value={form.endDate} onChange={(v) => setForm(f => ({ ...f, endDate: v }))} /></div></div>
          <div>
            <Label>تنبيه التجديد</Label>
            <Select value={form.renewalAlert} onValueChange={(v) => setForm(f => ({ ...f, renewalAlert: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">مفعل</SelectItem>
                <SelectItem value="false">معطل</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>أيام قبل التنبيه</Label><Input className="mt-1" type="number" value={form.alertDaysBefore} onChange={(e) => setForm(f => ({ ...f, alertDaysBefore: e.target.value }))} placeholder="30" /></div>
        </div>
        <div><Label>ملاحظات</Label><Textarea className="mt-1" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات حول العقد..." /></div>
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات العقد" />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/legal")}>إلغاء</Button>
          <Button type="submit" disabled={addContract.isPending}>{addContract.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
      </form>
    </CreatePageLayout>
  );
}
