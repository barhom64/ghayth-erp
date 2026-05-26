import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { formatNumber } from "@/lib/formatters";
import { ShieldCheck, FileText, Database, ExternalLink } from "lucide-react";

interface RetentionPolicy {
  id: number;
  companyId: number | null;
  dataType: string;
  retentionYears: number | string;
  legalBasis: string | null;
  description: string | null;
  isDefault: boolean;
}

interface ProcessingLogRow {
  id: number;
  activityType: string;
  dataCategories: string;
  dataSubjects: string;
  purpose: string;
  legalBasis: string;
  performedBy: number | null;
  performedAt: string;
}

interface PrivacyNotice {
  version: string;
  lastUpdated: string;
  title: string;
  summary: string;
  sections: Array<{ title: string; content: string }>;
}

export default function PdplDashboardPage() {
  const { data: notice, isLoading: noticeLoading } = useApiQuery<PrivacyNotice>(
    ["pdpl-notice"],
    `/pdpl/privacy-notice`,
  );

  const { data: policiesResp, isLoading: polLoading, isError: polError } =
    useApiQuery<{ data: RetentionPolicy[] }>(["pdpl-policies"], `/pdpl/retention-policies`);

  const { data: logResp, isError: logError } = useApiQuery<{ data: ProcessingLogRow[] }>(
    ["pdpl-processing-log"],
    `/pdpl/processing-log`,
  );

  if (noticeLoading || polLoading) return <LoadingSpinner />;
  if (polError) return <ErrorState />;

  const policies = policiesResp?.data ?? [];
  const logRows = logResp?.data ?? [];

  const exportCount = logRows.filter((r) => r.activityType === "data_export_request").length;
  const deleteCount = logRows.filter((r) => r.activityType?.includes("erasure")).length;

  const policyCols: DataTableColumn<RetentionPolicy>[] = [
    {
      key: "dataType",
      header: "نوع البيانات",
      render: (p) => (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">{p.dataType}</Badge>
          {p.isDefault && <Badge className="bg-blue-100 text-blue-800 text-[10px]">افتراضي</Badge>}
        </div>
      ),
    },
    {
      key: "retentionYears",
      header: "مدة الاحتفاظ",
      render: (p) => (
        <span className="font-mono text-xs font-semibold">
          {p.retentionYears} {Number(p.retentionYears) === 1 ? "سنة" : "سنوات"}
        </span>
      ),
    },
    {
      key: "legalBasis",
      header: "الأساس القانوني",
      render: (p) => p.legalBasis
        ? <span className="text-xs">{p.legalBasis}</span>
        : <span className="text-muted-foreground italic">—</span>,
    },
    {
      key: "description",
      header: "الوصف",
      render: (p) => p.description
        ? <span className="text-xs text-muted-foreground line-clamp-2 max-w-md">{p.description}</span>
        : <span className="text-muted-foreground italic">—</span>,
    },
  ];

  const logCols: DataTableColumn<ProcessingLogRow>[] = [
    {
      key: "performedAt",
      header: "الوقت",
      render: (l) => (
        <span className="text-xs font-mono whitespace-nowrap">
          {new Date(l.performedAt).toLocaleString("ar-SA")}
        </span>
      ),
    },
    {
      key: "activityType",
      header: "نوع النشاط",
      render: (l) => <Badge variant="outline" className="text-[10px]">{l.activityType}</Badge>,
    },
    {
      key: "dataSubjects",
      header: "أصحاب البيانات",
      render: (l) => <span className="text-xs">{l.dataSubjects}</span>,
    },
    {
      key: "purpose",
      header: "الغرض",
      render: (l) => <span className="text-xs text-muted-foreground line-clamp-2 max-w-md">{l.purpose}</span>,
    },
    {
      key: "legalBasis",
      header: "الأساس",
      render: (l) => <Badge variant="outline" className="text-[10px]">{l.legalBasis}</Badge>,
    },
  ];

  return (
    <PageShell
      title="لوحة حماية البيانات (PDPL)"
      subtitle="نظام حماية البيانات الشخصية (المرسوم الملكي م/19) — سياسات الاحتفاظ + سجل المعالجة + إشعار الخصوصية"
      breadcrumbs={[
        { href: "/admin", label: "الإدارة" },
        { label: "PDPL" },
      ]}
    >
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> امتثال PDPL السعودي
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            هذي اللوحة مخصصة للـ Data Protection Officer + المراجع الخارجي. تجمع
            3 مكونات أساسية للامتثال:
          </p>
          <ul className="text-xs text-muted-foreground list-disc list-inside mt-1.5 space-y-0.5">
            <li><strong>إشعار الخصوصية</strong> — النص الرسمي اللي يقرأه أصحاب البيانات</li>
            <li><strong>سياسات الاحتفاظ</strong> — لكل نوع بيانات (مالي / موظف / حضور) كم سنة نحتفظ به</li>
            <li><strong>سجل المعالجة</strong> — كل عملية على بيانات شخصية (تصدير / تعديل / حذف) للمساءلة</li>
          </ul>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Database className="h-3 w-3" /> سياسات احتفاظ
            </p>
            <p className="text-lg font-bold font-mono">{formatNumber(policies.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">سجلات معالجة</p>
            <p className="text-lg font-bold font-mono">{formatNumber(logRows.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">طلبات تصدير</p>
            <p className="text-lg font-bold font-mono">{formatNumber(exportCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">طلبات حذف</p>
            <p className="text-lg font-bold font-mono">{formatNumber(deleteCount)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="policies" className="w-full">
        <TabsList>
          <TabsTrigger value="policies" className="text-xs">
            <Database className="h-3.5 w-3.5 me-1" /> سياسات الاحتفاظ ({policies.length})
          </TabsTrigger>
          <TabsTrigger value="processing" className="text-xs">
            <FileText className="h-3.5 w-3.5 me-1" /> سجل المعالجة ({logRows.length})
          </TabsTrigger>
          <TabsTrigger value="notice" className="text-xs">
            <ShieldCheck className="h-3.5 w-3.5 me-1" /> إشعار الخصوصية
          </TabsTrigger>
        </TabsList>

        <TabsContent value="policies">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سياسات الاحتفاظ</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={policyCols} data={policies}
                pageSize={30}
                emptyMessage="لا توجد سياسات احتفاظ مخصصة — يستخدم النظام الافتراضي"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="processing">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل أنشطة المعالجة</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {logError ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  هذا السجل مقيد للمستخدمين بمستوى ≥90 (DPO / GM)
                </div>
              ) : (
                <DataTable
                  columns={logCols} data={logRows}
                  pageSize={50}
                  emptyMessage="ما في نشاط معالجة مسجل"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notice">
          {notice ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {notice.title}
                  <Badge variant="outline" className="text-[10px]">v{notice.version}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  آخر تحديث: {notice.lastUpdated}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground italic">{notice.summary}</p>
                {notice.sections.map((s, i) => (
                  <div key={i} className="border-s-2 border-status-info-surface ps-4">
                    <h4 className="font-semibold text-sm mb-1">{s.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.content}</p>
                  </div>
                ))}
                <div className="pt-4 border-t flex justify-end">
                  <Button variant="outline" size="sm" asChild>
                    <a href="/api/pdpl/privacy-notice" target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3 w-3 me-1" /> JSON رسمي
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <ErrorState />
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
