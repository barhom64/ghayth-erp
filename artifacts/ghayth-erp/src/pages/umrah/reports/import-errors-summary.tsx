import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { exportRowsToCsv } from "@/lib/unified-export";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import {
  AlertTriangle, FileWarning, Upload, Users, Download,
  CheckCircle2, XCircle, FileText,
} from "lucide-react";
import { formatUmrahDate } from "@/lib/formatters";

// تقرير ملخّص أخطاء الاستيراد — §11 من شرائع #1870.
// مكمِّل لـ wizard الاستيراد (/umrah/import). هنا الإجمالات + التوزيع
// عبر الدفعات + المستخدمين + الأنواع.
//
// يجاوب:
//   «كم دفعة فشلت؟ كم سطر مرفوض؟ من يحتاج تدريب؟ ما نوع الملف الأشكل؟»
//
// API: GET /umrah/reports/import-errors-summary
//   ↳ { kpis, byStatus, byFileType, byUploader, recent }

interface KpiRow {
  totalBatches: number;
  failedBatches: number;
  partialBatches: number;
  totalRows: number;
  errorRows: number;
  skippedRows: number;
  newRows: number;
  updatedRows: number;
  financialImpactRows: number;
  affectedSeasons: number;
  affectedUploaders: number;
}
interface BreakdownByStatus {
  status: string;
  count: number;
  totalRows: number;
  errorRows: number;
}
interface BreakdownByFileType {
  fileType: string;
  count: number;
  totalRows: number;
  errorRows: number;
  skippedRows: number;
}
interface BreakdownByUploader {
  uploadedBy: number | null;
  uploaderName: string | null;
  uploaderEmail: string | null;
  count: number;
  failedCount: number;
  totalRows: number;
  errorRows: number;
  skippedRows: number;
}
interface RecentBatch {
  id: number;
  fileName: string | null;
  fileType: string;
  status: string;
  totalRows: number | null;
  newCount: number | null;
  updatedCount: number | null;
  skippedCount: number | null;
  errorCount: number | null;
  financialImpactCount: number | null;
  seasonId: number | null;
  seasonTitle: string | null;
  uploadedBy: number | null;
  uploaderName: string | null;
  createdAt: string;
  completedAt: string | null;
  notes: string | null;
}
interface SummaryResp {
  kpis: KpiRow;
  byStatus: BreakdownByStatus[];
  byFileType: BreakdownByFileType[];
  byUploader: BreakdownByUploader[];
  recent: RecentBatch[];
}

interface SeasonOpt { id: number; title: string }

const STATUS_LABELS: Record<string, string> = {
  pending:    "قيد المعالجة",
  processing: "جاري",
  completed:  "مكتملة",
  failed:     "فاشلة",
  cancelled:  "ملغاة",
  partial:    "جزئية",
};

const STATUS_TONES: Record<string, string> = {
  pending:    "bg-status-neutral-surface text-status-neutral-foreground",
  processing: "bg-status-info-surface text-status-info-foreground",
  completed:  "bg-status-success-surface text-status-success-foreground",
  failed:     "bg-status-error-surface text-status-error-foreground",
  cancelled:  "bg-status-neutral-surface text-status-neutral-foreground",
  partial:    "bg-status-warning-surface text-status-warning-foreground",
};

const FILETYPE_LABELS: Record<string, string> = {
  mutamers: "معتمرون",
  vouchers: "قسائم",
};

