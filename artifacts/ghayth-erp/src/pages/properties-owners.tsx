import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Crown, Plus, Pencil, Phone, Building2, Home, Trash2 } from "lucide-react";
import { useAppContext } from "@/contexts/app-context";
import { useToast } from "@/hooks/use-toast";

export default function PropertiesOwners() {
  const { scopeQueryString, permissions, roleLevel } = useAppContext();
  const canManage = permissions.canManageProperty || roleLevel >= 50;
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: ownersResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["property-owners", scopeQueryString],
    `/properties/owners?${scopeQueryString || ""}`
  );
  const owners = asList(ownersResp);

  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(owners, filters, {
    searchFields: ["name", "phone", "nationalId", "crNumber"] as any,
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا المالك؟")) return;
    try {
      await apiFetch(`/properties/owners/${id}`, { method: "DELETE" });
      toast({ title: "تم حذف المالك" });
      qc.invalidateQueries({ queryKey: ["property-owners"] });
      refetch();
    } catch { toast({ variant: "destructive", title: "حدث خطأ أثناء الحذف" }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الملاك</h1>
          <p className="text-gray-500 text-sm mt-1">سجل ملاك العقارات — للعقارات المُدارة لصالح الغير</p>
        </div>
        {canManage && (
          <Link href="/properties/owners/create">
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> إضافة مالك
            </Button>
          </Link>
        )}
      </div>

      <AdvancedFilters
        config={{ searchPlaceholder: "بحث بالاسم أو الهاتف أو رقم الهوية...", showDateRange: false }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(sortedData || [], [
          { key: "name", label: "الاسم" },
          { key: "phone", label: "الهاتف" },
          { key: "nationalId", label: "رقم الهوية" },
          { key: "buildingCount", label: "المباني" },
          { key: "unitCount", label: "الوحدات" },
        ], "الملاك")}
        resultCount={sortedData?.length}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" /> قائمة الملاك
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="name" label="الاسم" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="ownerType" label="النوع" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="phone" label="الهاتف" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="buildingCount" label="المباني" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="unitCount" label="الوحدات" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="activeContracts" label="العقود النشطة" sortState={sortState} onSort={handleSort} />
                <TableHead className="text-start">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <DataTableWrapper
              isLoading={isLoading}
              isError={isError}
              error={error}
              onRetry={refetch}
              data={filtered}
              colCount={7}
              emptyMessage="لا يوجد ملاك مسجلون"
              emptyIcon={<Crown className="h-6 w-6 text-slate-400" />}
            >
              {sortedData?.map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold shrink-0">
                        {(o.name || "?")[0]}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{o.name}</p>
                        {o.nationalId && <p className="text-xs text-gray-400 font-mono">{o.nationalId}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{o.ownerType === "company" ? "شركة" : "فرد"}</Badge>
                  </TableCell>
                  <TableCell>
                    {o.phone ? (
                      <a href={`tel:${o.phone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {o.phone}
                      </a>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center gap-1"><Building2 className="h-3 w-3 text-gray-400" /> {Number(o.buildingCount) || 0}</div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center gap-1"><Home className="h-3 w-3 text-gray-400" /> {Number(o.unitCount) || 0}</div>
                  </TableCell>
                  <TableCell>
                    {Number(o.activeContracts) > 0 ? (
                      <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1">{o.activeContracts} نشط</Badge>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
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
                  </TableCell>
                </TableRow>
              ))}
            </DataTableWrapper>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
