import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";

export default function BiReportsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("bi_reports_create", {
    title: "", type: "analytics", scheduledAt: "", description: "", query: "",
  });
  const createMut = useApiMutation<unknown, Record<string, string | undefined>>("/bi/reports", "POST", [["bi-reports"]]);

  const handleSubmit = () => {
    if (!form.title) {
      toast({ variant: "destructive", title: "يرجى إدخال عنوان التقرير" });
      return;
    }
    createMut.mutate({
      title: form.title,
      type: form.type,
      scheduledAt: form.scheduledAt || undefined,
      description: form.description || undefined,
      query: form.query || undefined,
    }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إنشاء التقرير بنجاح" }); setLocation("/bi/reports"); },
      onError: (err) => toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء التقرير", description: err.message }),
    });
  };

  return (
    <CreatePageLayout title="إنشاء تقرير جديد" backPath="/bi/reports">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <button onClick={clearDraft} className="underline text-amber-600 hover:text-amber-800">تجاهل</button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>عنوان التقرير <span className="text-red-500">*</span></Label><Input className="mt-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="عنوان التقرير" /></div>
          <div>
            <Label>النوع</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="analytics">تحليلي</SelectItem>
                <SelectItem value="summary">ملخص</SelectItem>
                <SelectItem value="detailed">تفصيلي</SelectItem>
                <SelectItem value="comparison">مقارنة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>تاريخ الجدولة</Label><Input className="mt-1" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} /></div>
        </div>
        <div><Label>الوصف</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="وصف التقرير..." /></div>
        <div><Label>استعلام البيانات</Label><Textarea value={form.query} onChange={(e) => setForm((f) => ({ ...f, query: e.target.value }))} placeholder="استعلام SQL أو معرّف البيانات..." className="min-h-[80px] font-mono text-sm" dir="ltr" /></div>
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/bi/reports")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
