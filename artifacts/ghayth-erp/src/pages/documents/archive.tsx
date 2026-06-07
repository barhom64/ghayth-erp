import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { Archive, FileText, Calendar, FolderArchive } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery, asList } from "@/lib/api";
import { PrintButton } from "@/components/shared/print-button";

const columns: DataTableColumn<any>[] = [
  {
    key: "title",
    header: "المستند",
    searchable: true,
    sortable: true,
    className: "font-medium",
    render: (d) => (
      <span className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        {d.title || d.name || "-"}
      </span>
    ),
  },
  {
    key: "type",
    header: "النوع",
    searchable: true,
    sortable: true,
    render: (d) => <Badge variant="outline">{d.type || "-"}</Badge>,
  },
  {
    key: "createdAt",
    header: "التاريخ",
    sortable: true,
    className: "text-muted-foreground",
    render: (d) => (d.createdAt ? formatDateAr(d.createdAt) : "-"),
  },
  {
    key: "status",
    header: "الحالة",
    render: (d) => <PageStatusBadge status={d.status || "archived"} />,
  },
];

export default function DocumentsArchive() {
  const { data: docsResp, isLoading, isError } = useApiQuery<any>(["documents-archive"], "/documents");
  const docs = asList<any>(docsResp);

  const statCards = [
    { label: "مستندات مؤرشفة", value: docs.length, icon: FolderArchive, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "عقود", value: docs.filter((d: any) => d.type === "contract").length, icon: FileText, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "تقارير", value: docs.filter((d: any) => d.type === "report").length, icon: Archive, color: "text-purple-600 bg-purple-50" },
    { label: "إجمالي", value: docs.length, icon: Calendar, color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <PageShell
      title="الأرشيف"
      breadcrumbs={[{ href: "/documents", label: "المستندات" }, { label: "الأرشيف" }]}
      actions={
        <PrintButton
          entityType="report_documents_archive"
          entityId="list"
          size="icon"
          label="طباعة الأرشيف"
          payload={() => ({
            entity: {
              title: "أرشيف المستندات",
              total: docs.length,
              contractsCount: docs.filter((d: any) => d.type === "contract").length,
              reportsCount: docs.filter((d: any) => d.type === "report").length,
            },
            items: docs.map((d: any) => ({
              "المستند": d.title || d.name || "—",
              "النوع": d.type || "—",
              "التاريخ": d.createdAt ? formatDateAr(d.createdAt) : "—",
              "الحالة": d.status || "archived",
            })),
          })}
        />
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-muted-foreground">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={docs}
        isLoading={isLoading}
        isError={isError}
       
        searchPlaceholder="بحث في الأرشيف..."
        emptyMessage="لا توجد مستندات"
      />
    </PageShell>
  );
}
