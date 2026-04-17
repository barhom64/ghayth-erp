import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { PageShell } from "@/components/page-shell";
import { Archive, FileText, FolderArchive } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";

export default function DocumentsArchive() {
  const { data: docsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["documents-archive"], "/documents");
  const docs = asList<any>(docsResp);

  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(docs, filters, {
    searchFields: ["title", "name", "type"] as any,
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "title",
      header: "المستند",
      sortable: true,
      render: (d) => (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="font-medium">{d.title || d.name || "-"}</span>
        </div>
      ),
    },
    {
      key: "type",
      header: "النوع",
      sortable: true,
      render: (d) => <Badge variant="outline">{d.type || "-"}</Badge>,
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (d) => d.createdAt ? formatDateAr(d.createdAt) : "-",
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (d) => <Badge className="bg-green-100 text-green-700">{d.status || "مؤرشف"}</Badge>,
    },
  ];

  return (
    <PageShell
      title="الأرشيف"
      subtitle="إدارة وتصفح المستندات المؤرشفة"
      breadcrumbs={[{ href: "/documents", label: "إدارة المستندات" }]}
    >
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث في الأرشيف...",
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(filtered || [], [
          { key: "title", label: "المستند" },
          { key: "type", label: "النوع" },
          { key: "status", label: "الحالة" },
        ], "الأرشيف")}
        resultCount={filtered?.length}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderArchive className="h-5 w-5 text-blue-500" /> المستندات المؤرشفة
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد مستندات"
            emptyIcon={<Archive className="h-6 w-6 text-slate-400" />}
            noToolbar
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
