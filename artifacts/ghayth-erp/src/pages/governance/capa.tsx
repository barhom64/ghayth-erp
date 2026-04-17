import { useApiQuery, asList } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Wrench } from "lucide-react";
import { PageShell } from "@/components/page-shell";

interface CapaItem {
  id: number;
  finding?: string;
  rootCause?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  responsiblePerson?: string;
  dueDate?: string;
  status?: string;
  completedAt?: string;
  createdAt?: string;
}

const columns: DataTableColumn<CapaItem>[] = [
  { key: "finding", header: "الملاحظة / النتيجة", sortable: true, searchable: true },
  { key: "rootCause", header: "السبب الجذري", searchable: true },
  { key: "correctiveAction", header: "الإجراء التصحيحي", render: (r) => <span className="line-clamp-2">{r.correctiveAction || "-"}</span> },
  { key: "preventiveAction", header: "الإجراء الوقائي", render: (r) => <span className="line-clamp-2">{r.preventiveAction || "-"}</span> },
  { key: "responsiblePerson", header: "المسؤول", searchable: true },
  { key: "dueDate", header: "تاريخ الاستحقاق", sortable: true, render: (r) => r.dueDate ? new Date(r.dueDate).toLocaleDateString("ar-SA") : "-" },
  {
    key: "status", header: "الحالة", render: (r) => {
      const v = r.status;
      const colors: Record<string, string> = { open: "bg-yellow-100 text-yellow-800", in_progress: "bg-blue-100 text-blue-800", closed: "bg-green-100 text-green-800" };
      return <Badge className={colors[v || ""] || "bg-gray-100 text-gray-800"}>{v === "open" ? "مفتوح" : v === "in_progress" ? "قيد التنفيذ" : v === "closed" ? "مغلق" : v || "-"}</Badge>;
    }
  },
  { key: "completedAt", header: "تاريخ الإغلاق", render: (r) => r.completedAt ? new Date(r.completedAt).toLocaleDateString("ar-SA") : "-" },
];

export default function GovernanceCapa() {
  const { data, isLoading, isError, error } = useApiQuery<any>(["governance-capa"], "/governance/capa");
  const rows = asList(data?.data || data);

  return (
    <PageShell
      title="الإجراءات التصحيحية والوقائية (CAPA)"
      subtitle="متابعة الإجراءات التصحيحية والوقائية لضمان الجودة والامتثال"
      breadcrumbs={[{ href: "/governance", label: "الحوكمة" }]}
    >
      <DataTable columns={columns} data={rows} isLoading={isLoading} isError={isError} error={error} />
    </PageShell>
  );
}
