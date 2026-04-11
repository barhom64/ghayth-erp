import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { useApiQuery, asList } from "@/lib/api";
import { Shield, Plus, Search } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PaginationBar } from "@/components/data-table-wrapper";

export default function InsurancePage() {
  const { data: insuranceResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["fleet-insurance"], "/fleet/insurance"
  );
  const items = asList(insuranceResp);
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filtered = applyFilters(items, filters, { searchFields: ["plateNumber", "provider", "policyNumber"] });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);
  const paginatedData = sortedData?.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">التأمين</h1>
        <Link href="/fleet/insurance/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> إضافة تأمين</Button>
        </Link>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمركبة أو شركة التأمين أو رقم الوثيقة...",
          showDateRange: true,
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        resultCount={filtered.length}
      />

      <Card>
        <CardHeader><CardTitle>وثائق التأمين</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="vehiclePlate" label="المركبة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="type" label="النوع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="provider" label="شركة التأمين" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="policyNumber" label="رقم الوثيقة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="startDate" label="من" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="endDate" label="إلى" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="premium" label="القسط" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <DataTableWrapper
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={() => refetch()}
            data={filtered}
            colCount={7}
            emptyMessage="لا توجد وثائق تأمين"
            emptyIcon={<Shield className="h-6 w-6 text-slate-400" />}
            emptyAction={{ label: "إضافة تأمين", onClick: () => window.location.href = "/fleet/insurance/create" }}
          >
            {(paginatedData || [])?.map(i => (
              <TableRow key={i.id}>
                <TableCell className="font-mono">{i.plateNumber || "-"}</TableCell>
                <TableCell>{i.type === 'comprehensive' ? 'شامل' : i.type === 'third_party' ? 'طرف ثالث' : i.type || "-"}</TableCell>
                <TableCell className="font-medium">{i.provider || "-"}</TableCell>
                <TableCell className="text-muted-foreground">{i.policyNumber || "-"}</TableCell>
                <TableCell>{formatDateAr(i.startDate)}</TableCell>
                <TableCell>{formatDateAr(i.endDate)}</TableCell>
                <TableCell className="font-bold">{formatCurrency(i.premium || 0)}</TableCell>
              </TableRow>
            ))}
          </DataTableWrapper></Table>
          <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
