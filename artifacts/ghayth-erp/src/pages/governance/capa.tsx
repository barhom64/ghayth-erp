import { useApiQuery, asList } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Badge } from "@/components/ui/badge";
import { Wrench } from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

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
  { key: "dueDate", header: "تاريخ الاستحقاق", sortable: true, render: (r) => formatDateAr(r.dueDate) },
  {
    key: "status", header: "الحالة", render: (r) => {
      const v = r.status;
      const colors: Record<string, string> = { open: "bg-status-warning-surface text-yellow-800", in_progress: "bg-status-info-surface text-status-info-foreground", closed: "bg-status-success-surface text-status-success-foreground" };
      return <Badge className={colors[v || ""] || "bg-surface-subtle text-status-neutral-foreground"}>{v === "open" ? "مفتوح" : v === "in_progress" ? "قيد التنفيذ" : v === "closed" ? "مغلق" : v || "-"}</Badge>;
    }
  },
  { key: "completedAt", header: "تاريخ الإغلاق", render: (r) => formatDateAr(r.completedAt) },
];

export default function GovernanceCapa() {
  const { data, isLoading, isError, error } = useApiQuery<any>(["governance-capa"], "/governance/capa");
  const rows = asList(data?.data || data);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6" /> الإجراءات التصحيحية والوقائية (CAPA)</h1>
        <p className="text-muted-foreground mt-1">متابعة الإجراءات التصحيحية والوقائية لضمان الجودة والامتثال</p>
      </div>
      <DataTable columns={columns} data={rows} isLoading={isLoading} isError={isError} error={error} />
    </div>
  );
}
