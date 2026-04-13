import { useState, Fragment } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { SortableTableHead } from "@/components/sortable-table-head";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useSortedData } from "@/hooks/use-sorted-data";
import {
  Users2, Plus, Eye, Phone, Mail, FileText, Banknote, ChevronDown, ChevronUp
} from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useAppContext } from "@/contexts/app-context";
import { cn } from "@/lib/utils";

export default function PropertiesTenants() {
  const { scopeQueryString, permissions, roleLevel } = useAppContext();
  const canManage = permissions.canManageProperty || roleLevel >= 50;
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";

  const { data: tenantsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["property-tenants-list", scopeQueryString],
    `/properties/tenants/list?${scopeQueryString || ""}`
  );
  const tenants = asList(tenantsResp);

  const [filters, setFilters] = useFilters();
  const [expandedId, setExpandedId] = useState<any>(null);
  const filtered = applyFilters(tenants, filters, {
    searchFields: ["name", "phone", "email", "nationalId"] as any,
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">المستأجرون</h1>
          <p className="text-gray-500 text-sm mt-1">سجل كامل لجميع المستأجرين الحاليين والسابقين</p>
        </div>
        <Link href="/properties/tenants/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> مستأجر جديد</Button>
        </Link>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الهاتف أو رقم الهوية...",
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(sortedData || [], [
          { key: "name", label: "الاسم" },
          { key: "phone", label: "الهاتف" },
          { key: "email", label: "البريد" },
          { key: "nationalId", label: "رقم الهوية" },
          { key: "activeContracts", label: "العقود النشطة" },
        ], "المستأجرون")}
        resultCount={sortedData?.length}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5 text-violet-500" /> قائمة المستأجرين
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="name" label="الاسم" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="phone" label="الهاتف" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="nationalId" label="رقم الهوية" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="activeContracts" label="العقود" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="currentUnit" label="الوحدة الحالية" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="totalPaid" label="إجمالي المدفوعات" sortState={sortState} onSort={handleSort} />
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
              emptyMessage="لا يوجد مستأجرون"
              emptyIcon={<Users2 className="h-6 w-6 text-slate-400" />}
            >
              {sortedData?.map((t: any) => (
                <Fragment key={t.id || t.name}>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-bold shrink-0">
                          {(t.name || "?")[0]}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{t.name}</p>
                          {t.email && <p className="text-xs text-gray-400">{t.email}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {t.phone ? (
                        <a href={`tel:${t.phone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {t.phone}
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{t.nationalId || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold">{t.totalContracts || 0}</span>
                        {t.activeContracts > 0 && (
                          <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1">
                            {t.activeContracts} نشط
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{t.currentUnit || "—"}</TableCell>
                    <TableCell className="font-bold text-emerald-600 text-sm">{formatCurrency(t.totalPaid || 0)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Link href={`/properties/tenants/${typeof t.id === 'string' && t.id.startsWith('c-') ? encodeURIComponent(t.name) : t.id}`}>
                          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
                            <Eye className="h-3 w-3" /> ملف
                          </Button>
                        </Link>
                        <button
                          onClick={() => setExpandedId(expandedId === (t.id || t.name) ? null : (t.id || t.name))}
                          className="text-gray-400 hover:text-gray-600 p-1"
                        >
                          {expandedId === (t.id || t.name) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === (t.id || t.name) && (
                    <TableRow key={`expand-${t.id || t.name}`}>
                      <TableCell colSpan={7} className="bg-violet-50/30">
                        <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1">معلومات التواصل</p>
                            {t.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3 text-gray-400" /> {t.phone}</p>}
                            {t.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3 text-gray-400" /> {t.email}</p>}
                            {t.nationality && <p className="text-xs text-gray-500">الجنسية: {t.nationality}</p>}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1">العقود</p>
                            {t.contracts?.slice(0, 3).map((c: any, i: number) => (
                              <p key={i} className="text-xs text-gray-600">
                                {c.unitNumber} — {formatDateAr(c.startDate)} ← {formatDateAr(c.endDate)}
                                <StatusBadge status={c.status} />
                              </p>
                            ))}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1">المالي</p>
                            <p className="text-xs">إجمالي المدفوعات: <span className="font-bold text-emerald-600">{formatCurrency(t.totalPaid || 0)}</span></p>
                            <p className="text-xs">المتأخرات: <span className="font-bold text-red-600">{formatCurrency(t.overdueAmount || 0)}</span></p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </DataTableWrapper>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
