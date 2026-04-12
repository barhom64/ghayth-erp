import { useApiQuery, asList } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";

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
  { key: "sessionDate", header: "تاريخ الجلسة", sortable: true, render: (r) => r.sessionDate ? new Date(r.sessionDate).toLocaleDateString("ar-SA") : "-" },
  { key: "daysUntil", header: "المتبقي (أيام)", render: (r) => r.daysUntil !== undefined ? `${r.daysUntil} يوم` : "-" },
  { key: "location", header: "الموقع / المحكمة", searchable: true },
  { key: "judge", header: "القاضي" },
  { key: "lawyerName", header: "المحامي" },
  {
    key: "priority", header: "الأولوية", render: (r) => {
      const v = r.priority;
      const colors: Record<string, string> = { high: "bg-red-100 text-red-800", medium: "bg-yellow-100 text-yellow-800", low: "bg-green-100 text-green-800" };
      return <Badge className={colors[v || ""] || "bg-gray-100 text-gray-800"}>{v === "high" ? "عالية" : v === "medium" ? "متوسطة" : v === "low" ? "منخفضة" : v || "-"}</Badge>;
    }
  },
  { key: "result", header: "النتيجة", render: (r) => <span className="line-clamp-1">{r.result || "-"}</span> },
  { key: "nextSessionDate", header: "الجلسة التالية", render: (r) => r.nextSessionDate ? new Date(r.nextSessionDate).toLocaleDateString("ar-SA") : "-" },
  { key: "notes", header: "ملاحظات", render: (r) => <span className="line-clamp-1">{r.notes || "-"}</span> },
];

export default function LegalSessions() {
  const { data, isLoading, isError, error } = useApiQuery<any>(["legal-sessions"], "/legal/sessions/upcoming");
  const rows = asList(data?.data || data);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Calendar className="h-6 w-6" /> الجلسات القادمة</h1>
        <p className="text-muted-foreground mt-1">جدول جلسات المحاكم والقضايا</p>
      </div>
      <DataTable columns={columns} data={rows} isLoading={isLoading} isError={isError} error={error} />
    </div>
  );
}
