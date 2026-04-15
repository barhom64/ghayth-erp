import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Receipt, TrendingUp, TrendingDown, DollarSign, Calendar, Zap, CheckCircle, XCircle, Clock, AlertTriangle, FileText } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageShell } from "@/components/page-shell";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  accepted: { label: "مقبولة", color: "text-green-700", bg: "bg-green-100", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  submitted: { label: "مرسلة", color: "text-blue-700", bg: "bg-blue-100", icon: <Clock className="h-3.5 w-3.5" /> },
  pending: { label: "معلقة", color: "text-yellow-700", bg: "bg-yellow-100", icon: <Clock className="h-3.5 w-3.5" /> },
  rejected: { label: "مرفوضة", color: "text-red-700", bg: "bg-red-100", icon: <XCircle className="h-3.5 w-3.5" /> },
  error: { label: "خطأ", color: "text-red-700", bg: "bg-red-100", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
};

export default function TaxSystemPage() {
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const [period, setPeriod] = useState(currentPeriod);
  const [activeTab, setActiveTab] = useState<"vat" | "zatca">("vat");
  const [submissionPage, setSubmissionPage] = useState(1);
  const [submissionStatus, setSubmissionStatus] = useState("");

  const { data: summary, isLoading: summaryLoading } = useApiQuery<any>(["tax-summary", period], `/finance/tax/summary?period=${period}`);
  const { data: declarations, isLoading: declLoading } = useApiQuery<any>(["tax-declarations"], "/finance/tax/declarations");
  const { data: zatcaSettings } = useApiQuery<any>(["zatca-settings-status"], "/finance/zatca/settings");
  const { data: submissionsData, isLoading: submissionsLoading, refetch: refetchSubmissions } = useApiQuery<any>(
    ["zatca-submissions", String(submissionPage), submissionStatus],
    `/finance/zatca/submissions?page=${submissionPage}&limit=20${submissionStatus ? `&status=${submissionStatus}` : ""}`
  );

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
      className: "text-red-600",
      render: (d: any) => formatCurrency(Number(d.outputVat)),
    },
    {
      key: "inputVat",
      header: "ضريبة المدخلات",
      sortable: true,
      className: "text-green-600",
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
      render: (d: any) => (
        <Badge className={d.status === "submitted" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
          {d.status === "submitted" ? "مقدم" : "معلق"}
        </Badge>
      ),
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
            <span className="text-sm text-gray-500">الفترة:</span>
            <Input type="month" className="w-44" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </>
        ) : undefined
      }
    >
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab("vat")}
          className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${activeTab === "vat" ? "bg-primary text-primary-foreground" : "text-gray-600 hover:bg-gray-100"}`}
        >
          <Receipt className="h-4 w-4 inline me-1" />ضريبة القيمة المضافة
        </button>
        <button
          onClick={() => setActiveTab("zatca")}
          className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${activeTab === "zatca" ? "bg-primary text-primary-foreground" : "text-gray-600 hover:bg-gray-100"}`}
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
              <div className="p-2 bg-blue-100 rounded-lg"><Receipt className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-gray-500">نسبة الضريبة</p>
                <p className="text-2xl font-bold text-blue-600">{summary?.vatRate || 15}%</p>
              </div>
            </CardContent></Card>
            <Card><CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><TrendingUp className="h-5 w-5 text-red-600" /></div>
              <div>
                <p className="text-xs text-gray-500">ضريبة المخرجات</p>
                {summaryLoading ? <Skeleton className="h-7 w-20" /> : <p className="text-xl font-bold text-red-600">{formatCurrency(Number(summary?.outputVat || 0))}</p>}
              </div>
            </CardContent></Card>
            <Card><CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg"><TrendingDown className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-xs text-gray-500">ضريبة المدخلات</p>
                {summaryLoading ? <Skeleton className="h-7 w-20" /> : <p className="text-xl font-bold text-green-600">{formatCurrency(Number(summary?.inputVat || 0))}</p>}
              </div>
            </CardContent></Card>
            <Card className={summary?.status === "payable" ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${summary?.status === "payable" ? "bg-red-100" : "bg-green-100"}`}>
                  <DollarSign className={`h-5 w-5 ${summary?.status === "payable" ? "text-red-600" : "text-green-600"}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">صافي الضريبة</p>
                  {summaryLoading ? <Skeleton className="h-7 w-20" /> : (
                    <p className="text-xl font-bold" style={{ color: Number(summary?.netVat || 0) >= 0 ? "#dc2626" : "#16a34a" }}>
                      {formatCurrency(Number(summary?.netVat || 0))}
                    </p>
                  )}
                  <Badge className={`text-xs mt-1 ${summary?.status === "payable" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                    {summary?.status === "payable" ? "مستحقة الدفع" : "قابلة للاسترداد"}
                  </Badge>
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
                rowClassName={() => "hover:bg-gray-50"}
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
                <div className={`p-2 rounded-lg ${settings?.enabled ? "bg-green-100" : "bg-gray-100"}`}>
                  <Zap className={`h-5 w-5 ${settings?.enabled ? "text-green-600" : "text-gray-400"}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">حالة الربط</p>
                  <p className={`text-sm font-bold mt-0.5 ${settings?.enabled ? "text-green-600" : "text-gray-500"}`}>
                    {settings?.enabled ? "مفعّل" : "غير مفعّل"}
                  </p>
                  {settings?.environment && (
                    <p className="text-xs text-gray-400">{settings.environment === "production" ? "إنتاج" : "اختبار"}</p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="h-5 w-5 text-green-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">فواتير مقبولة</p>
                  <p className="text-2xl font-bold text-green-600">{submissionStats.accepted ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg"><Clock className="h-5 w-5 text-yellow-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">معلقة / مرسلة</p>
                  <p className="text-2xl font-bold text-yellow-600">{submissionStats.pending ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg"><XCircle className="h-5 w-5 text-red-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">مرفوضة</p>
                  <p className="text-2xl font-bold text-red-600">{submissionStats.rejected ?? 0}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {settings && (
            <Card className={`border ${settings.connectionTestStatus === "connected" ? "border-green-200 bg-green-50" : settings.connectionTestStatus === "misconfigured" ? "border-yellow-200 bg-yellow-50" : "border-gray-200"}`}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  {settings.connectionTestStatus === "connected"
                    ? <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                    : <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />}
                  <div>
                    <p className="text-sm font-medium">{settings.connectionTestMessage || "لم يتم اختبار الاتصال بعد"}</p>
                    {settings.vatRegistrationNumber && (
                      <p className="text-xs text-gray-500 mt-0.5">الرقم الضريبي: {settings.vatRegistrationNumber} | {settings.organizationName || ""}</p>
                    )}
                    {settings.lastConnectionTest && (
                      <p className="text-xs text-gray-400 mt-0.5">آخر اختبار: {formatDateAr(settings.lastConnectionTest)}</p>
                    )}
                  </div>
                </div>
                {!settings.enabled && (
                  <Badge className="bg-gray-100 text-gray-600 shrink-0">الربط معطّل</Badge>
                )}
              </CardContent>
            </Card>
          )}

          {!settings && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">لم يتم تهيئة الربط مع هيئة الزكاة والضريبة بعد</p>
                  <p className="text-xs text-yellow-700 mt-0.5">انتقل إلى الإعدادات ← هيئة الزكاة والضريبة لإعداد بيانات التسجيل والربط مع الهيئة.</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><FileText className="h-5 w-5" />سجل الإرسال للهيئة</span>
                <div className="flex items-center gap-2">
                  <select
                    className="text-sm border rounded-md p-1.5"
                    value={submissionStatus}
                    onChange={(e) => { setSubmissionStatus(e.target.value); setSubmissionPage(1); }}
                  >
                    <option value="">جميع الحالات</option>
                    <option value="accepted">مقبولة</option>
                    <option value="submitted">مرسلة</option>
                    <option value="pending">معلقة</option>
                    <option value="rejected">مرفوضة</option>
                    <option value="error">خطأ</option>
                  </select>
                  <Button variant="outline" size="sm" onClick={() => refetchSubmissions()}>تحديث</Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={[
                  { key: "invoiceRef", header: "المرجع", render: (s: any) => <span className="font-medium">{s.invoiceRef || `#${s.entityId}`}</span> },
                  { key: "entityType", header: "النوع", render: (s: any) => (
                    <Badge className="text-xs bg-gray-100 text-gray-700">
                      {s.entityType === "invoice" ? "فاتورة" : "مصروف"}
                    </Badge>
                  ) },
                  { key: "status", header: "الحالة", render: (s: any) => {
                    const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.pending!;
                    return (
                      <Badge className={`text-xs flex items-center gap-1 w-fit ${cfg.bg} ${cfg.color}`}>
                        {cfg.icon}{cfg.label}
                      </Badge>
                    );
                  } },
                  { key: "environment", header: "البيئة", render: (s: any) => (
                    <Badge className={`text-xs ${s.environment === "production" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                      {s.environment === "production" ? "إنتاج" : "اختبار"}
                    </Badge>
                  ) },
                  { key: "submittedAt", header: "تاريخ الإرسال", render: (s: any) => <span className="text-xs text-gray-500">{s.submittedAt ? formatDateAr(s.submittedAt) : "-"}</span> },
                  { key: "zatcaUuid", header: "المعرف الفريد", render: (s: any) => <span className="font-mono text-xs text-gray-400 max-w-[120px] truncate block">{s.zatcaUuid || "-"}</span> },
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
