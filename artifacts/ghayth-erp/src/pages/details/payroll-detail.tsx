import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ActionHistory } from "@/components/approval-actions";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Wallet, Users } from "lucide-react";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

/**
 * PayrollDetail — detail page for a payroll *run*.
 *
 * `GET /hr/payroll/:id` returns a run aggregate (`payroll_runs` + its
 * `payroll_lines`), not a single payslip. The page therefore shows the
 * run summary — period, headcount, the run-level totals — and a table
 * of the per-employee lines (HR functional audit M6).
 */

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  pending_approval: "بانتظار الاعتماد",
  completed: "معتمد",
  posted: "مُرحَّل محاسبيًا",
  cancelled: "ملغى",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "posted" || status === "completed") return "success" as const;
  if (status === "cancelled") return "destructive" as const;
  if (status === "pending_approval") return "info" as const;
  if (status === "draft") return "muted" as const;
  return "default" as const;
}

function formatPeriod(payroll: any): string {
  if (!payroll) return "-";
  if (payroll.period) return payroll.period;
  if (payroll.month) return String(payroll.month);
  return "-";
}

interface PayrollLine {
  id: number;
  employeeName?: string | null;
  basic?: number | string | null;
  housingAllowance?: number | string | null;
  transportAllowance?: number | string | null;
  overtime?: number | string | null;
  commission?: number | string | null;
  gosi?: number | string | null;
  lateDeduction?: number | string | null;
  absenceDeduction?: number | string | null;
  violationDeduction?: number | string | null;
  loanDeduction?: number | string | null;
  netSalary?: number | string | null;
}

const lineAllowances = (l: PayrollLine) =>
  Number(l.housingAllowance || 0) + Number(l.transportAllowance || 0);
const lineDeductions = (l: PayrollLine) =>
  Number(l.gosi || 0) + Number(l.lateDeduction || 0) + Number(l.absenceDeduction || 0) +
  Number(l.violationDeduction || 0) + Number(l.loanDeduction || 0);

