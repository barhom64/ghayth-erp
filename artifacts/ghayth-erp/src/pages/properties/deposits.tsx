import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import { Vault, Plus, RotateCcw, DollarSign } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function DepositsPage() {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ contractId: "", amount: "", receivedDate: new Date().toISOString().split("T")[0], notes: "" });

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["deposits", statusFilter],
    `/properties/deposits${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`
  );
  const deposits = asList(data?.data || data);

  const { data: contracts } = useApiQuery<any>(["active-contracts"], "/properties/contracts?status=active&limit=200");
  const contractList = asList(contracts?.data || contracts);

  const totalHeld = deposits.filter((d: any) => d.status === "held").reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
  const totalRefunded = deposits.filter((d: any) => d.status === "refunded").reduce((s: number, d: any) => s + Number(d.refundAmount || 0), 0);

  const handleSave = async () => {
    if (!form.contractId || !form.amount) { toast({ title: "العقد والمبلغ مطلوبان", variant: "destructive" }); return; }
    try {
      await apiFetch("/properties/deposits", { method: "POST", body: JSON.stringify({ ...form, contractId: Number(form.contractId), amount: Number(form.amount) }) });
      toast({ title: "تم تسجيل وديعة الضمان" });
      setShowForm(false);
      setForm({ contractId: "", amount: "", receivedDate: new Date().toISOString().split("T")[0], notes: "" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  };

  const handleRefund = async (id: number, originalAmount: number) => {
    const refundAmount = prompt(`مبلغ الاسترداد (الوديعة الأصلية: ${originalAmount} ر.س):`, String(originalAmount));
    const reason = prompt("سبب الاسترداد:");
    if (!refundAmount) return;
    try {
      await apiFetch(`/properties/deposits/${id}/refund`, { method: "PATCH", body: JSON.stringify({
        refundAmount: Number(refundAmount),
        refundDate: new Date().toISOString().split("T")[0],
        refundReason: reason || "إنهاء العقد",
      }) });
      refetch();
      toast({ title: "تم استرداد الوديعة" });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <PageShell
      title="ودائع الضمان"
      subtitle="إدارة ودائع ضمان المستأجرين"
      breadcrumbs={[{ href: "/properties", label: "العقارات" }, { label: "ودائع الضمان" }]}
      actions={
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="w-4 h-4 me-1" /> تسجيل وديعة
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 text-center"><div className="text-xl font-bold">{deposits.length}</div><div className="text-xs text-gray-500">إجمالي الودائع</div></CardContent></Card>
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold text-blue-600">{formatCurrency(totalHeld)}</div>
            <div className="text-xs text-gray-500">ودائع محتجزة</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold text-green-600">{formatCurrency(totalRefunded)}</div>
            <div className="text-xs text-gray-500">مُستردة</div>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">تسجيل وديعة ضمان</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label>العقد *</Label>
              <Select value={form.contractId} onValueChange={(v) => setForm({ ...form, contractId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر عقداً" /></SelectTrigger>
                <SelectContent>
                  {contractList.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.tenantName} — {c.unitNumber || `وحدة #${c.unitId}`}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>مبلغ الوديعة (ر.س) *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>تاريخ الاستلام</Label>
              <Input type="date" value={form.receivedDate} onChange={(e) => setForm({ ...form, receivedDate: e.target.value })} />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button onClick={handleSave}>حفظ</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        {[{ v: "all", l: "الكل" }, { v: "held", l: "محتجزة" }, { v: "refunded", l: "مستردة" }].map(({ v, l }) => (
          <Button key={v} variant={statusFilter === v ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(v)}>{l}</Button>
        ))}
      </div>

      <div className="space-y-2">
        {deposits.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-gray-400">لا توجد ودائع مسجلة</CardContent></Card>
        ) : deposits.map((d: any) => (
          <Card key={d.id} className="hover:shadow-md">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{d.tenantName}</span>
                  <span className="text-sm text-gray-500">— {d.unitNumber || `وحدة #${d.unitId}`} ({d.buildingName || ""})</span>
                  <PageStatusBadge status={d.status} />
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  تاريخ الاستلام: {d.receivedDate?.split("T")[0]}
                  {d.refundDate && ` · تاريخ الاسترداد: ${d.refundDate?.split("T")[0]}`}
                  {d.refundReason && ` · ${d.refundReason}`}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-end">
                  <div className="font-bold text-lg">{formatCurrency(Number(d.amount))}</div>
                  {d.refundAmount && d.refundAmount !== d.amount && (
                    <div className="text-sm text-green-600">مُسترد: {formatCurrency(Number(d.refundAmount))}</div>
                  )}
                </div>
                {d.status === "held" && (
                  <Button size="sm" variant="outline" onClick={() => handleRefund(d.id, Number(d.amount))}>
                    <RotateCcw className="w-3.5 h-3.5 me-1" /> استرداد
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
