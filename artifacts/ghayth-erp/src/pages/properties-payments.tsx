import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageStatusBadge } from "@/components/page-status-badge";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { PageShell } from "@/components/page-shell";
import { Banknote, CheckCircle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useAppContext } from "@/contexts/app-context";

export default function PropertiesPayments() {
  const { scopeQueryString, permissions, roleLevel } = useAppContext();
  const canManage = permissions.canManageProperty || roleLevel >= 50;
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data: paymentsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["rent-payments", scopeQueryString],
    `/properties/payments${scopeSuffix}`
  );
  const payments = asList(paymentsResp);
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(payments, filters, {
    searchFields: ["tenantName", "unitNumber"] as any,
    statusField: "status" as any,
    dateField: "dueDate" as any,
  });

  const columns: DataTableColumn<any>[] = [
    { key: "tenantName", header: "المستأجر", sortable: true, className: "font-medium" },
    { key: "unitNumber", header: "الوحدة", sortable: true, render: (p) => p.unitNumber || "—" },
    { key: "dueDate", header: "تاريخ الاستحقاق", sortable: true, render: (p) => formatDateAr(p.dueDate) },
    { key: "amount", header: "المبلغ", sortable: true, render: (p) => formatCurrency(p.amount || 0) },
    { key: "paidAmount", header: "المدفوع", sortable: true, className: "text-emerald-600", render: (p) => formatCurrency(p.paidAmount || 0) },
    { key: "status", header: "الحالة", sortable: true, render: (p) => <PageStatusBadge status={p.status} /> },
    {
      key: "action",
      header: "إجراء",
      hidden: !canManage,
      render: (p) => (
        p.status !== "paid" ? (
          <Link href={`/properties/payments/${p.id}/pay`}>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs h-7 text-emerald-600"
            >
              <CheckCircle className="h-3 w-3" /> تسجيل
            </Button>
          </Link>
        ) : null
      ),
    },
  ];

  return (
    <PageShell
      title="مدفوعات الإيجار"
      subtitle="متابعة وتسجيل مدفوعات الإيجار"
      breadcrumbs={[{ href: "/properties", label: "إدارة الأملاك" }]}
      actions={canManage && (
        <Link href="/properties/payments/new/pay">
          <Button className="gap-2">
            <Banknote className="h-4 w-4" /> تسجيل دفعة
          </Button>
        </Link>
      )}
    >

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمستأجر أو الوحدة...",
          statuses: [
            { value: "paid", label: "مدفوع" },
            { value: "pending", label: "معلق" },
            { value: "overdue", label: "متأخر" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(filtered || [], [
          { key: "tenantName", label: "المستأجر" },
          { key: "unitNumber", label: "الوحدة" },
          { key: "dueDate", label: "تاريخ الاستحقاق" },
          { key: "amount", label: "المبلغ" },
          { key: "paidAmount", label: "المدفوع" },
          { key: "status", label: "الحالة" },
        ], "المدفوعات")}
        resultCount={filtered?.length}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-indigo-500" /> مدفوعات الإيجار</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد مدفوعات"
            emptyIcon={<Banknote className="h-6 w-6 text-slate-400" />}
            noToolbar
            rowClassName={(p) => p.status === 'pending' && new Date(p.dueDate) < new Date() ? "bg-rose-50" : undefined}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
