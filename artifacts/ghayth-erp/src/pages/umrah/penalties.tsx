import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { AlertTriangle, DollarSign, Clock } from "lucide-react";
import { AdvancedFilters, useFilters } from "@/components/shared/advanced-filters";
import { cn } from "@/lib/utils";

export default function UmrahPenalties() {
  const { data: resp, isLoading, isError, error, refetch } = useApiQuery<any>(["umrah-penalties"], "/umrah/penalties");
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const items = resp?.data || [];

  const filteredItems = items.filter((p: any) => {
    if (filters.status && p.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return p.pilgrimName?.toLowerCase().includes(q) || p.passportNumber?.toLowerCase().includes(q) || p.agentName?.toLowerCase().includes(q);
    }
    return true;
  });

  const paginatedItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);
  const totalAmount = items.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const pendingCount = items.filter((p: any) => p.status === "pending").length;

  const kpiCards = [
    { label: "إجمالي الغرامات", value: items.length, icon: AlertTriangle, color: "text-blue-600 bg-blue-50" },
    { label: "معلقة", value: pendingCount, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "إجمالي المبالغ (ريال)", value: totalAmount.toLocaleString(), icon: DollarSign, color: "text-red-600 bg-red-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">الغرامات</h1>
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
            { value: "cancelled", label: "ملغية" },
          ],
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        resultCount={filteredItems.length}
      />

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-start">المعتمر</TableHead>
            <TableHead className="text-start">الجواز</TableHead>
            <TableHead className="text-start">الوكيل</TableHead>
            <TableHead className="text-start">النوع</TableHead>
            <TableHead className="text-start">أيام التأخر</TableHead>
            <TableHead className="text-start">المبلغ (ريال)</TableHead>
            <TableHead className="text-start">الحالة</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={() => refetch()}
            data={filteredItems}
            colCount={7}
            emptyMessage="لا يوجد غرامات"
            emptyIcon={<AlertTriangle className="h-6 w-6 text-slate-400" />}
          >
            {paginatedItems.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.pilgrimName}</TableCell>
                <TableCell>{p.passportNumber}</TableCell>
                <TableCell>{p.agentName}</TableCell>
                <TableCell>{p.type === "overstay" ? "تجاوز مدة" : p.type}</TableCell>
                <TableCell>{p.daysOverstayed}</TableCell>
                <TableCell className="font-bold text-red-600">{Number(p.amount).toLocaleString()}</TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
              </TableRow>
            ))}
          </DataTableWrapper>
        </Table>
        <PaginationBar page={page} pageSize={pageSize} total={filteredItems.length} onPageChange={setPage} />
      </div>
    </div>
  );
}
