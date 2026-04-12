import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SortableTableHead } from "@/components/sortable-table-head";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { ApprovalActions } from "@/components/approval-actions";
import { useSortedData } from "@/hooks/use-sorted-data";
import { Wrench, Plus } from "lucide-react";
import { useAppContext } from "@/contexts/app-context";

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
  const searchFiltered = requests.filter((r: any) =>
    !maintSearch || r.unitNumber?.includes(maintSearch) || r.buildingName?.includes(maintSearch) || r.description?.includes(maintSearch)
  );
  const filtered = applyFilters(searchFiltered, filters, {
    searchFields: ["unitNumber", "buildingName", "description"] as any,
    statusField: "status" as any,
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">طلبات الصيانة</h1>
          <p className="text-gray-500 text-sm mt-1">إدارة ومتابعة طلبات الصيانة</p>
        </div>
        <Link href="/properties/maintenance/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> طلب صيانة جديد</Button>
        </Link>
      </div>

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
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "unitNumber", label: "الوحدة" },
              { key: "buildingName", label: "المبنى" },
              { key: "category", label: "الفئة" },
              { key: "description", label: "الوصف" },
              { key: "priority", label: "الأولوية" },
              { key: "status", label: "الحالة" },
            ], "طلبات_الصيانة")}
            resultCount={sortedData?.length}
          />
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-orange-500" /> طلبات الصيانة</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="unitNumber" label="الوحدة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="buildingName" label="المبنى" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="category" label="الفئة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="description" label="الوصف" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="priority" label="الأولوية" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
                {canApprove && <TableHead className="text-start">إجراء</TableHead>}
              </TableRow>
            </TableHeader>
            <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={canApprove ? 7 : 6} emptyMessage="لا توجد طلبات" emptyIcon={<Wrench className="h-6 w-6 text-slate-400" />}>
              {sortedData?.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.unitNumber || "-"}</TableCell>
                  <TableCell>{r.buildingName || "-"}</TableCell>
                  <TableCell>{r.category || "-"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
                  <TableCell><StatusBadge status={r.priority} /></TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  {canApprove && (
                    <TableCell>
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
                        onDone={() => refetch()}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </DataTableWrapper>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
