import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { Switch } from "@/components/ui/switch";

const typeMap: Record<string, string> = { asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات" };
const natureMap: Record<string, string> = { debit: "مدين", credit: "دائن" };

const DRAFT_KEY = "finance_accounts_create";
const INITIAL = { code: "", name: "", nameEn: "", type: "asset", parentCode: "", nature: "debit", allowPosting: true, isAnalytical: false };

export default function AccountsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/accounts", "POST", [["accounts"], ["accounts-list"], ["accounts-posting"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { data: accountsData } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const accounts = accountsData?.data || [];

  const handleSubmit = async () => {
    try {
      await createMut.mutateAsync(form);
      clearDraft();
      toast({ title: "تم إضافة الحساب" });
      setLocation("/finance/accounts");
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ" });
    }
  };

  return (
    <CreatePageLayout title="إضافة حساب جديد" backPath="/finance/accounts">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><Label>الرمز</Label><Input className="mt-1" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="1100" /></div>
        <div><Label>الاسم</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
        <div><Label>الاسم بالإنجليزية</Label><Input className="mt-1" dir="ltr" value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} placeholder="Account Name" /></div>
        <div>
          <Label>النوع</Label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(typeMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>الحساب الأب</Label>
          <Select value={form.parentCode || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, parentCode: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="بدون (حساب رئيسي)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">بدون (حساب رئيسي)</SelectItem>
              {accounts.map((a: any) => (
                <SelectItem key={a.code || a.id} value={String(a.code)}>
                  {a.code} - {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>الطبيعة</Label>
          <Select value={form.nature} onValueChange={(v) => setForm((f) => ({ ...f, nature: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(natureMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={form.allowPosting} onCheckedChange={(v) => setForm((f) => ({ ...f, allowPosting: v }))} id="allowPosting" />
          <Label htmlFor="allowPosting">يقبل الحركة (ترحيل)</Label>
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={form.isAnalytical} onCheckedChange={(v) => setForm((f) => ({ ...f, isAnalytical: v }))} id="isAnalytical" />
          <Label htmlFor="isAnalytical">حساب تحليلي</Label>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/accounts")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || !form.code || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
