import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const DRAFT_KEY = "finance_vendors_create";
const INITIAL = { name: "", contactPerson: "", phone: "", email: "", taxNumber: "", address: "", paymentTerms: "", category: "", date: new Date().toISOString().split("T")[0] };

export default function VendorsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/vendors/create", "POST", [["vendors"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const handleSubmit = async () => {
    if (!form.name) {
      toast({ variant: "destructive", title: "اسم المورد مطلوب" });
      return;
    }
    try {
      await createMut.mutateAsync({ ...form, date: form.date || undefined });
      clearDraft();
      toast({ title: "تم إضافة المورد بنجاح" });
      setLocation("/finance/vendors");
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المورد" });
    }
  };

  return (
    <CreatePageLayout title="إضافة مورد جديد" backPath="/finance/vendors">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <Label>التاريخ</Label>
          <Input className="mt-1" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div><Label>الاسم</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
        <div><Label>جهة الاتصال</Label><Input className="mt-1" value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} /></div>
        <div><Label>الهاتف</Label><Input className="mt-1" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
        <div><Label>البريد</Label><Input className="mt-1" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
        <div><Label>الرقم الضريبي</Label><Input className="mt-1" dir="ltr" value={form.taxNumber} onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))} /></div>
        <div><Label>العنوان</Label><Input className="mt-1" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
        <div>
          <Label>شروط الدفع</Label>
          <Select value={form.paymentTerms || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, paymentTerms: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="اختر" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر</SelectItem>
              <SelectItem value="net_30">صافي 30 يوم</SelectItem>
              <SelectItem value="net_60">صافي 60 يوم</SelectItem>
              <SelectItem value="net_90">صافي 90 يوم</SelectItem>
              <SelectItem value="cod">الدفع عند التسليم</SelectItem>
              <SelectItem value="advance">مقدماً</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/vendors")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
