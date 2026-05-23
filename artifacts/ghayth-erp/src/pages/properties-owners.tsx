import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { Crown, Plus, Pencil, Phone, Building2, Home, Trash2 } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useAppContext } from "@/contexts/app-context";

export default function PropertiesOwners() {
  const [, navigate] = useLocation();
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

  // Delete dialog state. The previous `confirm()` window dialog
  // blocked the event loop, ignored RTL, and gave no preview of the
  // impact (units, contracts, etc. that reference this owner). The
  // shared ConfirmDeleteDialog fetches /impact-preview before the
  // user even confirms, and surfaces server-side 409 blockers
  // inline rather than as a generic toast.
  const [deletingOwner, setDeletingOwner] = useState<{ id: number; name: string } | null>(null);

  const columns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "الاسم",
      sortable: true,
      render: (o) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-status-warning-surface text-status-warning-foreground flex items-center justify-center text-xs font-bold shrink-0">
            {(o.name || "?")[0]}
          </div>
          <div>
            <p className="font-medium text-sm">{o.name}</p>
            {o.nationalId && <p className="text-xs text-muted-foreground font-mono">{o.nationalId}</p>}
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
        <a href={`tel:${o.phone}`} className="text-sm text-status-info-foreground hover:underline flex items-center gap-1">
          <Phone className="h-3 w-3" /> {o.phone}
        </a>
      ) : "—",
    },
    {
      key: "buildingCount",
      header: "المباني",
      sortable: true,
      align: "center",
      render: (o) => <div className="flex items-center gap-1"><Building2 className="h-3 w-3 text-muted-foreground" /> {Number(o.buildingCount) || 0}</div>,
    },
    {
      key: "unitCount",
      header: "الوحدات",
      sortable: true,
      align: "center",
      render: (o) => <div className="flex items-center gap-1"><Home className="h-3 w-3 text-muted-foreground" /> {Number(o.unitCount) || 0}</div>,
    },
    {
      key: "activeContracts",
      header: "العقود النشطة",
      sortable: true,
      render: (o) => Number(o.activeContracts) > 0 ? (
        <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1">{o.activeContracts} نشط</Badge>
      ) : <span className="text-muted-foreground text-xs">—</span>,
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
              <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 text-status-error hover:text-status-error-foreground" onClick={() => setDeletingOwner({ id: o.id, name: o.name || "—" })}>
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
          <GuardedButton perm="property:create" className="gap-2">
            <Plus className="h-4 w-4" /> إضافة مالك
          </GuardedButton>
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
            <Crown className="h-5 w-5 text-status-warning" /> قائمة الملاك
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
            onRowClick={(row) => navigate(`/properties/owners/${row.id}`)}
          />
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={deletingOwner !== null}
        onOpenChange={(v) => { if (!v) setDeletingOwner(null); }}
        entity={{
          type: "property_owner",
          id: deletingOwner?.id ?? 0,
          name: deletingOwner?.name ?? "",
        }}
        deletePath={`/properties/owners/${deletingOwner?.id}`}
        invalidateKeys={[["property-owners"]]}
        successMessage="تم حذف المالك"
        onDeleted={() => setDeletingOwner(null)}
      />
    </PageShell>
  );
}
