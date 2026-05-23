import { useLocation } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  AdvancedFilters,
  useFilters,
  applyFilters,
} from "@workspace/ui-core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

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
  { key: "judgmentDate", header: "تاريخ الحكم", sortable: true, render: (r) => formatDateAr(r.judgmentDate) },
  { key: "judgmentType", header: "نوع الحكم" },
  { key: "verdict", header: "الحكم / القرار", searchable: true },
  { key: "amount", header: "المبلغ", render: (r) => r.amount ? formatCurrency(Number(r.amount)) : "-" },
  { key: "paidAmount", header: "المدفوع", render: (r) => r.paidAmount ? formatCurrency(Number(r.paidAmount)) : "-" },
  { key: "dueDate", header: "تاريخ الاستحقاق", render: (r) => formatDateAr(r.dueDate) },
  {
    key: "riskLevel", header: "مستوى المخاطرة", render: (r) => {
      const v = r.riskLevel;
      const colors: Record<string, string> = { high: "bg-status-error-surface text-status-error-foreground", medium: "bg-status-warning-surface text-yellow-800", low: "bg-status-success-surface text-status-success-foreground" };
      return <Badge className={colors[v || ""] || "bg-surface-subtle text-status-neutral-foreground"}>{v === "high" ? "عالية" : v === "medium" ? "متوسطة" : v === "low" ? "منخفضة" : v || "-"}</Badge>;
    }
  },
];

export default function LegalJudgments() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, error } = useApiQuery<any>(["legal-judgments"], "/legal/judgments/financial-report");
  const rows = asList(data?.data || data);
  const totalAmount = data?.totalAmount || 0;
  const totalPaid = data?.totalPaid || 0;
  const outstanding = data?.outstanding || 0;
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(rows, filters, {
    searchFields: ["caseTitle", "verdict", "caseNumber"],
    statusField: "riskLevel",
  });

  return (
    <PageShell
      title="الأحكام القضائية"
      subtitle="سجل الأحكام الصادرة والتقارير المالية"
      breadcrumbs={[{ href: "/legal", label: "الشؤون القانونية" }, { label: "الأحكام القضائية" }]}
      loading={isLoading}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">إجمالي المبالغ</p><p className="text-xl font-bold">{formatCurrency(Number(totalAmount))}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">المدفوع</p><p className="text-xl font-bold text-status-success-foreground">{formatCurrency(Number(totalPaid))}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">المتبقي</p><p className="text-xl font-bold text-status-error-foreground">{formatCurrency(Number(outstanding))}</p></CardContent></Card>
      </div>
      <AdvancedFilters config={{ searchPlaceholder: "بحث...", showDateRange: false }} values={filters} onChange={setFilters} resultCount={filtered.length} />
      <DataTable columns={columns} data={filtered} isLoading={isLoading} isError={isError} error={error} onRowClick={(j) => navigate(`/legal/judgments/${j.id}`)} />
    </PageShell>
  );
}
