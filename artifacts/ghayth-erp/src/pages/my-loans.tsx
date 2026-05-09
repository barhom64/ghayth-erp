import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Wallet, Clock, CheckCircle2, DollarSign, TrendingDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "معلق", color: "text-yellow-600 bg-yellow-50" },
  approved: { label: "معتمد", color: "text-blue-600 bg-blue-50" },
  active: { label: "نشط", color: "text-green-600 bg-green-50" },
  completed: { label: "مسدد", color: "text-gray-600 bg-gray-50" },
  rejected: { label: "مرفوض", color: "text-red-600 bg-red-50" },
};

const loanTypeLabels: Record<string, string> = {
  personal: "شخصية",
  emergency: "طارئة",
  housing: "سكن",
  vehicle: "مركبة",
  education: "تعليمية",
  other: "أخرى",
};


const loanColumns: DataTableColumn<any>[] = [
  { key: "loanNumber", header: "الرقم", render: (r) => `#${r.loanNumber || r.id}`, ltr: true },
  { key: "loanType", header: "النوع", searchable: true, render: (r) => loanTypeLabels[r.loanType] || r.loanType },
  { key: "amount", header: "المبلغ", sortable: true, render: (r) => <span className="font-medium">{formatCurrency(r.amount)}</span> },
  {
    key: "installments", header: "الأقساط",
    render: (r) => `${r.paidInstallments ?? 0}/${r.installmentCount ?? 0}`,
  },
  {
    key: "installmentAmount", header: "القسط الشهري",
    render: (r) => formatCurrency(r.installmentCount > 0 ? Number(r.amount) / r.installmentCount : 0),
  },
  {
    key: "remainingAmount", header: "المتبقي", sortable: true,
    render: (r) => r.status === "active"
      ? <span className="text-red-600 font-medium">{formatCurrency(r.remainingAmount ?? r.amount)}</span>
      : <span className="text-gray-400">—</span>,
  },
  { key: "createdAt", header: "تاريخ الطلب", sortable: true, render: (r) => formatDateAr(r.createdAt) },
  {
    key: "status", header: "الحالة", searchable: true,
    render: (r) => <PageStatusBadge status={r.status} />,
  },
];

export default function MyLoans() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError } = useApiQuery<any>(["my-loans"], "/hr/loans/my");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const loans: any[] = data?.data ?? [];

  const totalAmount = loans.reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
  const remainingAmount = loans
    .filter((l: any) => l.status === "active")
    .reduce((s: number, l: any) => s + Number(l.remainingAmount ?? l.amount ?? 0), 0);
  const activeCount = loans.filter((l: any) => l.status === "active").length;
  const pendingCount = loans.filter((l: any) => l.status === "pending").length;

  return (
    <PageShell
      title="سلفي"
      subtitle="متابعة السلف والقروض الخاصة بك"
      actions={
        <Link href="/hr/loans/create">
          <Button size="sm" className="gap-1.5">
            <Wallet size={14} />
            طلب سلفة جديدة
          </Button>
        </Link>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "سلف نشطة", value: activeCount, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
          { label: "طلبات معلقة", value: pendingCount, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
          { label: "إجمالي السلف", value: formatCurrency(totalAmount), icon: DollarSign, color: "text-blue-600 bg-blue-50" },
          { label: "المتبقي", value: formatCurrency(remainingAmount), icon: TrendingDown, color: "text-red-600 bg-red-50" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-2", stat.color)}>
                  <Icon size={20} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DataTable
        columns={loanColumns}
        data={loans}
        onRowClick={(l) => navigate(`/hr/loans/${l.id}`)}
        emptyMessage="لا توجد سلف مسجّلة"
        emptyIcon={<Wallet size={36} className="opacity-40" />}
        searchPlaceholder="بحث بالنوع أو الحالة..."
        statusOptions={Object.entries(statusConfig).map(([value, { label }]) => ({ value, label }))}
        pageSize={20}
      />
    </PageShell>
  );
}
