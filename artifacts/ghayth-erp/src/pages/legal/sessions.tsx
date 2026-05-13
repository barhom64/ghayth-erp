import { useLocation } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

interface Session {
  id: number;
  caseTitle?: string;
  sessionDate?: string;
  location?: string;
  judge?: string;
  result?: string;
  nextSessionDate?: string;
  notes?: string;
  lawyerName?: string;
  priority?: string;
  daysUntil?: number;
}

const columns: DataTableColumn<Session>[] = [
  { key: "caseTitle", header: "القضية", sortable: true, searchable: true },
  { key: "sessionDate", header: "تاريخ الجلسة", sortable: true, render: (r) => formatDateAr(r.sessionDate) },
  { key: "daysUntil", header: "المتبقي (أيام)", render: (r) => r.daysUntil !== undefined ? `${r.daysUntil} يوم` : "-" },
  { key: "location", header: "الموقع / المحكمة", searchable: true },
  { key: "judge", header: "القاضي" },
  { key: "lawyerName", header: "المحامي" },
  {
    key: "priority", header: "الأولوية", render: (r) => {
      const v = r.priority;
      const colors: Record<string, string> = { high: "bg-status-error-surface text-status-error-foreground", medium: "bg-status-warning-surface text-yellow-800", low: "bg-status-success-surface text-status-success-foreground" };
      return <Badge className={colors[v || ""] || "bg-surface-subtle text-status-neutral-foreground"}>{v === "high" ? "عالية" : v === "medium" ? "متوسطة" : v === "low" ? "منخفضة" : v || "-"}</Badge>;
    }
  },
  { key: "result", header: "النتيجة", render: (r) => <span className="line-clamp-1">{r.result || "-"}</span> },
  { key: "nextSessionDate", header: "الجلسة التالية", render: (r) => formatDateAr(r.nextSessionDate) },
  { key: "notes", header: "ملاحظات", render: (r) => <span className="line-clamp-1">{r.notes || "-"}</span> },
];

export default function LegalSessions() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, error } = useApiQuery<any>(["legal-sessions"], "/legal/sessions/upcoming");
  const rows = asList(data?.data || data);
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(rows, filters, {
    searchFields: ["caseTitle", "location", "judge", "lawyerName"],
    statusField: "priority",
  });

  return (
    <PageShell
      title="الجلسات القادمة"
      subtitle="جدول جلسات المحاكم والقضايا"
      breadcrumbs={[{ href: "/legal", label: "الشؤون القانونية" }, { label: "الجلسات القادمة" }]}
      loading={isLoading}
    >
      <AdvancedFilters config={{ searchPlaceholder: "بحث...", showDateRange: false }} values={filters} onChange={setFilters} resultCount={filtered.length} />
      <DataTable columns={columns} data={filtered} isLoading={isLoading} isError={isError} error={error} onRowClick={(s) => navigate(`/legal/sessions/${s.id}`)} />
    </PageShell>
  );
}
