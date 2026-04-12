import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Plus, Users, Phone, Mail, Star, Building2 } from "lucide-react";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

export default function VendorsPage() {
  const [location] = useLocation();
  const isWarehouseContext = location.startsWith("/warehouse");
  const createPath = isWarehouseContext ? "/warehouse/suppliers/create" : "/finance/vendors/create";
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["vendors", scopeQueryString], `/finance/vendors${scopeSuffix}`);
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filtered = applyFilters(items, filters, {
    searchFields: ["name", "contactPerson", "category"],
  });

  const categories = [...new Set((items || []).map((v: any) => v.category).filter(Boolean))];

  const columns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "الاسم",
      sortable: true,
      render: (v) => <span className="font-medium">{v.name}</span>,
    },
    {
      key: "contactPerson",
      header: "جهة الاتصال",
      sortable: true,
      render: (v) => <span className="text-gray-500">{v.contactPerson || "-"}</span>,
    },
    {
      key: "phone",
      header: "الهاتف",
      sortable: true,
      render: (v) => v.phone
        ? <span className="flex items-center gap-1 text-gray-600"><Phone className="h-3 w-3" />{v.phone}</span>
        : "-",
    },
    {
      key: "email",
      header: "البريد",
      sortable: true,
      render: (v) => v.email
        ? <span className="flex items-center gap-1 text-gray-600"><Mail className="h-3 w-3" />{v.email}</span>
        : "-",
    },
    {
      key: "taxNumber",
      header: "الرقم الضريبي",
      sortable: true,
      render: (v) => <span className="font-mono text-sm text-gray-500">{v.taxNumber || "-"}</span>,
    },
    {
      key: "category",
      header: "التصنيف",
      sortable: true,
      render: (v) => v.category ? <Badge variant="outline">{v.category}</Badge> : "-",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">الموردين</h1>
        <Link href={createPath}>
          <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة مورد</Button>
        </Link>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-50"><Users className="w-6 h-6 text-blue-600" /></div>
          <div><p className="text-2xl font-bold">{items.length}</p><p className="text-xs text-gray-500">إجمالي الموردين</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-green-50"><Building2 className="w-6 h-6 text-green-600" /></div>
          <div><p className="text-2xl font-bold">{categories.length}</p><p className="text-xs text-gray-500">التصنيفات</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-purple-50"><Star className="w-6 h-6 text-purple-600" /></div>
          <div><p className="text-2xl font-bold text-purple-600">{items.length}</p><p className="text-xs text-gray-500">نشطين</p></div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو التصنيف...",
          showDateRange: false,
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        onExportCSV={() => exportToCSV((filtered || []) as any[], [
          { key: "name", label: "الاسم" },
          { key: "contactPerson", label: "جهة الاتصال" },
          { key: "phone", label: "الهاتف" },
          { key: "email", label: "البريد" },
          { key: "taxNumber", label: "الرقم الضريبي" },
          { key: "category", label: "التصنيف" },
        ], "الموردين")}
        resultCount={filtered?.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        pageSize={pageSize}
        emptyMessage="لا يوجد موردين"
        emptyIcon={<Users className="h-6 w-6 text-slate-400" />}
        noToolbar
      />
    </div>
  );
}
