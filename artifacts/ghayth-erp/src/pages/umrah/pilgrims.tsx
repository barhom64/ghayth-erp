import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Button } from "@/components/ui/button";
import { Plus, Users, AlertTriangle, Plane, UserPlus } from "lucide-react";
import { Link, useLocation } from "wouter";
import { AdvancedFilters, useFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function UmrahPilgrims() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data: resp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["umrah-pilgrims", filters.search, filters.status, String(page)],
    `/umrah/pilgrims?search=${encodeURIComponent(filters.search)}&status=${filters.status || ""}&page=${page}&limit=${pageSize}`
  );
  const items = resp?.data || [];
  const total = resp?.total || 0;

  const kpiCards = [
    { label: "إجمالي المعتمرين", value: total, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "داخل المملكة", value: (items ?? []).filter((p: any) => ["arrived", "active"].includes(p.status)).length, icon: Plane, color: "text-green-600 bg-green-50" },
    { label: "متأخرين", value: (items ?? []).filter((p: any) => p.status === "overstayed").length, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "بدون وكيل", value: (items ?? []).filter((p: any) => !p.agentId).length, icon: UserPlus, color: "text-orange-600 bg-orange-50" },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const columns: DataTableColumn<any>[] = [
    {
      key: "fullName",
      header: "الاسم",
      sortable: true,
      render: (p) => (
        <Link href={`/umrah/pilgrims/${p.id}`} className="text-primary hover:underline font-medium">{p.fullName}</Link>
      ),
    },
    { key: "passportNumber", header: "الجواز", sortable: true },
    { key: "nationality", header: "الجنسية", sortable: true },
    {
      key: "agentName",
      header: "الوكيل",
      sortable: true,
      render: (p) => p.agentName || <span className="text-orange-500">غير معيّن</span>,
    },
    {
      key: "arrivalDate",
      header: "الوصول",
      sortable: true,
      render: (p) => formatDateAr(p.arrivalDate),
    },
    {
      key: "departureDate",
      header: "المغادرة",
      sortable: true,
      render: (p) => formatDateAr(p.departureDate),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (p) => <PageStatusBadge status={p.status} />,
    },
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

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا يوجد معتمرين"
        emptyIcon={<Users className="h-6 w-6 text-slate-400" />}
        pageSize={pageSize}
        page={page}
        total={total}
        onPageChange={setPage}
        noToolbar
        onRowClick={(row) => navigate(`/umrah/pilgrims/${row.id}`)}
      />
    </div>
  );
}
