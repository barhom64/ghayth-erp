import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, TrendingUp, TrendingDown, DollarSign, Calendar, Zap, CheckCircle, XCircle, Clock, AlertTriangle, FileText } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageShell } from "@/components/page-shell";

export default function TaxSystemPage() {
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const [period, setPeriod] = useState(currentPeriod);
  const [activeTab, setActiveTab] = useState<"vat" | "zatca">("vat");
  const [submissionPage, setSubmissionPage] = useState(1);
  const [submissionStatus, setSubmissionStatus] = useState("");

  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useApiQuery<any>(["tax-summary", period], `/finance/tax/summary?period=${period}`);
  const { data: declarations, isLoading: declLoading, isError: declError } = useApiQuery<any>(["tax-declarations"], "/finance/tax/declarations");
  const { data: zatcaSettings } = useApiQuery<any>(["zatca-settings-status"], "/finance/zatca/settings");
  const { data: submissionsData, isLoading: submissionsLoading, refetch: refetchSubmissions } = useApiQuery<any>(
    ["zatca-submissions", String(submissionPage), submissionStatus],
    `/finance/zatca/submissions?page=${submissionPage}&limit=20${submissionStatus ? `&status=${submissionStatus}` : ""}`
  );

  const isLoading = summaryLoading || declLoading;
  const isError = summaryError || declError;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const declItems = declarations?.data || [];

  const submissions = submissionsData?.data || [];
  const submissionStats = submissionsData?.stats || {};
  const settings = zatcaSettings?.data;

  const declarationColumns: DataTableColumn<any>[] = [
    {
      key: "period",
      header: "الفترة",
      sortable: true,
      searchable: true,
      render: (d: any) => <span className="font-medium">{d.period}</span>,
    },
    {
      key: "outputVat",
      header: "ضريبة المخرجات",
      sortable: true,
      className: "text-status-error-foreground",
      render: (d: any) => formatCurrency(Number(d.outputVat)),
    },
    {
      key: "inputVat",
      header: "ضريبة المدخلات",
      sortable: true,
      className: "text-status-success-foreground",
      render: (d: any) => formatCurrency(Number(d.inputVat)),
    },
    {
      key: "netVat",
      header: "الصافي",
      sortable: true,
      className: "font-bold",
      render: (d: any) => formatCurrency(Number(d.netVat)),
    },
    {
      key: "invoiceCount",
      header: "عدد الفواتير",
      sortable: true,
      render: (d: any) => d.invoiceCount,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (d: any) => <PageStatusBadge status={d.status} domain="tax" />,
    },
  ];

  return (
    <PageShell
      title="نظام الضرائب والفوترة الإلكترونية"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "نظام الضرائب والفوترة الإلكترونية" }]}
      loading={summaryLoading || declLoading}
      actions={
        activeTab === "vat" ? (
          <>
            <span className="text-sm text-muted-foreground">الفترة:</span>
            <Input type="month" className="w-44" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </>
        ) : undefined
      }
    >
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab("vat")}
          className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${activeTab === "vat" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-subtle"}`}
        >
          <Receipt className="h-4 w-4 inline me-1" />ضريبة القيمة المضافة
        </button>
        <button
          onClick={() => setActiveTab("zatca")}
          className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${activeTab === "zatca" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-subtle"}`}
        >
          <Zap className="h-4 w-4 inline me-1" />ربط هيئة الزكاة والضريبة
          {settings?.enabled && (
            <span className="ms-1.5 inline-flex h-2 w-2 rounded-full bg-green-500" />
          )}
        </button>
      </div>

      {activeTab === "vat" && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Card><CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-status-info-surface rounded-lg"><Receipt className="h-5 w-5 text-status-info-foreground" /></div>
              <div>
                <p className="text-xs text-muted-foreground">نسبة الضريبة</p>
                <p className="text-2xl font-bold text-status-info-foreground">{summary?.vatRate || 15}%</p>
              </div>
            </CardContent></Card>
            <Card><CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-status-error-surface rounded-lg"><TrendingUp className="h-5 w-5 text-status-error-foreground" /></div>
              <div>
                <p className="text-xs text-muted-foreground">ضريبة المخرجات</p>
                {summaryLoading ? <Skeleton className="h-7 w-20" /> : <p className="text-xl font-bold text-status-error-foreground">{formatCurrency(Number(summary?.outputVat || 0))}</p>}
              </div>
            </CardContent></Card>
            <Card><CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-status-success-surface rounded-lg"><TrendingDown className="h-5 w-5 text-status-success-foreground" /></div>
              <div>
                <p className="text-xs text-muted-foreground">ضريبة المدخلات</p>
                {summaryLoading ? <Skeleton className="h-7 w-20" /> : <p className="text-xl font-bold text-status-success-foreground">{formatCurrency(Number(summary?.inputVat || 0))}</p>}
              </div>
            </CardContent></Card>
            <Card className={summary?.status === "payable" ? "border-status-error-surface bg-status-error-surface" : "border-status-success-surface bg-status-success-surface"}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${summary?.status === "payable" ? "bg-status-error-surface" : "bg-status-success-surface"}`}>
                  <DollarSign className={`h-5 w-5 ${summary?.status === "payable" ? "text-status-error-foreground" : "text-status-success-foreground"}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">صافي الضريبة</p>
                  {summaryLoading ? <Skeleton className="h-7 w-20" /> : (
                    <p className="text-xl font-bold" style={{ color: Number(summary?.netVat || 0) >= 0 ? "#dc2626" : "#16a34a" }}>
                      {formatCurrency(Number(summary?.netVat || 0))}
                    </p>
                  )}
                  <PageStatusBadge status={summary?.status || "pending"} domain="tax" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />الإقرارات الضريبية</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={declarationColumns}
                data={declItems}
                isLoading={declLoading}
                rowKey={(d: any) => d.period}
                rowClassName={() => "hover:bg-surface-subtle"}
                emptyMessage="لا توجد إقرارات"
                pageSize={20}
                searchPlaceholder="بحث بالفترة..."
              />
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === "zatca" && (
        <div className="space-y-4">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${settings?.enabled ? "bg-status-success-surface" : "bg-surface-subtle"}`}>
                  <Zap className={`h-5 w-5 ${settings?.enabled ? "text-status-success-foreground" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">حالة الربط</p>
                  <p className={`text-sm font-bold mt-0.5 ${settings?.enabled ? "text-status-success-foreground" : "text-muted-foreground"}`}>
                    {settings?.enabled ? "مفعّل" : "غير مفعّل"}
                  </p>
                  {settings?.environment && (
                    <p className="text-xs text-muted-foreground">{settings.environment === "production" ? "إنتاج" : "اختبار"}</p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-status-success-surface rounded-lg"><CheckCircle className="h-5 w-5 text-status-success-foreground" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">فواتير مقبولة</p>
                  <p className="text-2xl font-bold text-status-success-foreground">{submissionStats.accepted ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-status-warning-surface rounded-lg"><Clock className="h-5 w-5 text-status-warning-foreground" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">معلقة / مرسلة</p>
                  <p className="text-2xl font-bold text-status-warning-foreground">{submissionStats.pending ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-status-error-surface rounded-lg"><XCircle className="h-5 w-5 text-status-error-foreground" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">مرفوضة</p>
                  <p className="text-2xl font-bold text-status-error-foreground">{submissionStats.rejected ?? 0}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {settings && (
            <Card className={`border ${settings.connectionTestStatus === "connected" ? "border-status-success-surface bg-status-success-surface" : settings.connectionTestStatus === "misconfigured" ? "border-status-warning-surface bg-status-warning-surface" : "border-border"}`}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  {settings.connectionTestStatus === "connected"
                    ? <CheckCircle className="h-5 w-5 text-status-success-foreground mt-0.5 shrink-0" />
                    : <AlertTriangle className="h-5 w-5 text-status-warning-foreground mt-0.5 shrink-0" />}
                  <div>
                    <p className="text-sm font-medium">{settings.connectionTestMessage || "لم يتم اختبار الاتصال بعد"}</p>
                    {settings.vatRegistrationNumber && (
                      <p className="text-xs text-muted-foreground mt-0.5">الرقم الضريبي: {settings.vatRegistrationNumber} | {settings.organizationName || ""}</p>
                    )}
                    {settings.lastConnectionTest && (
                      <p className="text-xs text-muted-foreground mt-0.5">آخر اختبار: {formatDateAr(settings.lastConnectionTest)}</p>
                    )}
                  </div>
                </div>
                {!settings.enabled && (
                  <Badge className="bg-surface-subtle text-muted-foreground shrink-0">الربط معطّل</Badge>
                )}
              </CardContent>
            </Card>
          )}

          {!settings && (
            <Card className="border-status-warning-surface bg-status-warning-surface">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-status-warning-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">لم يتم تهيئة الربط مع هيئة الزكاة والضريبة بعد</p>
                  <p className="text-xs text-status-warning-foreground mt-0.5">انتقل إلى الإعدادات ← هيئة الزكاة والضريبة لإعداد بيانات التسجيل والربط مع الهيئة.</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><FileText className="h-5 w-5" />سجل الإرسال للهيئة</span>
                <div className="flex items-center gap-2">
                  <Select value={submissionStatus || "_all"} onValueChange={(v) => { setSubmissionStatus(v === "_all" ? "" : v); setSubmissionPage(1); }}>
                    <SelectTrigger className="text-sm w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">جميع الحالات</SelectItem>
                      <SelectItem value="accepted">مقبولة</SelectItem>
                      <SelectItem value="submitted">مرسلة</SelectItem>
                      <SelectItem value="pending">معلقة</SelectItem>
                      <SelectItem value="rejected">مرفوضة</SelectItem>
                      <SelectItem value="error">خطأ</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => refetchSubmissions()}>تحديث</Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={[
                  { key: "invoiceRef", header: "المرجع", render: (s: any) => <span className="font-medium">{s.invoiceRef || `#${s.entityId}`}</span> },
                  { key: "entityType", header: "النوع", render: (s: any) => (
                    <Badge className="text-xs bg-surface-subtle text-status-neutral-foreground">
                      {s.entityType === "invoice" ? "فاتورة" : "مصروف"}
                    </Badge>
                  ) },
                  { key: "status", header: "الحالة", render: (s: any) => (
                    <PageStatusBadge status={s.status || "pending"} domain="zatca" />
                  ) },
                  { key: "environment", header: "البيئة", render: (s: any) => (
                    <Badge className={`text-xs ${s.environment === "production" ? "bg-status-info-surface text-status-info-foreground" : "bg-surface-subtle text-muted-foreground"}`}>
                      {s.environment === "production" ? "إنتاج" : "اختبار"}
                    </Badge>
                  ) },
                  { key: "submittedAt", header: "تاريخ الإرسال", render: (s: any) => <span className="text-xs text-muted-foreground">{s.submittedAt ? formatDateAr(s.submittedAt) : "-"}</span> },
                  { key: "zatcaUuid", header: "المعرف الفريد", render: (s: any) => <span className="font-mono text-xs text-muted-foreground max-w-[120px] truncate block">{s.zatcaUuid || "-"}</span> },
                ] as DataTableColumn<any>[]}
                data={submissions}
                isLoading={submissionsLoading}
                pageSize={20}
                total={submissionsData?.total ?? 0}
                page={submissionPage}
                onPageChange={setSubmissionPage}
                emptyMessage="لا توجد سجلات إرسال — قم بإرسال فاتورة مربوطة بالهيئة لتظهر هنا"
                searchPlaceholder={null}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
