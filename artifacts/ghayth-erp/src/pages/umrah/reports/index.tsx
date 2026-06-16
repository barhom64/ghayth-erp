/**
 * Umrah Reports Hub — §11 of #1870
 *
 * Renders the 17-report catalog from /umrah/reports/catalog. Each
 * report card shows its title, description, category badge, and a
 * status badge (متاح / جزئي / قادم). The operator clicks "افتح"
 * to drill to the destination page; stubs land on a friendly
 * "coming soon" page that describes what the planned report covers.
 *
 * The page used to be a hand-curated list of 10 tiles — easy to
 * drift from reality. Routing through the API catalog means a
 * follow-up that flips a stub to available auto-updates this page.
 */
import { Link } from "wouter";
import { useMemo, useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { useApiQuery } from "@/lib/api";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, FileText } from "lucide-react";

type ReportStatus = "available" | "partial" | "stub";
type ReportCategory =
  | "operational" | "finance" | "agents" | "groups"
  | "compliance" | "import" | "transport" | "commission";

interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  status: ReportStatus;
  route: string;
  apiPath?: string;
}

interface CatalogResp {
  data: ReportDefinition[];
  categories: Record<ReportCategory, string>;
  statuses: Record<ReportStatus, string>;
}

const STATUS_TONE: Record<ReportStatus, string> = {
  available: "bg-emerald-100 text-emerald-700 border-emerald-300",
  partial:   "bg-amber-100 text-amber-700 border-amber-300",
  stub:      "bg-slate-100 text-slate-600 border-slate-300",
};

export default function UmrahReportsHub() {
  const q = useApiQuery<CatalogResp>(
    ["umrah-reports-catalog"],
    "/umrah/reports/catalog",
  );
  const reports = q.data?.data ?? [];
  const categories = q.data?.categories ?? ({} as Record<ReportCategory, string>);
  const statuses = q.data?.statuses ?? ({} as Record<ReportStatus, string>);

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [reports, categoryFilter, statusFilter]);

  return (
    <PageShell
      title="مركز تقارير العمرة"
      subtitle={`${reports.length} تقريراً — ${reports.filter((r) => r.status === "available").length} متاح / ${reports.filter((r) => r.status === "partial").length} جزئي / ${reports.filter((r) => r.status === "stub").length} قادم`}
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "التقارير" }]}
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3" data-testid="reports-filters">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الفئة</label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]" data-testid="reports-filter-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفئات</SelectItem>
                {Object.entries(categories).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الحالة</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="reports-filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {Object.entries(statuses).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="reports-grid">
        {filtered.map((r) => {
          const statusCls = STATUS_TONE[r.status];
          return (
            <Card key={r.id} data-testid={`report-card-${r.id}`} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm leading-tight flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {r.title}
                  </CardTitle>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap ${statusCls}`}
                    data-testid={`report-status-${r.id}`}
                  >
                    {statuses[r.status] ?? r.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {categories[r.category] ?? r.category}
                  </p>
                </div>
                <div className="flex justify-end">
                  {r.status === "stub" ? (
                    <Button size="sm" variant="ghost" disabled data-testid={`report-open-${r.id}`}>
                      قيد التطوير
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline" data-testid={`report-open-${r.id}`}><Link href={r.route}>
                        <ArrowLeft className="h-3 w-3 me-1" />
                        افتح التقرير
                      </Link></Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8" data-testid="reports-empty">
          لا تقارير تطابق الفلتر.
        </p>
      )}
    </PageShell>
  );
}
