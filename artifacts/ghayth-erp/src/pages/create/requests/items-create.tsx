import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";

export default function RequestsItemCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("requests_item_create", {
    title: "", typeId: "", priority: "medium", requester: "", description: "",
  });
  const createMut = useApiMutation<unknown, Record<string, string>>("/requests", "POST", [["requests"]]);
  const { data: typesRes } = useApiQuery<{ data: any[] }>(["request-types"], "/requests/types");
  const types = typesRes?.data || [];

  const handleSubmit = () => {
    if (!form.title) {
      toast({ variant: "destructive", title: "يرجى إدخال عنوان الطلب" });
      return;
    }
    createMut.mutate({
      title: form.title,
      typeId: form.typeId || undefined,
      priority: form.priority,
      requester: form.requester || undefined,
      description: form.description || undefined,
    }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إنشاء الطلب بنجاح" }); setLocation("/requests"); },
      onError: (err) => toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الطلب", description: err.message }),
    });
  };

  return (
    <CreatePageLayout title="طلب جديد" backPath="/requests">
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
          <div><Label>عنوان الطلب <span className="text-red-500">*</span></Label><Input className="mt-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="عنوان الطلب" /></div>
          <div>
            <Label>النوع</Label>
            <Select value={form.typeId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, typeId: v === "_none" ? "" : v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="اختر النوع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر النوع</SelectItem>
                {types.map((t: { id: number; name: string }) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الأولوية</Label>
            <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">منخفضة</SelectItem>
                <SelectItem value="medium">متوسطة</SelectItem>
                <SelectItem value="high">عالية</SelectItem>
                <SelectItem value="urgent">عاجلة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>مقدم الطلب</Label><Input className="mt-1" value={form.requester} onChange={(e) => setForm((f) => ({ ...f, requester: e.target.value }))} placeholder="اسم مقدم الطلب" /></div>
        </div>
        <div><Label>التفاصيل</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="تفاصيل الطلب..." /></div>
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/requests")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
