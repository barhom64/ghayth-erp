import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation, asList, apiUrl } from "@/lib/api";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, Download, Plus, Eye, AlertTriangle, CheckCircle } from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";

import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
const WPS_FORMATS = [
  { value: "generic_pipe", label: "صيغة عامة (Pipe-delimited)" },
  { value: "alrajhi", label: "الراجحي" },
  { value: "ncb", label: "الأهلي (NCB)" },
  { value: "riyad", label: "الرياض" },
  { value: "alinma", label: "الإنماء" },
  { value: "albilad", label: "البلاد" },
];

interface WpsRunRow {
  id: number;
  period: string;
  bankCode: string;
  fileName: string | null;
  status: string;
  totalAmount: number | string;
  recordCount: number;
  submittedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

interface PayrollRunOption {
  id: number;
  period: string;
  status: string;
  totalNet: number | string;
}

export default function WpsRunsPage() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPayrollId, setSelectedPayrollId] = useState<string>("");
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [selectedFormat, setSelectedFormat] = useState<string>("generic_pipe");

  const { data: runsData, isLoading, isError, refetch } = useApiQuery<{ data: WpsRunRow[] }>(
    ["wps-runs"],
    "/hr/wps/runs",
  );

  const { data: payrollData } = useApiQuery<{ data: PayrollRunOption[] }>(
    ["hr-payroll-runs-approved"],
    "/hr/payroll",
  );

  const { data: settings } = useApiQuery<{ bankCode: string | null; bankIban: string | null; isActive: boolean }>(
    ["wps-settings"],
    "/hr/wps/settings",
  );

  const createMut = useApiMutation<
    { wpsRunId: number; skippedCount: number; recordCount: number },
    { payrollRunId: number; bankCode?: string; format?: string }
  >(
    () => "/hr/wps/runs",
    "POST",
    [["wps-runs"]],
    {
      successMessage: "تم إنشاء تشغيل WPS",
      onSuccess: (data) => {
        setCreateOpen(false);
        setSelectedPayrollId("");
        if (data?.skippedCount && data.skippedCount > 0) {
          toast({
            title: "تم التوليد مع تخطي بعض الموظفين",
            description: `تم تخطي ${data.skippedCount} موظف — افتح التفاصيل لمراجعة الأسباب`,
            variant: "default",
          });
        }
        if (data?.wpsRunId) navigate(`/hr/wps/${data.wpsRunId}`);
      },
    },
  );

  const runs = asList(runsData?.data || []);
  const payrolls = asList(payrollData?.data || []).filter((p: PayrollRunOption) => p.status === "approved" || p.status === "paid");

  // Preflight: as soon as the operator picks a payroll in the dialog, fetch
  // /hr/wps/preflight/:id and show eligible vs skipped counts BEFORE generating.
  // Skipped employees fall into 4 buckets; surfacing them up front lets the
  // operator fix IBANs / loan-eaten salaries on the HR side first, instead of
  // discovering the issue inside an already-built run.
  interface PreflightResponse {
    payrollRunId: number;
    period: string;
    canGenerate: boolean;
    eligibleCount: number;
    skippedCount: number;
    totalAmount: number;
    eligible: Array<{ employeeId: number; employeeName: string; amount: number }>;
    missingIban: Array<{ employeeId: number; employeeName: string }>;
    missingId: Array<{ employeeId: number; employeeName: string }>;
    invalidIban: Array<{ employeeId: number; employeeName: string; iban: string }>;
    zeroAmount: Array<{ employeeId: number; employeeName: string; netSalary: number }>;
  }
  const { data: preflight, isLoading: preflightLoading } = useApiQuery<PreflightResponse>(
    ["wps-preflight", selectedPayrollId],
    selectedPayrollId ? `/hr/wps/preflight/${selectedPayrollId}` : null,
  );

  const filtered = applyFilters(runs, filters, {
    searchFields: ["period", "bankCode", "fileName"],
    statusField: "status",
    dateField: "createdAt",
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const columns: DataTableColumn<WpsRunRow>[] = [
    {
      key: "period",
      header: "الفترة",
      sortable: true,
      render: (r) => <span className="font-mono">{r.period}</span>,
    },
    {
      key: "bankCode",
      header: "البنك",
      sortable: true,
      render: (r) => <span>{r.bankCode}</span>,
    },
    {
      key: "recordCount",
      header: "عدد الموظفين",
      sortable: true,
      render: (r) => <span>{r.recordCount}</span>,
    },
    {
      key: "totalAmount",
      header: "الإجمالي",
      sortable: true,
      render: (r) => <span className="font-medium">{formatCurrency(Number(r.totalAmount))}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (r) => <PageStatusBadge status={r.status} />,
    },
    {
      key: "createdAt",
      header: "تاريخ الإنشاء",
      sortable: true,
      render: (r) => <span>{formatDateAr(r.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (r) => (
        <div className="flex gap-1">
          <Button asChild variant="ghost" size="sm" title="تفاصيل"><Link href={`/hr/wps/${r.id}`}>
              <Eye className="h-4 w-4" />
            </Link></Button>
          {r.recordCount > 0 && (
            <a href={apiUrl(`/hr/wps/runs/${r.id}/file`)} download>
              <Button variant="ghost" size="sm" title="تنزيل الملف">
                <Download className="h-4 w-4" />
              </Button>
            </a>
          )}
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <PageShell
      title="نظام حماية الأجور (WPS)"
      breadcrumbs={[
        { label: "الرئيسية", href: "/" },
        { label: "الموارد البشرية", href: "/hr/payroll" },
        { label: "WPS" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_hr_wps_runs"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "تشغيلات WPS", total: printRows.length },
              items: printRows.map((r: any) => ({
                "رقم التشغيل": r.id,
                "الفترة": r.period || "—",
                "البنك": r.bankCode || "—",
                "عدد الموظفين": r.recordCount ?? 0,
                "إجمالي المبلغ": r.totalAmount ?? 0,
                "تاريخ الإنشاء": r.createdAt || "—",
                "الحالة": r.status || "—",
              })),
            })}
          />
          <GuardedButton
            perm="hr.payroll.wps:create"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4 ml-1" /> تشغيل WPS جديد
          </GuardedButton>
        </div>
      }
    >
      <HrTabsNav />
      {!settings?.isActive && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 mb-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-amber-900">إعدادات WPS غير مكتملة</div>
            <div className="text-amber-800">
              يرجى ضبط رمز البنك و IBAN الشركة في إعدادات WPS قبل توليد الملف.
            </div>
          </div>
        </div>
      )}

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالفترة أو البنك...",
          statuses: [
            { value: "draft", label: "مسودة" },
            { value: "submitted", label: "مُرسل" },
            { value: "acknowledged", label: "مُؤكد" },
            { value: "partial", label: "تنفيذ جزئي" },
            { value: "rejected", label: "مرفوض" },
          ],
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "period", label: "الفترة" },
              { key: "bankName", label: "البنك" },
              { key: "totalEmployees", label: "عدد الموظفين" },
              { key: "totalAmount", label: "إجمالي المبلغ" },
              { key: "status", label: "الحالة" },
              { key: "submittedAt", label: "تاريخ الإرسال" },
              { key: "ackedAt", label: "تاريخ التأكيد" },
            ],
            "ملفات-WPS",
          )
        }
      />

      <DataTable
        data={filtered}
        columns={columns}
        onSortedDataChange={setPrintRows}
        emptyMessage="لا توجد تشغيلات WPS — ابدأ بإنشاء واحد من مسير راتب معتمد"
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              تشغيل WPS جديد
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>مسير الرواتب المعتمد</Label>
              <Select value={selectedPayrollId} onValueChange={setSelectedPayrollId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مسير راتب معتمد" />
                </SelectTrigger>
                <SelectContent>
                  {payrolls.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      لا توجد مسيرات معتمدة — اعتمد مسير راتب أولاً
                    </div>
                  ) : (
                    payrolls.map((p: PayrollRunOption) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.period} — {formatCurrency(Number(p.totalNet))} ({p.status === "paid" ? "مدفوع" : "معتمد"})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedPayrollId && (
              <div className="rounded-md border p-3 bg-muted/30">
                {preflightLoading ? (
                  <div className="text-sm text-muted-foreground">جاري فحص الأهلية...</div>
                ) : preflight ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <CheckCircle className={`h-4 w-4 ${preflight.eligibleCount > 0 ? "text-green-600" : "text-muted-foreground"}`} />
                        مؤهلون للتحويل
                      </div>
                      <div className="text-sm">
                        <span className="font-bold text-green-700">{preflight.eligibleCount}</span> موظف
                        {preflight.totalAmount > 0 && (
                          <span className="text-muted-foreground"> — {formatCurrency(preflight.totalAmount)}</span>
                        )}
                      </div>
                    </div>
                    {preflight.skippedCount > 0 && (
                      <div className="space-y-1 text-xs pt-2 border-t">
                        <div className="font-medium text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          سيتم تخطي {preflight.skippedCount} موظف
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                          {preflight.missingIban.length > 0 && (
                            <div>لا IBAN: <span className="font-medium text-foreground">{preflight.missingIban.length}</span></div>
                          )}
                          {preflight.invalidIban.length > 0 && (
                            <div>IBAN غير صحيح: <span className="font-medium text-foreground">{preflight.invalidIban.length}</span></div>
                          )}
                          {preflight.missingId.length > 0 && (
                            <div>لا إقامة/هوية: <span className="font-medium text-foreground">{preflight.missingId.length}</span></div>
                          )}
                          {preflight.zeroAmount.length > 0 && (
                            <div>صافي صفر: <span className="font-medium text-foreground">{preflight.zeroAmount.length}</span></div>
                          )}
                        </div>
                      </div>
                    )}
                    {!preflight.canGenerate && (
                      <div className="text-xs text-red-700 pt-2 border-t flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        مسير الرواتب يجب أن يكون معتمداً أو مدفوعاً قبل توليد WPS
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            <div>
              <Label>صيغة البنك</Label>
              <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WPS_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>رمز البنك (اختياري — يستخدم رمز الإعدادات إن لم يُحدد)</Label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2"
                value={selectedBank}
                placeholder={settings?.bankCode || "مثال: RJHISARI"}
                onChange={(e) => setSelectedBank(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              إلغاء
            </Button>
            <Button
              disabled={
                !selectedPayrollId ||
                createMut.isPending ||
                preflightLoading ||
                (preflight ? !preflight.canGenerate || preflight.eligibleCount === 0 : false)
              }
              onClick={() =>
                createMut.mutate({
                  payrollRunId: Number(selectedPayrollId),
                  bankCode: selectedBank || undefined,
                  format: selectedFormat,
                })
              }
            >
              {createMut.isPending
                ? "جاري التوليد..."
                : preflight && preflight.eligibleCount > 0
                ? `توليد ملف ${preflight.eligibleCount} موظف`
                : "توليد الملف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
