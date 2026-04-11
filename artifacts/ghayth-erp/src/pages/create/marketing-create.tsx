import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function MarketingCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/marketing/campaigns", "POST", [["mkt-campaigns"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("marketing_create", {
    name: "", description: "", type: "digital", channel: "",
    budget: "", targetAudience: "", startDate: "", endDate: "", status: "draft",
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const handleSubmit = async () => {
    if (!form.name) {
      toast({ variant: "destructive", title: "يرجى إدخال اسم الحملة" });
      return;
    }
    try {
      await createMut.mutateAsync({
        ...form,
        budget: Number(form.budget) || 0,
      });
      clearDraft();
      toast({ title: "تم إنشاء الحملة بنجاح" });
      setLocation("/marketing");
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الحملة" });
    }
  };

  return (
    <CreatePageLayout title="حملة تسويقية جديدة" backPath="/marketing">
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
        <div><Label>اسم الحملة <span className="text-red-500">*</span></Label><Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
        <div>
          <Label>النوع</Label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="digital">إعلان رقمي</SelectItem>
              <SelectItem value="email">بريد إلكتروني</SelectItem>
              <SelectItem value="sms">رسائل SMS</SelectItem>
              <SelectItem value="social_media">وسائل تواصل</SelectItem>
              <SelectItem value="print">مطبوعات</SelectItem>
              <SelectItem value="event">فعاليات</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>القناة</Label>
          <Select value={form.channel || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, channel: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر القناة</SelectItem>
              <SelectItem value="google">Google Ads</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="twitter">X (Twitter)</SelectItem>
              <SelectItem value="snapchat">Snapchat</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="email">بريد إلكتروني</SelectItem>
              <SelectItem value="sms">رسائل نصية</SelectItem>
              <SelectItem value="other">أخرى</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>الحالة</Label>
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">مسودة</SelectItem>
              <SelectItem value="active">نشطة</SelectItem>
              <SelectItem value="paused">متوقفة</SelectItem>
              <SelectItem value="completed">مكتملة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>{`الميزانية (${getCurrencySymbol()})`}</Label><Input className="mt-1" type="number" step="0.01" value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} placeholder="٠" /></div>
        <div><Label>الجمهور المستهدف</Label><Input className="mt-1" value={form.targetAudience} onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value }))} placeholder="مثال: شباب 18-35" /></div>
        <div><Label>تاريخ البدء</Label><div className="mt-1"><DatePicker value={form.startDate} onChange={(v) => setForm((f) => ({ ...f, startDate: v }))} /></div></div>
        <div><Label>تاريخ الانتهاء</Label><div className="mt-1"><DatePicker value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} /></div></div>
        <div className="md:col-span-2"><Label>الوصف</Label><Textarea className="mt-1" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="وصف الحملة التسويقية..." /></div>
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/marketing")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ الحملة"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
