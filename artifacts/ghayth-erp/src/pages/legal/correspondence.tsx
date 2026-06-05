import { useApiQuery, asList } from "@/lib/api";
import { LegalTabsNav } from "@/components/shared/legal-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  PageStatusBadge,
  AdvancedFilters,
  useFilters,
  applyFilters,
} from "@workspace/ui-core";
import { Mail } from "lucide-react";
import { useLocation } from "wouter";

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
      actions={
        <PrintButton
          entityType="report_legal_correspondence"
          entityId="list"
          label="طباعة"
          payload={{
            entity: { title: "سجل المراسلات القانونية", total: filtered.length },
            items: filtered.map((c: any) => ({
              "الرقم": c.id,
              "القضية": c.caseTitle || c.caseId || "—",
              "النوع": c.correspondenceType || c.type || "—",
              "المرسل": c.from || c.sender || "—",
              "المستلم": c.to || c.recipient || "—",
              "التاريخ": c.date || c.createdAt || "—",
            })),
          }}
        />
      }
    >
      <LegalTabsNav />
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
