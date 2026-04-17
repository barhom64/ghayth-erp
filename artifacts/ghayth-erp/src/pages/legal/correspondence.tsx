import { useApiQuery, asList } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Mail } from "lucide-react";
import { useLocation } from "wouter";
import { PageShell } from "@/components/page-shell";

interface LegalCase {
  id: number;
  caseNumber?: string;
  title?: string;
  caseType?: string;
  status?: string;
  lawyerName?: string;
}

const columns: DataTableColumn<LegalCase>[] = [
  { key: "caseNumber", header: "رقم القضية", sortable: true },
  { key: "title", header: "عنوان القضية", sortable: true, searchable: true },
  { key: "caseType", header: "نوع القضية" },
  { key: "lawyerName", header: "المحامي", searchable: true },
  { key: "status", header: "الحالة", render: (r) => <Badge variant="outline">{r.status || "-"}</Badge> },
];

export default function LegalCorrespondence() {
  const { data, isLoading, isError, error } = useApiQuery<any>(["legal-cases-corr"], "/legal/cases");
  const cases = asList(data?.data || data);
  const [, navigate] = useLocation();

  return (
    <PageShell
      title="المراسلات القانونية"
      subtitle="اختر قضية لعرض مراسلاتها — سجل المراسلات والخطابات القانونية"
      breadcrumbs={[{ href: "/legal", label: "الشؤون القانونية" }, { label: "المراسلات القانونية" }]}
      loading={isLoading}
    >
      <DataTable
        columns={columns}
        data={cases}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRowClick={(row) => navigate(`/legal/cases/${row.id}`)}
      />
    </PageShell>
  );
}
