import { Link } from "wouter";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { PageShell } from "@/components/page-shell";
import { Crown, Plus, Pencil, Phone, Building2, Home, Trash2 } from "lucide-react";
import { useAppContext } from "@/contexts/app-context";

export default function PropertiesOwners() {
  const { scopeQueryString, permissions, roleLevel } = useAppContext();
  const canManage = permissions.canManageProperty || roleLevel >= 50;

  const { data: ownersResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["property-owners", scopeQueryString],
    `/properties/owners?${scopeQueryString || ""}`
  );
  const owners = asList(ownersResp);

  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(owners, filters, {
    searchFields: ["name", "phone", "nationalId", "crNumber"] as any,
  });

  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `/properties/owners/${body.id}`,
    "DELETE",
    [["property-owners"]],
    { successMessage: "تم حذف المالك" }
  );

  const handleDelete = (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا المالك؟")) return;
    deleteMut.mutate({ id });
  };

  const columns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "الاسم",
      sortable: true,
      render: (o) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold shrink-0">
            {(o.name || "?")[0]}
          </div>
          <div>
            <p className="font-medium text-sm">{o.name}</p>
            {o.nationalId && <p className="text-xs text-gray-400 font-mono">{o.nationalId}</p>}
          </div>
        </div>
      ),
    },
    {
      key: "ownerType",
      header: "النوع",
      sortable: true,
      render: (o) => <Badge variant="outline" className="text-xs">{o.ownerType === "company" ? "شركة" : "فرد"}</Badge>,
    },
    {
      key: "phone",
      header: "الهاتف",
      sortable: true,
      render: (o) => o.phone ? (
        <a href={`tel:${o.phone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
          <Phone className="h-3 w-3" /> {o.phone}
        </a>
      ) : "—",
    },
    {
      key: "buildingCount",
      header: "المباني",
      sortable: true,
      align: "center",
      render: (o) => <div className="flex items-center gap-1"><Building2 className="h-3 w-3 text-gray-400" /> {Number(o.buildingCount) || 0}</div>,
    },
    {
      key: "unitCount",
      header: "الوحدات",
      sortable: true,
      align: "center",
      render: (o) => <div className="flex items-center gap-1"><Home className="h-3 w-3 text-gray-400" /> {Number(o.unitCount) || 0}</div>,
    },
    {
      key: "activeContracts",
      header: "العقود النشطة",
      sortable: true,
      render: (o) => Number(o.activeContracts) > 0 ? (
        <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1">{o.activeContracts} نشط</Badge>
      ) : <span className="text-gray-400 text-xs">—</span>,
    },
    {
      key: "actions",
      header: "الإجراءات",
      render: (o) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canManage && (
            <>
              <Link href={`/properties/owners/${o.id}/edit`}>
                <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
                  <Pencil className="h-3 w-3" /> تعديل
                </Button>
              </Link>
              <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 text-red-500 hover:text-red-700" onClick={() => handleDelete(o.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="الملاك"
      subtitle="سجل ملاك العقارات — للعقارات المُدارة لصالح الغير"
      breadcrumbs={[{ href: "/properties", label: "إدارة الأملاك" }]}
      actions={canManage && (
        <Link href="/properties/owners/create">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> إضافة مالك
          </Button>
        </Link>
      )}
    >

      <AdvancedFilters
        config={{ searchPlaceholder: "بحث بالاسم أو الهاتف أو رقم الهوية...", showDateRange: false }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(filtered || [], [
          { key: "name", label: "الاسم" },
          { key: "phone", label: "الهاتف" },
          { key: "nationalId", label: "رقم الهوية" },
          { key: "buildingCount", label: "المباني" },
          { key: "unitCount", label: "الوحدات" },
        ], "الملاك")}
        resultCount={filtered?.length}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" /> قائمة الملاك
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا يوجد ملاك مسجلون"
            emptyIcon={<Crown className="h-6 w-6 text-slate-400" />}
            noToolbar
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