export default function UmrahImportErrorsSummaryReport() {
  const [seasonFilter, setSeasonFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fileTypeFilter, setFileTypeFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const qs = useMemo(() => {
    const parts: string[] = [];
    if (seasonFilter   !== "all") parts.push(`seasonId=${seasonFilter}`);
    if (statusFilter   !== "all") parts.push(`status=${statusFilter}`);
    if (fileTypeFilter !== "all") parts.push(`fileType=${fileTypeFilter}`);
    if (fromDate)                 parts.push(`from=${fromDate}`);
    if (toDate)                   parts.push(`to=${toDate}`);
    return parts.length ? `?${parts.join("&")}` : "";
  }, [seasonFilter, statusFilter, fileTypeFilter, fromDate, toDate]);

  const { data, isLoading, isError, refetch } = useApiQuery<SummaryResp>(
    ["umrah-import-errors-summary", seasonFilter, statusFilter, fileTypeFilter, fromDate, toDate],
    `/umrah/reports/import-errors-summary${qs}`,
  );
  const { data: seasonsResp } = useApiQuery<{ data: SeasonOpt[] }>(
    ["umrah-seasons-select"],
    "/umrah/seasons",
  );

  const kpis = data?.kpis ?? {
    totalBatches: 0, failedBatches: 0, partialBatches: 0,
    totalRows: 0, errorRows: 0, skippedRows: 0, newRows: 0, updatedRows: 0,
    financialImpactRows: 0, affectedSeasons: 0, affectedUploaders: 0,
  };
  const byStatus    = data?.byStatus    ?? [];
  const byFileType  = data?.byFileType  ?? [];
  const byUploader  = data?.byUploader  ?? [];
  const recent      = data?.recent      ?? [];
  const seasons     = seasonsResp?.data ?? [];

  const errorRatePct = kpis.totalRows > 0
    ? Math.round((kpis.errorRows / kpis.totalRows) * 100)
    : 0;

  const exportCsv = () => {
    void exportRowsToCsv({
      entityType: "report_umrah_import_errors_summary",
      title: "ملخّص أخطاء الاستيراد",
      rows: recent as unknown as Record<string, unknown>[],
      columns: [
        { key: "id",                   label: "id" },
        { key: "fileName",             label: "fileName" },
        { key: "fileType",             label: "fileType" },
        { key: "status",               label: "status" },
        { key: "totalRows",            label: "totalRows" },
        { key: "newCount",             label: "newCount" },
        { key: "updatedCount",         label: "updatedCount" },
        { key: "skippedCount",         label: "skippedCount" },
        { key: "errorCount",           label: "errorCount" },
        { key: "financialImpactCount", label: "financialImpactCount" },
        { key: "seasonTitle",          label: "seasonTitle" },
        { key: "uploaderName",         label: "uploaderName" },
        { key: "createdAt",            label: "createdAt" },
        { key: "completedAt",          label: "completedAt" },
      ],
    }).catch((err) => console.error("[export] failed", err));
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError)   return <ErrorState onRetry={refetch} />;

  const kpiTiles = [
    {
      label: "الدفعات",
      value: String(kpis.totalBatches),
      icon: Upload,
      tone: "text-status-info-foreground bg-status-info-surface",
      testid: "import-errors-kpi-total-batches",
    },
    {
      label: "فاشلة",
      value: String(kpis.failedBatches),
      icon: XCircle,
      tone: kpis.failedBatches > 0
        ? "text-status-error-foreground bg-status-error-surface"
        : "text-status-neutral-foreground bg-status-neutral-surface",
      testid: "import-errors-kpi-failed-batches",
    },
    {
      label: "جزئية (فيها أخطاء)",
      value: String(kpis.partialBatches),
      icon: AlertTriangle,
      tone: kpis.partialBatches > 0
        ? "text-status-warning-foreground bg-status-warning-surface"
        : "text-status-neutral-foreground bg-status-neutral-surface",
      testid: "import-errors-kpi-partial-batches",
    },
    {
      label: "إجمالي السطور",
      value: String(kpis.totalRows),
      icon: FileText,
      tone: "text-status-info-foreground bg-status-info-surface",
      testid: "import-errors-kpi-total-rows",
    },
    {
      label: "السطور المرفوضة",
      value: String(kpis.errorRows),
      icon: FileWarning,
      tone: kpis.errorRows > 0
        ? "text-status-error-foreground bg-status-error-surface"
        : "text-status-neutral-foreground bg-status-neutral-surface",
      testid: "import-errors-kpi-error-rows",
    },
    {
      label: "نسبة الأخطاء",
      value: `${errorRatePct}٪`,
      icon: AlertTriangle,
      tone: errorRatePct > 5
        ? "text-status-error-foreground bg-status-error-surface"
        : errorRatePct > 0
          ? "text-status-warning-foreground bg-status-warning-surface"
          : "text-status-success-foreground bg-status-success-surface",
      testid: "import-errors-kpi-error-rate",
    },
    {
      label: "أثر مالي",
      value: String(kpis.financialImpactRows),
      icon: AlertTriangle,
      tone: kpis.financialImpactRows > 0
        ? "text-status-warning-foreground bg-status-warning-surface"
        : "text-status-neutral-foreground bg-status-neutral-surface",
      testid: "import-errors-kpi-financial-impact",
    },
    {
      label: "المستخدمون",
      value: String(kpis.affectedUploaders),
      icon: Users,
      tone: "text-status-info-foreground bg-status-info-surface",
      testid: "import-errors-kpi-uploaders",
    },
  ];

  return (
    <PageShell
      title="ملخّص أخطاء الاستيراد — تقرير مجمَّع"
      subtitle="إجمالي الدفعات + الفاشلة + الجزئية + المرفوضة + التوزيع حسب الحالة والنوع والمستخدم"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "ملخّص أخطاء الاستيراد" }]}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={recent.length === 0}
          className="gap-1"
          data-testid="import-errors-export-csv"
        >
          <Download className="h-3 w-3" /> تصدير CSV
        </Button>
      }
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الموسم</label>
            <Select value={seasonFilter} onValueChange={setSeasonFilter}>
              <SelectTrigger className="w-[180px]" data-testid="import-errors-filter-season">
                <SelectValue placeholder="كل المواسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواسم</SelectItem>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">حالة الدفعة</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]" data-testid="import-errors-filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">نوع الملف</label>
            <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
              <SelectTrigger className="w-[140px]" data-testid="import-errors-filter-filetype">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {Object.entries(FILETYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">من تاريخ</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-[160px]"
              data-testid="import-errors-filter-from"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">إلى تاريخ</label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-[160px]"
              data-testid="import-errors-filter-to"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpiTiles.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className={`inline-flex h-8 w-8 items-center justify-center rounded ${k.tone}`}>
                <k.icon className="h-4 w-4" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{k.label}</p>
              <p className="text-xl font-bold mt-1" data-testid={k.testid}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="status" className="w-full">
            <TabsList className="m-3" data-testid="import-errors-breakdown-tabs">
              <TabsTrigger value="status"   data-testid="import-errors-tab-status">الحالة</TabsTrigger>
              <TabsTrigger value="filetype" data-testid="import-errors-tab-filetype">نوع الملف</TabsTrigger>
              <TabsTrigger value="uploader" data-testid="import-errors-tab-uploader">المستخدم</TabsTrigger>
            </TabsList>

            <TabsContent value="status">
              {byStatus.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground" data-testid="import-errors-breakdown-status-empty">لا بيانات.</p>
              ) : (
                <div className="overflow-x-auto"><table className="w-full text-xs" data-testid="import-errors-breakdown-status">
                  <thead>
                    <tr className="text-right text-muted-foreground border-b bg-surface-subtle">
                      <th className="p-2 font-medium">الحالة</th>
                      <th className="p-2 font-medium">عدد الدفعات</th>
                      <th className="p-2 font-medium">إجمالي السطور</th>
                      <th className="p-2 font-medium">المرفوضة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byStatus.map((r, idx) => (
                      <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/30" data-testid={`import-errors-breakdown-status-row-${idx}`}>
                        <td className="p-2">
                          <Badge className={`text-[10px] ${STATUS_TONES[r.status] || ""}`}>
                            {STATUS_LABELS[r.status] || r.status}
                          </Badge>
                        </td>
                        <td className="p-2 font-semibold">{r.count}</td>
                        <td className="p-2">{r.totalRows}</td>
                        <td className={`p-2 font-bold ${r.errorRows > 0 ? "text-status-error-foreground" : ""}`}>
                          {r.errorRows}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </TabsContent>

            <TabsContent value="filetype">
              {byFileType.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground" data-testid="import-errors-breakdown-filetype-empty">لا بيانات.</p>
              ) : (
                <div className="overflow-x-auto"><table className="w-full text-xs" data-testid="import-errors-breakdown-filetype">
                  <thead>
                    <tr className="text-right text-muted-foreground border-b bg-surface-subtle">
                      <th className="p-2 font-medium">النوع</th>
                      <th className="p-2 font-medium">عدد الدفعات</th>
                      <th className="p-2 font-medium">إجمالي السطور</th>
                      <th className="p-2 font-medium">المرفوضة</th>
                      <th className="p-2 font-medium">المتخطّاة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byFileType.map((r, idx) => (
                      <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/30" data-testid={`import-errors-breakdown-filetype-row-${idx}`}>
                        <td className="p-2 font-medium">{FILETYPE_LABELS[r.fileType] || r.fileType}</td>
                        <td className="p-2">{r.count}</td>
                        <td className="p-2">{r.totalRows}</td>
                        <td className={`p-2 font-bold ${r.errorRows > 0 ? "text-status-error-foreground" : ""}`}>{r.errorRows}</td>
                        <td className="p-2">{r.skippedRows}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </TabsContent>

            <TabsContent value="uploader">
              {byUploader.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground" data-testid="import-errors-breakdown-uploader-empty">لا بيانات.</p>
              ) : (
                <div className="overflow-x-auto"><table className="w-full text-xs" data-testid="import-errors-breakdown-uploader">
                  <thead>
                    <tr className="text-right text-muted-foreground border-b bg-surface-subtle">
                      <th className="p-2 font-medium">المستخدم</th>
                      <th className="p-2 font-medium">عدد الدفعات</th>
                      <th className="p-2 font-medium">فاشلة</th>
                      <th className="p-2 font-medium">السطور</th>
                      <th className="p-2 font-medium">المرفوضة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byUploader.map((r, idx) => (
                      <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/30" data-testid={`import-errors-breakdown-uploader-row-${idx}`}>
                        <td className="p-2 font-medium">
                          {r.uploaderName || r.uploaderEmail || `#${r.uploadedBy ?? "—"}`}
                          {r.uploaderEmail && r.uploaderName && (
                            <p className="text-[10px] text-muted-foreground" dir="ltr">{r.uploaderEmail}</p>
                          )}
                        </td>
                        <td className="p-2">{r.count}</td>
                        <td className={`p-2 ${r.failedCount > 0 ? "text-status-error-foreground font-semibold" : ""}`}>
                          {r.failedCount}
                        </td>
                        <td className="p-2">{r.totalRows}</td>
                        <td className={`p-2 font-bold ${r.errorRows > 0 ? "text-status-error-foreground" : ""}`}>
                          {r.errorRows}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <p className="text-sm font-semibold">آخر الدفعات</p>
            <p className="text-xs text-muted-foreground">
              {recent.length} من أصل {kpis.totalBatches}
            </p>
          </div>
          {recent.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm" data-testid="import-errors-recent-empty">
              لا دفعات ضمن الفلتر الحالي.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="import-errors-recent-table">
                <thead>
                  <tr className="text-right text-muted-foreground border-b bg-surface-subtle">
                    <th className="p-2 font-medium">الملف</th>
                    <th className="p-2 font-medium">النوع</th>
                    <th className="p-2 font-medium">الحالة</th>
                    <th className="p-2 font-medium">التاريخ</th>
                    <th className="p-2 font-medium">الموسم</th>
                    <th className="p-2 font-medium">المستخدم</th>
                    <th className="p-2 font-medium">السطور</th>
                    <th className="p-2 font-medium">جديد</th>
                    <th className="p-2 font-medium">محدث</th>
                    <th className="p-2 font-medium">متخطّى</th>
                    <th className="p-2 font-medium">أخطاء</th>
                    <th className="p-2 font-medium">أثر مالي</th>
                    <th className="p-2 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => {
                    const errCount = Number(r.errorCount ?? 0);
                    const hasIssues = errCount > 0 || r.status === "failed" || Number(r.skippedCount ?? 0) > 0;
                    return (
                      <tr
                        key={r.id}
                        className="border-b last:border-b-0 hover:bg-muted/30"
                        data-testid={`import-errors-recent-row-${r.id}`}
                      >
                        <td className="p-2">
                          <span className="font-medium">{r.fileName || `دفعة #${r.id}`}</span>
                          {r.notes && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{r.notes}</p>
                          )}
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[10px]">
                            {FILETYPE_LABELS[r.fileType] || r.fileType}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <Badge className={`text-[10px] ${STATUS_TONES[r.status] || ""}`}>
                            {STATUS_LABELS[r.status] || r.status}
                          </Badge>
                        </td>
                        <td className="p-2">{formatUmrahDate(r.createdAt)}</td>
                        <td className="p-2">{r.seasonTitle || "—"}</td>
                        <td className="p-2 text-[11px]">
                          {r.uploaderName || `#${r.uploadedBy ?? "—"}`}
                        </td>
                        <td className="p-2">{r.totalRows ?? 0}</td>
                        <td className="p-2 text-status-success-foreground">{r.newCount ?? 0}</td>
                        <td className="p-2">{r.updatedCount ?? 0}</td>
                        <td className="p-2 text-status-warning-foreground">{r.skippedCount ?? 0}</td>
                        <td
                          className={`p-2 font-bold ${errCount > 0 ? "text-status-error-foreground" : ""}`}
                          data-testid={`import-errors-recent-errors-${r.id}`}
                        >
                          {errCount}
                        </td>
                        <td className="p-2">
                          {(r.financialImpactCount ?? 0) > 0 ? (
                            <Badge variant="outline" className="text-[10px] bg-status-warning-surface text-status-warning-foreground">
                              {r.financialImpactCount}
                            </Badge>
                          ) : (
                            <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                          )}
                        </td>
                        <td className="p-2 text-[11px]">
                          {hasIssues && (
                            <Link
                              href={`/umrah/import/${r.id}/unlinked`}
                              className="text-blue-600 hover:underline"
                              data-testid={`import-errors-recent-unlinked-link-${r.id}`}
                            >
                              السطور غير المربوطة
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
