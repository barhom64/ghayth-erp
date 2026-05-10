import { useApiQuery, asList } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Mail } from "lucide-react";
import { useLocation } from "wouter";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

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
  { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
];

export default function LegalCorrespondence() {
  const { data, isLoading, isError, error } = useApiQuery<any>(["legal-cases-corr"], "/legal/cases");
  const cases = asList(data?.data || data);
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(cases, filters, {
    searchFields: ["title", "lawyerName", "caseNumber"],
    statusField: "status",
  });

  return (
    <PageShell
      title="المراسلات القانونية"
      subtitle="اختر قضية لعرض مراسلاتها — سجل المراسلات والخطابات القانونية"
      breadcrumbs={[{ href: "/legal", label: "الشؤون القانونية" }, { label: "المراسلات القانونية" }]}
      loading={isLoading}
    >
      <AdvancedFilters config={{ searchPlaceholder: "بحث...", showDateRange: false }} values={filters} onChange={setFilters} resultCount={filtered.length} />
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRowClick={(row) => navigate(`/legal/cases/${row.id}`)}
      />
    </PageShell>
  );
}
