import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch, Plus, X, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export function ApprovalWorkflowsTab() {
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["approval-config"], "/settings/approval-config");
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ chainType: "leave", name: "", minAmount: 0, maxAmount: null as number | null });
  const chains = data?.data || [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const entityTypes = [
    { value: "leave", label: "الإجازات" },
    { value: "purchase_request", label: "طلبات الشراء" },
    { value: "expense", label: "المصروفات" },
    { value: "general_request", label: "الطلبات العامة" },
  ];

  const approverRoles = [
    { value: "manager", label: "المدير المباشر" },
    { value: "hr", label: "الموارد البشرية" },
    { value: "finance", label: "المالية" },
    { value: "owner", label: "المالك" },
    { value: "director", label: "المدير العام" },
  ];

  const handleSubmit = async () => {
    try {
      await apiFetch("/settings/approval-config", {
        method: "POST",
        body: JSON.stringify({ ...form, name: form.name || entityTypes.find(e => e.value === form.chainType)?.label }),
      });
      toast({ title: "تمت إضافة سلسلة الموافقة" });
      setShowForm(false);
      setForm({ chainType: "leave", name: "", minAmount: 0, maxAmount: null });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/settings/approval-config/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const grouped = entityTypes.map(et => ({
    ...et,
    chains: chains.filter((c: any) => c.chainType === et.value).sort((a: any, b: any) => (a.minAmount ?? 0) - (b.minAmount ?? 0)),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          سلاسل الموافقة
        </h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة مرحلة</>}
        </Button>
      </div>

      {showForm && (
        <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>نوع الطلب</Label>
            <select className="w-full border rounded-md p-2" value={form.chainType} onChange={(e) => setForm({ ...form, chainType: e.target.value })}>
              {entityTypes.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
            </select>
          </div>
          <div>
            <Label>التسمية (اختياري)</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: موافقة المدير" />
          </div>
          <div>
            <Label>الحد الأدنى للمبلغ</Label>
            <Input type="number" min={0} value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: Number(e.target.value) })} />
          </div>
          <div>
            <Label>الحد الأقصى للمبلغ (اختياري)</Label>
            <Input type="number" min={0} value={form.maxAmount ?? ""} onChange={(e) => setForm({ ...form, maxAmount: e.target.value ? Number(e.target.value) : null })} />
          </div>
          <div className="md:col-span-2">
            <Button onClick={handleSubmit} rateLimitAware>حفظ</Button>
          </div>
        </CardContent></Card>
      )}

      {grouped.map((group) => (
        <Card key={group.value}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{group.label}</CardTitle>
          </CardHeader>
          <CardContent>
            {group.chains.length > 0 ? (
              <div className="space-y-2">
                {group.chains.map((chain: any, idx: number) => (
                  <div key={chain.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium text-sm">{chain.name || `سلسلة ${idx + 1}`}</span>
                      {(chain.minAmount > 0 || chain.maxAmount) && (
                        <span className="text-xs text-gray-500 ms-2">
                          ({chain.minAmount ?? 0} - {chain.maxAmount ?? "∞"})
                        </span>
                      )}
                    </div>
                    {idx < group.chains.length - 1 && <span className="text-gray-300 text-xs">→</span>}
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(chain.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-3">لا توجد مراحل موافقة محددة — سيتم الموافقة مباشرة</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
