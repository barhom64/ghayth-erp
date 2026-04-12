import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";

export default function RequestsTypeCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("requests_type_create", {
    name: "", category: "administrative", isActive: true, description: "",
  });
  const createMut = useApiMutation<unknown, Record<string, string | boolean | undefined>>("/requests/types", "POST", [["request-types"]]);

  const handleSubmit = () => {
    if (!form.name) {
      toast({ variant: "destructive", title: "يرجى إدخال اسم نوع الطلب" });
      return;
    }
    createMut.mutate({
      name: form.name,
      category: form.category,
      isActive: form.isActive,
      description: form.description || undefined,
    }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إضافة نوع الطلب بنجاح" }); setLocation("/requests/types"); },
      onError: (err) => toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة نوع الطلب", description: err.message }),
    });
  };

  return (
    <CreatePageLayout title="إضافة نوع طلب" backPath="/requests/types">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <button onClick={clearDraft} className="underline text-amber-600 hover:text-amber-800">تجاهل</button>
        </div>
      )}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>اسم النوع <span className="text-red-500">*</span></Label><Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم نوع الطلب" /></div>
          <div>
            <Label>التصنيف</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="administrative">إداري</SelectItem>
                <SelectItem value="financial">مالي</SelectItem>
                <SelectItem value="technical">تقني</SelectItem>
                <SelectItem value="hr">موارد بشرية</SelectItem>
                <SelectItem value="maintenance">صيانة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border"
            />
            <Label htmlFor="isActive">نشط</Label>
          </div>
        </div>
        <div><Label>الوصف</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="وصف نوع الطلب..." /></div>
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/requests/types")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
