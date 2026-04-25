import { useApiQuery, asList } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

interface KBArticle {
  id: number;
  title?: string;
  category?: string;
  tags?: string[];
  views?: number;
  helpful?: number;
  notHelpful?: number;
  createdAt?: string;
}

const columns: DataTableColumn<KBArticle>[] = [
  { key: "title", header: "العنوان", sortable: true, searchable: true },
  { key: "category", header: "التصنيف", render: (r) => <Badge variant="outline">{r.category || "عام"}</Badge> },
  { key: "tags", header: "الوسوم", render: (r) => r.tags?.length ? r.tags.map((t, i) => <Badge key={i} variant="secondary" className="mx-0.5">{t}</Badge>) : "-" },
  { key: "views", header: "المشاهدات", sortable: true },
  { key: "helpful", header: "مفيد 👍" },
  { key: "notHelpful", header: "غير مفيد 👎" },
  { key: "createdAt", header: "تاريخ الإنشاء", render: (r) => formatDateAr(r.createdAt) },
];

export default function KnowledgeBase() {
  const { data, isLoading, isError, error } = useApiQuery<any>(["support-kb"], "/support/kb");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const rows = asList(data?.data || data);

  return (
    <PageShell
      title="قاعدة المعرفة"
      subtitle="مقالات ومواد تعليمية لحل المشاكل الشائعة"
      breadcrumbs={[{ href: "/support", label: "الدعم" }, { label: "قاعدة المعرفة" }]}
      loading={isLoading}
    >
      <DataTable columns={columns} data={rows} isLoading={isLoading} isError={isError} error={error} />
    </PageShell>
  );
}
