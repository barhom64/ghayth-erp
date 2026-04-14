import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Receipt, DollarSign, FileText } from "lucide-react";
import { AdvancedFilters, useFilters } from "@/components/shared/advanced-filters";
import { cn } from "@/lib/utils";

export default function UmrahInvoices() {
  const { data: resp, refetch, isLoading, isError, error } = useApiQuery<any>(["umrah-agent-invoices"], "/umrah/agent-invoices");
  const { data: agents } = useApiQuery<any>(["umrah-agents"], "/umrah/agents");
  const { data: seasons } = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const items = resp?.data || [];
  const [filters, setFilters] = useFilters();
  const [genAgent, setGenAgent] = useState("");
  const [genSeason, setGenSeason] = useState("");
  const pageSize = 20;
  const { toast } = useToast();

  const generate = async () => {
    try {
      await apiFetch("/umrah/agent-invoices/generate", { method: "POST", body: JSON.stringify({ agentId: Number(genAgent), seasonId: Number(genSeason) }) });
      toast({ title: "تم إنشاء الفاتورة" });
      refetch();
    } catch (err: any) { toast({ variant: "destructive", title: err?.error || "خطأ" }); }
  };

  const filteredItems = items.filter((inv: any) => {
    if (filters.status && inv.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return inv.ref?.toLowerCase().includes(q) || inv.agentName?.toLowerCase().includes(q) || inv.seasonTitle?.toLowerCase().includes(q);
    }
    return true;
  });

  const totalAmount = items.reduce((sum: number, inv: any) => sum + Number(inv.total || 0), 0);
  const paidAmount = items.filter((inv: any) => inv.status === "paid").reduce((sum: number, inv: any) => sum + Number(inv.total || 0), 0);

  const kpiCards = [
    { label: "إجمالي الفواتير", value: items.length, icon: FileText, color: "text-blue-600 bg-blue-50" },
    { label: "الإجمالي (ريال)", value: totalAmount.toLocaleString(), icon: DollarSign, color: "text-purple-600 bg-purple-50" },
    { label: "المدفوع (ريال)", value: paidAmount.toLocaleString(), icon: Receipt, color: "text-green-600 bg-green-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">فواتير الوكلاء</h1>
      </div>

      <div className="grid gap-4 grid-cols-3">
        {kpiCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <Label>الوكيل</Label>
            <Select value={genAgent} onValueChange={setGenAgent}>
              <SelectTrigger><SelectValue placeholder="اختر الوكيل" /></SelectTrigger>
              <SelectContent>
                {(agents?.data || []).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label>الموسم</Label>
            <Select value={genSeason} onValueChange={setGenSeason}>
              <SelectTrigger><SelectValue placeholder="اختر الموسم" /></SelectTrigger>
              <SelectContent>
                {(seasons?.data || []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generate} disabled={!genAgent || !genSeason} className="gap-2">
            <Receipt className="h-4 w-4" />إنشاء فاتورة
          </Button>
        </CardContent>
      </Card>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمرجع أو الوكيل أو الموسم...",
          statuses: [
            { value: "draft", label: "مسودة" },
            { value: "sent", label: "مرسلة" },
            { value: "paid", label: "مدفوعة" },
            { value: "cancelled", label: "ملغية" },
          ],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filteredItems.length}
      />

      <DataTable
        columns={[
          { key: "ref", header: "المرجع", render: (inv) => <span className="font-mono text-sm">{inv.ref}</span> },
          { key: "agentName", header: "الوكيل" },
          { key: "seasonTitle", header: "الموسم" },
          { key: "pilgrimCount", header: "عدد المعتمرين" },
          { key: "servicesTotal", header: "الخدمات (ريال)", render: (inv) => Number(inv.servicesTotal).toLocaleString() },
          { key: "penaltiesTotal", header: "الغرامات (ريال)", render: (inv) => <span className="text-red-600">{Number(inv.penaltiesTotal).toLocaleString()}</span> },
          { key: "total", header: "الإجمالي (ريال)", render: (inv) => <span className="font-bold">{Number(inv.total).toLocaleString()}</span> },
          { key: "status", header: "الحالة", render: (inv) => <StatusBadge status={inv.status} /> },
        ] as DataTableColumn<any>[]}
        data={filteredItems}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا يوجد فواتير"
        emptyIcon={<Receipt className="h-6 w-6 text-slate-400" />}
        noToolbar
        pageSize={pageSize}
      />
    </div>
  );
}
