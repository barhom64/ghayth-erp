import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageStatusBadge } from "@/components/page-status-badge";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { ApprovalActions } from "@/components/approval-actions";
import { Wrench, Plus } from "lucide-react";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@/components/page-shell";

export default function PropertiesMaintenance() {
  const { data: requestsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["maintenance-requests"],
    "/properties/maintenance-requests"
  );
  const requests = asList(requestsResp);
  const [filters, setFilters] = useFilters();
  const [maintSearch, setMaintSearch] = useState("");
  const { permissions, roleLevel } = useAppContext();
  const canApprove = permissions.canManageProperty || roleLevel >= 70;

  if (isLoading) return <PageShell title="طلبات الصيانة" breadcrumbs={[{ href: "/properties/dashboard", label: "إدارة الأملاك" }, { label: "طلبات الصيانة" }]}><LoadingSpinner /></PageShell>;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const searchFiltered = requests.filter((r: any) =>
    !maintSearch || r.unitNumber?.includes(maintSearch) || r.buildingName?.includes(maintSearch) || r.description?.includes(maintSearch)
  );
  const filtered = applyFilters(searchFiltered, filters, {
    searchFields: ["unitNumber", "buildingName", "description"] as any,
    statusField: "status" as any,
  });

  const columns: DataTableColumn<any>[] = [
    { key: "unitNumber", header: "الوحدة", sortable: true, render: (r) => r.unitNumber || "-" },
    { key: "buildingName", header: "المبنى", sortable: true, render: (r) => r.buildingName || "-" },
    { key: "category", header: "الفئة", sortable: true, render: (r) => r.category || "-" },
    { key: "description", header: "الوصف", sortable: true, className: "max-w-[200px] truncate" },
    { key: "priority", header: "الأولوية", sortable: true, render: (r) => <PageStatusBadge status={r.priority} /> },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <PageStatusBadge status={r.status} /> },
    {
      key: "action",
      header: "إجراء",
      hidden: !canApprove,
      render: (r) => (
        <ApprovalActions
          entityType="maintenance_request"
          entityId={r.id}
          currentStatus={r.status || "pending"}
          approveEndpoint={`/properties/maintenance-requests/${r.id}/approve`}
          rejectEndpoint={`/properties/maintenance-requests/${r.id}/approve`}
          returnEndpoint={`/properties/maintenance-requests/${r.id}/approve`}
          approveMethod="PATCH"
          rejectMethod="PATCH"
          returnMethod="PATCH"
          approveBody={(notes) => ({ approved: true, notes })}
          rejectBody={(notes) => ({ approved: false, notes })}
          returnBody={(notes) => ({ approved: "returned", notes })}
          onDone={() => refetch()}
        />
      ),
    },
  ];

  return (
    <PageShell
      title="طلبات الصيانة"
      subtitle="إدارة ومتابعة طلبات الصيانة"
      breadcrumbs={[{ href: "/properties/dashboard", label: "إدارة الأملاك" }, { label: "طلبات الصيانة" }]}
      actions={
        <Link href="/properties/maintenance/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> طلب صيانة جديد</Button>
        </Link>
      }
    >
      <div className="flex items-center gap-4">
        <div className="flex-1 flex flex-col gap-2">
          <Input placeholder="بحث سريع..." value={maintSearch} onChange={(e) => setMaintSearch(e.target.value)} />
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالوحدة أو المبنى أو الوصف...",
              statuses: [
                { value: "open", label: "مفتوح" },
                { value: "in_progress", label: "جاري" },
                { value: "completed", label: "مكتمل" },
                { value: "closed", label: "مغلق" },
              ],
              showDateRange: false,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered || [], [
              { key: "unitNumber", label: "الوحدة" },
              { key: "buildingName", label: "المبنى" },
              { key: "category", label: "الفئة" },
              { key: "description", label: "الوصف" },
              { key: "priority", label: "الأولوية" },
              { key: "status", label: "الحالة" },
            ], "طلبات_الصيانة")}
            resultCount={filtered?.length}
          />
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-orange-500" /> طلبات الصيانة</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد طلبات"
            emptyIcon={<Wrench className="h-6 w-6 text-slate-400" />}
            noToolbar
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
