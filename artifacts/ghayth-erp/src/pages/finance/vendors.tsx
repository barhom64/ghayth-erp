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
import { PageShell } from "@/components/page-shell";

/**
 * Vendors list — migrated in R.2 iter 2 to the unified template stack.
 *
 * Before: raw <h1>, inline Card KPIs, no breadcrumbs, no subtitle.
 * After: PageShell with title + subtitle + breadcrumbs + actions slot,
 * KPI cards kept as-is (they already follow the dashboard's pattern).
 *
 * No data, endpoint, table, filter, or row-click behaviour changed.
 * The migration is purely structural — the create button and the
 * rest of the toolbar moved into the shell's `actions` slot.
 *
 * Delete: vendors has no inline delete action on the list page.
 * Delete flows through the vendor detail page (which is a separate
 * migration target for a later iteration). The Phase C.7b delete
 * guard on `DELETE /finance/vendors/:id` (refuses vendors with open
 * POs / PRs) is exercised through `ConfirmDeleteDialog` in
 * `accounts.tsx` in this same iteration as the reference demo.
 */
export default function VendorsPage() {
  const [location, navigate] = useLocation();
  const isWarehouseContext = location.startsWith("/warehouse");
  const createPath = isWarehouseContext ? "/warehouse/suppliers/create" : "/finance/vendors/create";
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["vendors", scopeQueryString],
    `/finance/vendors${scopeSuffix}`,
  );
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
      render: (v) => (
        <span className="font-medium text-blue-700 hover:text-blue-900 hover:underline cursor-pointer">
          {v.name}
        </span>
      ),
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
    <PageShell
      title="الموردون"
      subtitle="إدارة بيانات الموردين وأرقام التواصل والتصنيفات"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الموردون" }]}
      loading={isLoading}
      actions={
        <Button size="sm" asChild>
          <Link href={createPath}>
            <Plus className="h-4 w-4 me-1" />
            إضافة مورد
          </Link>
        </Button>
      }
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-blue-50 border border-blue-100">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.length}</p>
              <p className="text-xs text-muted-foreground">إجمالي الموردين</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-emerald-50 border border-emerald-100">
              <Building2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{categories.length}</p>
              <p className="text-xs text-muted-foreground">التصنيفات</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-violet-50 border border-violet-100">
              <Star className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-violet-600">{items.length}</p>
              <p className="text-xs text-muted-foreground">نشطون</p>
            </div>
          </CardContent>
        </Card>
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
        onRowClick={(v) => navigate(`/finance/vendors/${v.id}`)}
        pageSize={pageSize}
        emptyMessage="لا يوجد موردين"
        emptyIcon={<Users className="h-6 w-6 text-slate-400" />}
        noToolbar
      />
    </PageShell>
  );
}
