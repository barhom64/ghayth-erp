import { useApiQuery, asList } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";

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
  { key: "createdAt", header: "تاريخ الإنشاء", render: (r) => r.createdAt ? new Date(r.createdAt).toLocaleDateString("ar-SA") : "-" },
];

export default function KnowledgeBase() {
  const { data, isLoading, isError, error } = useApiQuery<any>(["support-kb"], "/support/kb");
  const rows = asList(data?.data || data);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-6 w-6" /> قاعدة المعرفة</h1>
        <p className="text-muted-foreground mt-1">مقالات ومواد تعليمية لحل المشاكل الشائعة</p>
      </div>
      <DataTable columns={columns} data={rows} isLoading={isLoading} isError={isError} error={error} />
    </div>
  );
}
