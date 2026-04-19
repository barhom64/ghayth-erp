import { useApiQuery, asList } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

interface Judgment {
  id: number;
  caseTitle?: string;
  caseNumber?: string;
  judgmentDate?: string;
  judgmentType?: string;
  verdict?: string;
  amount?: number;
  paidAmount?: number;
  dueDate?: string;
  notes?: string;
  riskLevel?: string;
}

const columns: DataTableColumn<Judgment>[] = [
  { key: "caseTitle", header: "القضية", sortable: true, searchable: true },
  { key: "caseNumber", header: "رقم القضية" },
  { key: "judgmentDate", header: "تاريخ الحكم", sortable: true, render: (r) => r.judgmentDate ? new Date(r.judgmentDate).toLocaleDateString("ar-SA") : "-" },
  { key: "judgmentType", header: "نوع الحكم" },
  { key: "verdict", header: "الحكم / القرار", searchable: true },
  { key: "amount", header: "المبلغ", render: (r) => r.amount ? formatCurrency(Number(r.amount)) : "-" },
  { key: "paidAmount", header: "المدفوع", render: (r) => r.paidAmount ? formatCurrency(Number(r.paidAmount)) : "-" },
  { key: "dueDate", header: "تاريخ الاستحقاق", render: (r) => r.dueDate ? new Date(r.dueDate).toLocaleDateString("ar-SA") : "-" },
  {
    key: "riskLevel", header: "مستوى المخاطرة", render: (r) => {
      const v = r.riskLevel;
      const colors: Record<string, string> = { high: "bg-red-100 text-red-800", medium: "bg-yellow-100 text-yellow-800", low: "bg-green-100 text-green-800" };
      return <Badge className={colors[v || ""] || "bg-gray-100 text-gray-800"}>{v === "high" ? "عالية" : v === "medium" ? "متوسطة" : v === "low" ? "منخفضة" : v || "-"}</Badge>;
    }
  },
];

export default function LegalJudgments() {
  const { data, isLoading, isError, error } = useApiQuery<any>(["legal-judgments"], "/legal/judgments/financial-report");
  const rows = asList(data?.data || data);
  const totalAmount = data?.totalAmount || 0;
  const totalPaid = data?.totalPaid || 0;
  const outstanding = data?.outstanding || 0;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <PageShell
      title="الأحكام القضائية"
      subtitle="سجل الأحكام الصادرة والتقارير المالية"
      breadcrumbs={[{ href: "/legal", label: "الشؤون القانونية" }, { label: "الأحكام القضائية" }]}
      loading={isLoading}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">إجمالي المبالغ</p><p className="text-xl font-bold">{formatCurrency(Number(totalAmount))}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">المدفوع</p><p className="text-xl font-bold text-green-600">{formatCurrency(Number(totalPaid))}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">المتبقي</p><p className="text-xl font-bold text-red-600">{formatCurrency(Number(outstanding))}</p></CardContent></Card>
      </div>
      <DataTable columns={columns} data={rows} isLoading={isLoading} isError={isError} error={error} />
    </PageShell>
  );
}
