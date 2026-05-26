import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
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
} from "@workspace/ui-core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, Download, Plus, Eye, AlertTriangle } from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";

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

  const filtered = applyFilters(runs, filters, {
    searchFields: ["period", "bankCode", "fileName"],
    statusField: "status",
    dateField: "createdAt",
  });

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
          <Link href={`/hr/wps/${r.id}`}>
            <Button variant="ghost" size="sm" title="تفاصيل">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          {r.recordCount > 0 && (
            <a href={`/api/hr/wps/runs/${r.id}/file`} download>
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
        <GuardedButton
          perm="hr.payroll.wps:create"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4 ml-1" /> تشغيل WPS جديد
        </GuardedButton>
      }
    >
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
      />

      <DataTable
        data={filtered}
        columns={columns}
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
              disabled={!selectedPayrollId || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  payrollRunId: Number(selectedPayrollId),
                  bankCode: selectedBank || undefined,
                  format: selectedFormat,
                })
              }
            >
              {createMut.isPending ? "جاري التوليد..." : "توليد الملف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
