import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { PageShell } from "@/components/page-shell";
import { Mail, Plus } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useApiQuery, asList } from "@/lib/api";

const DIRECTION_MAP: Record<string, { label: string; color: string }> = {
  inbound: { label: "وارد", color: "bg-blue-100 text-blue-700" },
  outbound: { label: "صادر", color: "bg-green-100 text-green-700" },
};

export default function CommunicationsLetters() {
  const { data: logResp, isLoading, isError, error, refetch } = useApiQuery<any>(["comm-log-letters"], "/communications/log?channel=email");
  const letters = asList<any>(logResp);

  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(letters, filters, {
    searchFields: ["subject", "toNumber", "fromNumber"] as any,
    statusField: "direction" as any,
  });

  const columns: DataTableColumn<any>[] = [
    { key: "subject", header: "الموضوع", sortable: true, className: "font-medium", render: (l) => l.subject || "-" },
    {
      key: "direction",
      header: "الاتجاه",
      sortable: true,
      render: (l) => <Badge className={DIRECTION_MAP[l.direction]?.color}>{DIRECTION_MAP[l.direction]?.label || l.direction}</Badge>,
    },
    { key: "toNumber", header: "المرسل/المستلم", sortable: true, render: (l) => l.toNumber || l.fromNumber || "-" },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (l) => l.createdAt ? formatDateAr(l.createdAt) : "-" },
    { key: "status", header: "الحالة", sortable: true, render: (l) => <PageStatusBadge status={l.status} /> },
  ];

  return (
    <PageShell
      title="المراسلات"
      subtitle="إدارة المراسلات الصادرة والواردة"
      breadcrumbs={[{ href: "/communications", label: "التواصل" }]}
      actions={
        <Link href="/communications/letters/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> مراسلة جديدة</Button>
        </Link>
      }
    >
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث في المراسلات...",
          statuses: [
            { value: "inbound", label: "واردة" },
            { value: "outbound", label: "صادرة" },
          ],
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(filtered || [], [
          { key: "subject", label: "الموضوع" },
          { key: "direction", label: "الاتجاه" },
          { key: "toNumber", label: "المستلم" },
          { key: "status", label: "الحالة" },
        ], "المراسلات")}
        resultCount={filtered?.length}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-500" /> المراسلات
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
            emptyMessage="لا توجد مراسلات"
            emptyIcon={<Mail className="h-6 w-6 text-slate-400" />}
            noToolbar
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
