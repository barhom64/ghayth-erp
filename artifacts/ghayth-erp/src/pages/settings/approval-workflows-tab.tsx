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
  const [form, setForm] = useState({ entityType: "leave", chainOrder: 1, approverRole: "manager", label: "" });
  const chains = data?.data || [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

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
        body: JSON.stringify({ ...form, label: form.label || entityTypes.find(e => e.value === form.entityType)?.label }),
      });
      toast({ title: "تمت إضافة مرحلة الموافقة" });
      setShowForm(false);
      setForm({ entityType: "leave", chainOrder: 1, approverRole: "manager", label: "" });
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
    chains: chains.filter((c: any) => c.entityType === et.value).sort((a: any, b: any) => a.chainOrder - b.chainOrder),
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
            <select className="w-full border rounded-md p-2" value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })}>
              {entityTypes.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
            </select>
          </div>
          <div>
            <Label>المرحلة (الترتيب)</Label>
            <Input type="number" min={1} max={10} value={form.chainOrder} onChange={(e) => setForm({ ...form, chainOrder: Number(e.target.value) })} />
          </div>
          <div>
            <Label>الدور المطلوب للموافقة</Label>
            <select className="w-full border rounded-md p-2" value={form.approverRole} onChange={(e) => setForm({ ...form, approverRole: e.target.value })}>
              {approverRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <Label>التسمية (اختياري)</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="مثال: موافقة المدير" />
          </div>
          <div className="md:col-span-2">
            <Button onClick={handleSubmit}>حفظ</Button>
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
                      {chain.chainOrder}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium text-sm">{chain.label || `المرحلة ${chain.chainOrder}`}</span>
                      <span className="text-xs text-gray-500 ms-2">
                        ({approverRoles.find(r => r.value === chain.approverRole)?.label || chain.approverRole})
                      </span>
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