export default function PayrollDetail() {
  const [, params] = useRoute("/hr/payroll/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();

  const { extraTabs, hideTabs } = useRegistryTabs("payroll_run", id ?? 0);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["payroll", String(id)],
    id ? `/hr/payroll/${id}` : null,
    !!id
  );

  const payroll = data;
  const [acting, setActing] = useState(false);

  const lines: PayrollLine[] = useMemo(
    () => (Array.isArray(payroll?.lines) ? payroll.lines : []),
    [payroll?.lines]
  );

  // Run-level totals. The server already projects these (gated on the
  // payroll role); fall back to summing the lines so the page is correct
  // even when only `lines` come through.
  const totals = useMemo(() => {
    const basic = payroll?.basicSalary != null
      ? Number(payroll.basicSalary)
      : lines.reduce((s, l) => s + Number(l.basic || 0), 0);
    const allowances = payroll?.allowances != null
      ? Number(payroll.allowances)
      : lines.reduce((s, l) => s + lineAllowances(l), 0);
    const overtime = lines.reduce((s, l) => s + Number(l.overtime || 0), 0);
    const deductions = payroll?.deductions != null
      ? Number(payroll.deductions)
      : lines.reduce((s, l) => s + lineDeductions(l), 0);
    const net = Number(payroll?.netSalary ?? payroll?.totalNet ?? 0)
      || lines.reduce((s, l) => s + Number(l.netSalary || 0), 0);
    return { basic, allowances, overtime, deductions, net };
  }, [payroll, lines]);

  const employeeCount = Number(payroll?.employeeCount ?? lines.length);

  // Approve: PATCH /hr/payroll/:id/approve (pending_approval -> completed).
  // Post:    PATCH /hr/payroll/:id { status: "posted" } (-> posted, journal).
  const runPayrollAction = async (kind: "approve" | "post") => {
    setActing(true);
    try {
      if (kind === "approve") {
        await apiFetch(`/hr/payroll/${id}/approve`, { method: "PATCH", body: JSON.stringify({}) });
        toast({ title: "تمت الموافقة على مسير الرواتب" });
      } else {
        await apiFetch(`/hr/payroll/${id}`, { method: "PATCH", body: JSON.stringify({ status: "posted" }) });
        toast({ title: "تم ترحيل مسير الرواتب محاسبيًا" });
      }
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر تنفيذ الإجراء", description: err?.fix ?? err?.message });
    } finally {
      setActing(false);
    }
  };

  const printSections: PrintSection[] = useMemo(() => {
    if (!payroll) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: payroll.reference || payroll.ref || `PAY-${id}` },
          { label: "الفترة", value: formatPeriod(payroll) },
          { label: "عدد الموظفين", value: formatNumber(employeeCount) },
          { label: "الحالة", value: STATUS_LABELS[payroll.status] || payroll.status || "-" },
          { label: "نفّذه", value: payroll.runByName || "-" },
          { label: "تاريخ الإنشاء", value: formatDateAr(payroll.createdAt) },
        ],
      },
      {
        kind: "summary",
        items: [
          { label: "إجمالي الراتب الأساسي", value: formatCurrency(totals.basic) },
          { label: "إجمالي البدلات", value: formatCurrency(totals.allowances) },
          { label: "إجمالي العمل الإضافي", value: formatCurrency(totals.overtime) },
          { label: "إجمالي الخصومات", value: formatCurrency(totals.deductions) },
          { label: "إجمالي صافي المسير", value: formatCurrency(totals.net), bold: true },
        ],
      },
    ];
    if (lines.length > 0) {
      sections.push({
        kind: "text",
        title: "كشف الموظفين",
        body: lines
          .map((l, i) => `${i + 1}. ${l.employeeName || `موظف #${l.id}`} — صافي ${formatCurrency(Number(l.netSalary || 0))}`)
          .join("\n"),
      });
    }
    if (payroll.notes) {
      sections.push({ kind: "text", title: "ملاحظات", body: payroll.notes });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "أعدّه", name: payroll.runByName || "" },
        { label: "المعتمد", name: payroll.approvedByName || "" },
      ],
    });
    return sections;
  }, [payroll, totals, lines, employeeCount, id]);

  const lineColumns: DataTableColumn<PayrollLine>[] = [
    { key: "employeeName", header: "الموظف", render: (l) => <span className="font-medium">{l.employeeName || `موظف #${l.id}`}</span> },
    { key: "basic", header: "الأساسي", render: (l) => formatCurrency(Number(l.basic || 0)) },
    { key: "allowances", header: "البدلات", render: (l) => formatCurrency(lineAllowances(l)) },
    { key: "overtime", header: "الإضافي", render: (l) => formatCurrency(Number(l.overtime || 0)) },
    { key: "deductions", header: "الخصومات", render: (l) => <span className="text-status-error-foreground">{formatCurrency(lineDeductions(l))}</span> },
    { key: "netSalary", header: "الصافي", render: (l) => <span className="font-semibold text-status-success-foreground">{formatCurrency(Number(l.netSalary || 0))}</span> },
  ];

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Run summary */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            ملخّص مسير الرواتب
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="border-b pb-3">
            <p className="text-xs text-muted-foreground mb-1">إجمالي صافي المسير</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-status-success-foreground">
                {formatCurrency(totals.net)}
              </span>
              <span className="text-xs text-muted-foreground">ر.س</span>
            </div>
            <p className="mt-2 text-sm text-status-neutral-foreground flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              {formatNumber(employeeCount)} موظف — فترة {formatPeriod(payroll)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">إجمالي الراتب الأساسي</p>
              <span className="text-status-neutral-foreground font-medium">{formatCurrency(totals.basic)}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">إجمالي البدلات</p>
              <span className="text-status-neutral-foreground">{formatCurrency(totals.allowances)}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">إجمالي العمل الإضافي</p>
              <span className="text-status-neutral-foreground">{formatCurrency(totals.overtime)}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">إجمالي الخصومات</p>
              <span className="text-status-error-foreground">{formatCurrency(totals.deductions)}</span>
            </div>
            {payroll?.reference && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المرجع</p>
                <span className="text-status-neutral-foreground font-mono text-xs">{payroll.reference}</span>
              </div>
            )}
            {payroll?.runByName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">نفّذ المسير</p>
                <span className="text-status-neutral-foreground">{payroll.runByName}</span>
              </div>
            )}
            {payroll?.approvedAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الاعتماد</p>
                <span className="text-status-neutral-foreground">{formatDateAr(payroll.approvedAt)}</span>
              </div>
            )}
            {payroll?.paidAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الصرف</p>
                <span className="text-status-neutral-foreground">{formatDateAr(payroll.paidAt)}</span>
              </div>
            )}
          </div>

          {payroll?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{payroll.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Payroll lifecycle — pending_approval → completed → posted. */}
        {id && payroll && ["pending_approval", "completed"].includes(payroll.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات المسير</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {payroll.status === "pending_approval" && (
                <GuardedButton
                  perm="hr:approve"
                  className="w-full"
                  disabled={acting}
                  onClick={() => runPayrollAction("approve")}
                >
                  اعتماد المسير
                </GuardedButton>
              )}
              {payroll.status === "completed" && (
                <GuardedButton
                  perm="hr:update"
                  className="w-full"
                  disabled={acting}
                  onClick={() => runPayrollAction("post")}
                >
                  ترحيل المسير محاسبيًا
                </GuardedButton>
              )}
            </CardContent>
          </Card>
        )}

        {id && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionHistory entityType="payroll" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Per-employee payroll lines */}
      <Card className="md:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            كشف الموظفين ({formatNumber(employeeCount)})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={lineColumns}
            data={lines}
            noToolbar
            emptyMessage="لا توجد بنود لهذا المسير"
            pageSize={25}
          />
        </CardContent>
      </Card>

      {id && <ApprovalTimeline entityType="payroll" entityId={id} />}
      {id && <EntityComments entityType="payroll" entityId={id} />}
      {id && <EntityTags entityType="payroll" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={payroll?.reference ? `مسير ${payroll.reference}` : `مسير الرواتب ${formatPeriod(payroll)}`}
      subtitle={
        payroll
          ? `${formatNumber(employeeCount)} موظف — فترة ${formatPeriod(payroll)}`
          : undefined
      }
      backPath="/hr/payroll"
      refNumber={payroll?.reference || (id ? `PAY-${id}` : undefined)}
      status={
        payroll
          ? {
              label: STATUS_LABELS[payroll.status] || payroll.status || "-",
              tone: statusTone(payroll.status),
            }
          : undefined
      }
      typeLabel={formatPeriod(payroll)}
      createdAt={payroll?.createdAt}
      updatedAt={payroll?.updatedAt}
      createdByName={payroll?.runByName}
      assignedToName={payroll?.approvedByName}
      entityType="payroll"
      entityId={id ?? 0}
      overview={overview}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        payroll ? (
          <EntityPrintButton
            branchId={payroll.branchId}
            title={payroll.reference ? `مسير ${payroll.reference}` : "مسير الرواتب"}
            ref={payroll.reference || `PAY-${id}`}
            date={formatDateAr(payroll.paidAt || payroll.createdAt)}
            sections={printSections}
            entityType="payroll"
            entityId={payroll.id ?? id}
            formats={["a4"]}
          />
        ) : undefined
      }
    />
  );
}
