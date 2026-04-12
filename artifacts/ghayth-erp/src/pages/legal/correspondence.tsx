import { useApiQuery, asList } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
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
  { key: "status", header: "الحالة", render: (r) => <Badge variant="outline">{r.status || "-"}</Badge> },
];

export default function LegalCorrespondence() {
  const { data, isLoading, isError, error } = useApiQuery<any>(["legal-cases-corr"], "/legal/cases");
  const cases = asList(data?.data || data);
  const [, navigate] = useLocation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="h-6 w-6" /> المراسلات القانونية</h1>
        <p className="text-muted-foreground mt-1">اختر قضية لعرض مراسلاتها — سجل المراسلات والخطابات القانونية</p>
      </div>
      <DataTable
        columns={columns}
        data={cases}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRowClick={(row) => navigate(`/legal/cases/${row.id}`)}
      />
    </div>
  );
}
