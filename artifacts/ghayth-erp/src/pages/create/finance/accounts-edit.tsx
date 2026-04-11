import { useState, useEffect } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useApiQuery, apiPatch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Save, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const typeMap: Record<string, string> = {
  asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات"
};

export default function AccountsEdit() {
  const [, params] = useRoute("/finance/accounts/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", type: "" });

  const { data, isLoading } = useApiQuery<any>(["accounts"], "/finance/accounts");
  const items = data?.data || [];
  const account = items.find((a: any) => String(a.id) === params?.id);

  useEffect(() => {
    if (account) {
      setForm({ name: account.name || "", code: account.code || "", type: account.type || "asset" });
    }
  }, [account]);

  const handleSave = async () => {
    if (!form.name) { toast({ variant: "destructive", title: "اسم الحساب مطلوب" }); return; }
    setSaving(true);
    try {
      await apiPatch(`/finance/accounts/${params?.id}`, { name: form.name, type: form.type });
      toast({ title: "تم تحديث الحساب" });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setLocation("/finance/accounts");
    } catch { toast({ variant: "destructive", title: "حدث خطأ أثناء التحديث" }); }
    finally { setSaving(false); }
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!account) return <div className="text-center py-16 text-gray-500">الحساب غير موجود</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href="/finance/accounts">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">تعديل الحساب — {account.code}</h1>
            <p className="text-gray-500 text-sm mt-1">تعديل بيانات الحساب في شجرة الحسابات</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5 text-blue-500" /> بيانات الحساب
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>اسم الحساب <span className="text-red-500">*</span></Label>
              <Input className="mt-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>رمز الحساب</Label>
              <Input className="mt-1" value={form.code} disabled title="رمز الحساب غير قابل للتعديل بعد الإنشاء" />
            </div>
            <div>
              <Label>النوع</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(typeMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/finance/accounts">
          <Button variant="outline">إلغاء</Button>
        </Link>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        </Button>
      </div>
    </div>
  );
}
