import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageStatusBadge } from "@/components/page-status-badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Calendar } from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function UmrahSeasons() {
  const { data: resp, refetch, isLoading, isError } = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const items = resp?.data || [];
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const { toast } = useToast();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const save = async () => {
    try {
      await apiFetch("/umrah/seasons", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "تم إنشاء الموسم" });
      setShowForm(false);
      setForm({});
      refetch();
    } catch { toast({ variant: "destructive", title: "خطأ" }); }
  };

  const closeSeason = async (id: number) => {
    try {
      await apiFetch(`/umrah/seasons/${id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) });
      toast({ title: "تم إغلاق الموسم" });
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.error || "لا يمكن إغلاق الموسم" });
    }
  };

  const openCount = items.filter((s: any) => s.status === "open").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">مواسم العمرة</h1>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2"><Plus className="h-4 w-4" />موسم جديد</Button>
      </div>

      <div className="flex gap-3 text-sm text-muted-foreground">
        <span><span className="font-bold text-foreground">{items.length}</span> إجمالي المواسم</span>
        <span>•</span>
        <span><span className="font-bold text-green-600">{openCount}</span> مفتوح</span>
        <span>•</span>
        <span><span className="font-bold text-foreground">{items.length - openCount}</span> مغلق</span>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 grid grid-cols-3 gap-4">
            <div><Label>العنوان *</Label><Input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>تاريخ البداية *</Label><Input type="date" value={form.startDate || ""} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
            <div><Label>تاريخ النهاية *</Label><Input type="date" value={form.endDate || ""} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
            <div className="col-span-full flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
              <Button onClick={save} disabled={!form.title || !form.startDate || !form.endDate}>حفظ</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {items.map((s: any) => (
          <Card key={s.id} className={s.status === "open" ? "border-green-300" : ""}>
            <CardContent className="p-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {new Date(s.startDate).toLocaleDateString("ar-SA")} — {new Date(s.endDate).toLocaleDateString("ar-SA")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <PageStatusBadge status={s.status} />
                {s.status === "open" && (
                  <Button variant="outline" size="sm" onClick={() => closeSeason(s.id)}>إغلاق الموسم</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && (
          <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
            <Calendar className="h-8 w-8 text-slate-300" />
            <p>لا يوجد مواسم</p>
          </div>
        )}
      </div>
    </div>
  );
}
