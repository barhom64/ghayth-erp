import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Plus, Users, AlertTriangle, Plane, UserPlus } from "lucide-react";
import { Link } from "wouter";
import { AdvancedFilters, useFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useSortedData } from "@/hooks/use-sorted-data";
import { cn } from "@/lib/utils";

export default function UmrahPilgrims() {
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data: resp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["umrah-pilgrims", filters.search, filters.status, String(page)],
    `/umrah/pilgrims?search=${encodeURIComponent(filters.search)}&status=${filters.status || ""}&page=${page}&limit=${pageSize}`
  );
  const rawItems: any[] = resp?.data ?? [];
  const total = resp?.total ?? 0;
  const { sortedData: items, sortState, handleSort } = useSortedData(rawItems);

  const kpiCards = [
    { label: "إجمالي المعتمرين", value: total, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "داخل المملكة", value: (items ?? []).filter((p: any) => ["arrived", "active"].includes(p.status)).length, icon: Plane, color: "text-green-600 bg-green-50" },
    { label: "متأخرين", value: (items ?? []).filter((p: any) => p.status === "overstayed").length, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "بدون وكيل", value: (items ?? []).filter((p: any) => !p.agentId).length, icon: UserPlus, color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">المعتمرين</h1>
          <p className="text-sm text-muted-foreground mt-0.5">متابعة ملفات المعتمرين وحالاتهم</p>
        </div>
        <Link href="/umrah/pilgrims/create">
          <Button className="gap-2"><Plus className="h-4 w-4" />إضافة معتمر</Button>
        </Link>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
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
          searchPlaceholder: "بحث بالاسم أو رقم الجواز...",
          statuses: [
            { value: "pending", label: "لم يصل" },
            { value: "arrived", label: "وصل" },
            { value: "active", label: "نشط" },
            { value: "overstayed", label: "متأخر" },
            { value: "departed", label: "غادر" },
            { value: "violated", label: "مخالف" },
            { value: "cancelled", label: "ملغي" },
          ],
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        onExportCSV={() => exportToCSV(items ?? [], [
          { key: "fullName", label: "الاسم" },
          { key: "passportNumber", label: "الجواز" },
          { key: "nationality", label: "الجنسية" },
          { key: "status", label: "الحالة" },
          { key: "agentName", label: "الوكيل" },
        ], "المعتمرين")}
        resultCount={total}
      />

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader><TableRow>
            <SortableTableHead column="fullName" label="الاسم" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="passportNumber" label="الجواز" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="nationality" label="الجنسية" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="agentName" label="الوكيل" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="arrivalDate" label="الوصول" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="departureDate" label="المغادرة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <DataTableWrapper
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={() => refetch()}
            data={items}
            colCount={7}
            emptyMessage="لا يوجد معتمرين"
            emptyIcon={<Users className="h-6 w-6 text-slate-400" />}
          >
            {(items ?? []).map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link href={`/umrah/pilgrims/${p.id}`} className="text-primary hover:underline">{p.fullName}</Link>
                </TableCell>
                <TableCell>{p.passportNumber}</TableCell>
                <TableCell>{p.nationality}</TableCell>
                <TableCell>{p.agentName || <span className="text-orange-500">غير معيّن</span>}</TableCell>
                <TableCell>{p.arrivalDate ? new Date(p.arrivalDate).toLocaleDateString("ar-SA") : "-"}</TableCell>
                <TableCell>{p.departureDate ? new Date(p.departureDate).toLocaleDateString("ar-SA") : "-"}</TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
              </TableRow>
            ))}
          </DataTableWrapper>
        </Table>
        <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </div>
    </div>
  );
}
