import { useLocation } from "wouter";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { AlertTriangle, DollarSign, Clock, Zap, XCircle } from "lucide-react";
import { AdvancedFilters, useFilters } from "@/components/shared/advanced-filters";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";

export default function UmrahPenalties() {
  const [, navigate] = useLocation();
  const { data: resp, isLoading, isError, error, refetch } = useApiQuery<any>(["umrah-penalties"], "/umrah/penalties");
  const [filters, setFilters] = useFilters();
  const { toast } = useToast();
  const pageSize = 20;
  const items = resp?.data || [];

  const waiveMutation = useApiMutation<any, { id: number; reason: string }>(
    (body) => `/umrah/penalties/${body.id}/waive`,
    "PATCH",
    [["umrah-penalties"]],
    { successMessage: "تم إعفاء الغرامة بنجاح" }
  );

  const runPenaltyEngine = async () => {
    try {
      const res = await apiFetch<any>("/umrah/run-penalty-engine", { method: "POST", body: JSON.stringify({}) });
      toast({ title: `تم إنشاء ${res.penaltiesCreated ?? 0} غرامة جديدة` });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "خطأ في تشغيل محرك الغرامات" });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const filteredItems = items.filter((p: any) => {
    if (filters.status && p.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return p.pilgrimName?.toLowerCase().includes(q) || p.passportNumber?.toLowerCase().includes(q) || p.agentName?.toLowerCase().includes(q);
    }
    return true;
  });

  const totalAmount = items.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const pendingCount = items.filter((p: any) => p.status === "pending").length;

  const kpiCards = [
    { label: "إجمالي الغرامات", value: items.length, icon: AlertTriangle, color: "text-blue-600 bg-blue-50" },
    { label: "معلقة", value: pendingCount, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "إجمالي المبالغ (ريال)", value: formatCurrency(totalAmount), icon: DollarSign, color: "text-red-600 bg-red-50" },
  ];

  const handleWaive = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    waiveMutation.mutate({ id, reason: "إعفاء إداري" });
  };

  const columns: DataTableColumn<any>[] = [
    { key: "pilgrimName", header: "المعتمر", render: (p) => <span className="font-medium">{p.pilgrimName}</span> },
    { key: "passportNumber", header: "الجواز" },
    { key: "agentName", header: "الوكيل" },
    { key: "type", header: "النوع", render: (p) => p.type === "overstay" ? "تجاوز مدة" : p.type },
    { key: "daysOverstayed", header: "أيام التأخر" },
    { key: "amount", header: "المبلغ (ريال)", render: (p) => <span className="font-bold text-red-600">{formatCurrency(Number(p.amount))}</span> },
    { key: "status", header: "الحالة", render: (p) => <PageStatusBadge status={p.status} /> },
    {
      key: "actions" as any,
      header: "إجراءات",
      render: (p) =>
        p.status === "pending" ? (
          <Button variant="ghost" size="sm" className="text-orange-600 gap-1" onClick={(e) => handleWaive(e, p.id)}>
            <XCircle className="h-3.5 w-3.5" />إعفاء
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">الغرامات</h1>
        <Button variant="outline" onClick={runPenaltyEngine} className="gap-2">
          <Zap className="h-4 w-4" />تشغيل محرك الغرامات
        </Button>
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

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الجواز أو الوكيل...",
          statuses: [
            { value: "pending", label: "معلقة" },
            { value: "invoiced", label: "مفوترة" },
            { value: "paid", label: "مدفوعة" },
            { value: "waived", label: "معفاة" },
            { value: "cancelled", label: "ملغية" },
          ],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filteredItems.length}
      />

      <DataTable
        columns={columns}
        data={filteredItems}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا يوجد غرامات"
        emptyIcon={<AlertTriangle className="h-6 w-6 text-slate-400" />}
        noToolbar
        pageSize={pageSize}
        onRowClick={(row) => navigate(`/umrah/penalties/${row.id}`)}
      />
    </div>
  );
}
