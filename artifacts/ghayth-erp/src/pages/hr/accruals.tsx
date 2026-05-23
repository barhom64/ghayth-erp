import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PageShell } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import { AlertCircle, Play } from "lucide-react";

/**
 * HR-010 — Monthly accruals page. Previews the leave + EOS accruals for a
 * period via GET /hr/accruals/preview, then posts them with
 * POST /hr/accruals/monthly. The POST creates a journal entry (ref
 * HR-ACCRUAL-YYYY-MM) so the action is gated behind explicit confirmation.
 */
interface AccrualRow {
  employeeId: number;
  employeeName: string;
  salary: number;
  yearsOfService: number;
  leaveAccrual: number;
  eosAccrual: number;
}
interface AccrualPreview {
  period: string;
  alreadyPosted: boolean;
  existingJournalId: number | null;
  employeeCount: number;
  totalLeaveAccrual: number;
  totalEosAccrual: number;
  total: number;
  rows: AccrualRow[];
}

function defaultPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AccrualsPage() {
  const [period, setPeriod] = useState(defaultPeriod());
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading, isError, refetch } = useApiQuery<AccrualPreview>(
    ["hr-accruals-preview", period],
    `/hr/accruals/preview?period=${period}`,
  );

  const runMut = useApiMutation<any, { period: string }>(
    "/hr/accruals/monthly",
    "POST",
    [["hr-accruals-preview"]],
    {
      successMessage: "تم ترحيل الاستحقاقات",
      onSuccess: () => {
        setConfirming(false);
        refetch();
      },
    },
  );

  const columns: DataTableColumn<AccrualRow>[] = [
    { key: "employeeName", header: "الموظف" },
    { key: "salary", header: "الراتب", render: (r) => formatCurrency(r.salary) },
    { key: "yearsOfService", header: "سنوات الخدمة", render: (r) => r.yearsOfService.toFixed(1) },
    { key: "leaveAccrual", header: "استحقاق إجازة", render: (r) => formatCurrency(r.leaveAccrual) },
    { key: "eosAccrual", header: "استحقاق نهاية خدمة", render: (r) => formatCurrency(r.eosAccrual) },
  ];

  return (
    <PageShell
      title="الاستحقاقات الشهرية"
      subtitle="معاينة وترحيل قيد الإجازات + مكافأة نهاية الخدمة شهريًا"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "الاستحقاقات الشهرية" }]}
      actions={
        <div className="flex items-center gap-2">
          <Label className="text-sm shrink-0">الفترة</Label>
          <Input type="month" dir="ltr" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-36" />
        </div>
      }
    >
      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorState />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">عدد الموظفين</p>
              <p className="text-xl font-bold">{data?.employeeCount ?? 0}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">استحقاق الإجازات</p>
              <p className="text-xl font-bold">{formatCurrency(data?.totalLeaveAccrual ?? 0)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">استحقاق نهاية الخدمة</p>
              <p className="text-xl font-bold">{formatCurrency(data?.totalEosAccrual ?? 0)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">الإجمالي</p>
              <p className="text-xl font-bold">{formatCurrency(data?.total ?? 0)}</p>
            </CardContent></Card>
          </div>

          {data?.alreadyPosted && (
            <div className="flex items-center gap-2 text-sm text-status-info-foreground bg-status-info-surface border border-status-info-surface rounded-md p-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>تم ترحيل استحقاقات هذه الفترة مسبقًا (قيد رقم #{data.existingJournalId}).</span>
            </div>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">تفصيل الاستحقاقات</CardTitle>
              {!data?.alreadyPosted && (
                confirming ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-status-warning-foreground">سيُرحَّل قيد GL — لا يمكن التراجع.</span>
                    <GuardedButton
                      perm="hr.payroll:update"
                      variant="destructive"
                      size="sm"
                      disabled={runMut.isPending || (data?.employeeCount ?? 0) === 0}
                      onClick={() => runMut.mutate({ period })}
                      rateLimitAware
                    >
                      {runMut.isPending ? "جاري الترحيل..." : "تأكيد الترحيل"}
                    </GuardedButton>
                    <button className="text-xs text-muted-foreground underline" onClick={() => setConfirming(false)}>إلغاء</button>
                  </div>
                ) : (
                  <GuardedButton
                    perm="hr.payroll:update"
                    size="sm"
                    disabled={(data?.employeeCount ?? 0) === 0}
                    onClick={() => setConfirming(true)}
                  >
                    <Play className="h-4 w-4 ml-1" /> ترحيل الاستحقاقات
                  </GuardedButton>
                )
              )}
            </CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                data={data?.rows ?? []}
                emptyMessage="لا يوجد موظفون مؤهّلون للاستحقاق في هذه الفترة"
                noToolbar
              />
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
