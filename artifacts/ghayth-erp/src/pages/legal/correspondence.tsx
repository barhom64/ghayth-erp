import { useApiQuery, asList } from "@/lib/api";
import { LegalTabsNav } from "@/components/shared/legal-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  PageStatusBadge,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
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
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

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
          size="icon"
          payload={() => ({
            entity: { title: "سجل المراسلات القانونية", total: printRows.length },
            items: printRows.map((c: any) => ({
              "الرقم": c.id,
              "القضية": c.caseTitle || c.caseId || "—",
              "النوع": c.correspondenceType || c.type || "—",
              "المرسل": c.from || c.sender || "—",
              "المستلم": c.to || c.recipient || "—",
              "التاريخ": c.date || c.createdAt || "—",
            })),
          })}
        />
      }
    >
      <LegalTabsNav />
      <AdvancedFilters
        config={{ searchPlaceholder: "بحث...", showDateRange: false }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "caseNumber", label: "رقم القضية" },
              { key: "title", label: "عنوان القضية" },
              { key: "caseType", label: "نوع القضية" },
              { key: "lawyerName", label: "المحامي" },
              { key: "status", label: "الحالة" },
            ],
            "مراسلات-قانونية",
          )
        }
        resultCount={filtered.length}
      />
      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRowClick={(row) => navigate(`/legal/cases/${row.id}`)}
      />
    </PageShell>
  );
}
