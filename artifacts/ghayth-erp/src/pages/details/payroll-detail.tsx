import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionHistory } from "@/components/approval-actions";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Wallet } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PAYMENT_METHODS } from "@/lib/finance-type-maps";
import { useToast } from "@/hooks/use-toast";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

/**
 * PayrollDetail — unified detail page for a single payroll record.
 *
 * Fetches from `/hr/payroll/:id`. Shows the classic payroll breakdown:
 * basic salary, allowances, deductions, overtime and bonuses feeding
 * into the hero "net salary" number, plus payment method / bank
 * account metadata and the employee link.
 */

// Vocabulary matches what the server actually produces: a run is created
// `pending_approval`, approval moves it to `completed`, and posting the
// journal entry moves it to `posted` (HR functional audit C2).
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
  if (payroll.month && payroll.year) return `${payroll.month}/${payroll.year}`;
  if (payroll.month) return String(payroll.month);
  return "-";
}

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

  // Approve uses PATCH /hr/payroll/:id/approve (pending_approval -> completed);
  // post uses PATCH /hr/payroll/:id { status: "posted" } (completed -> posted,
  // which triggers the journal entry). There is no reject endpoint.
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

  // Compute a net salary in case the server didn't project it: the
  // formula is basic + allowances + overtime + bonus − deductions.
  // This is used both for the hero number and the print summary so
  // the two can never drift apart.
  const netSalary = useMemo(() => {
    if (!payroll) return 0;
    if (payroll.netSalary != null) return Number(payroll.netSalary);
    const basic = Number(payroll.basicSalary || 0);
    const allowances = Number(payroll.allowances || 0);
    const overtime = Number(payroll.overtime || 0);
    const bonus = Number(payroll.bonus || 0);
    const deductions = Number(payroll.deductions || 0);
    return basic + allowances + overtime + bonus - deductions;
  }, [payroll]);

  const paymentMethodLabel = payroll?.paymentMethod
    ? PAYMENT_METHODS[payroll.paymentMethod] || payroll.paymentMethod
    : null;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!payroll) return out;
    if (payroll.employeeId) {
      out.push({
        type: "employee",
        id: payroll.employeeId,
        label: payroll.employeeName || `موظف #${payroll.employeeId}`,
        sublabel: "الموظف",
        href: `/employees/${payroll.employeeId}`,
      });
    }
    return out;
  }, [payroll]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!payroll) return [];
    const period = formatPeriod(payroll);
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: payroll.ref || `PAY-${id}` },
          { label: "الموظف", value: payroll.employeeName || "-" },
          { label: "الفترة", value: period },
          ...(paymentMethodLabel
            ? [{ label: "طريقة الدفع", value: paymentMethodLabel }]
            : []),
          ...(payroll.bankAccount
            ? [{ label: "الحساب البنكي", value: payroll.bankAccount }]
            : []),
          ...(payroll.paymentDate
            ? [{ label: "تاريخ الدفع", value: formatDateAr(payroll.paymentDate) }]
            : []),
          { label: "الحالة", value: STATUS_LABELS[payroll.status] || payroll.status || "-" },
          { label: "تاريخ الإنشاء", value: formatDateAr(payroll.createdAt) },
        ],
      },
      {
        kind: "summary",
        items: [
          { label: "الراتب الأساسي", value: formatCurrency(Number(payroll.basicSalary || 0)) },
          { label: "البدلات", value: formatCurrency(Number(payroll.allowances || 0)) },
          { label: "العمل الإضافي", value: formatCurrency(Number(payroll.overtime || 0)) },
          { label: "المكافآت", value: formatCurrency(Number(payroll.bonus || 0)) },
          { label: "الخصومات", value: formatCurrency(Number(payroll.deductions || 0)) },
          { label: "صافي الراتب", value: formatCurrency(netSalary), bold: true },
        ],
      },
      {
        kind: "signature",
        parties: [
          { label: "المستلم", name: payroll.employeeName || "" },
          { label: "المعتمد", name: payroll.approvedByName || payroll.createdByName || "" },
        ],
      },
    ];
    return sections;
  }, [payroll, netSalary, paymentMethodLabel, id]);

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info — employee + breakdown feeding the hero net */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            بيانات الراتب
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero net salary */}
          <div className="border-b pb-3">
            <p className="text-xs text-muted-foreground mb-1">صافي الراتب</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-status-success-foreground">
                {formatCurrency(netSalary)}
              </span>
              <span className="text-xs text-muted-foreground">ر.س</span>
            </div>
            {payroll?.employeeName && (
              <p className="mt-2 text-sm text-status-neutral-foreground">
                للموظف: <span className="font-medium">{payroll.employeeName}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">الفترة</p>
              <Badge variant="outline">{formatPeriod(payroll)}</Badge>
            </div>
            {payroll?.basicSalary != null && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الراتب الأساسي</p>
                <span className="text-status-neutral-foreground font-medium">
                  {formatCurrency(Number(payroll.basicSalary))}
                </span>
              </div>
            )}
            {payroll?.allowances != null && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">البدلات</p>
                <span className="text-status-neutral-foreground">
                  {formatCurrency(Number(payroll.allowances))}
                </span>
              </div>
            )}
            {payroll?.overtime != null && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">العمل الإضافي</p>
                <span className="text-status-neutral-foreground">
                  {formatCurrency(Number(payroll.overtime))}
                </span>
              </div>
            )}
            {payroll?.bonus != null && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المكافآت</p>
                <span className="text-status-neutral-foreground">
                  {formatCurrency(Number(payroll.bonus))}
                </span>
              </div>
            )}
            {payroll?.deductions != null && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الخصومات</p>
                <span className="text-status-error-foreground">
                  {formatCurrency(Number(payroll.deductions))}
                </span>
              </div>
            )}
            {paymentMethodLabel && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">طريقة الدفع</p>
                <Badge variant="secondary">{paymentMethodLabel}</Badge>
              </div>
            )}
            {payroll?.paymentDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الدفع</p>
                <span className="text-status-neutral-foreground">{formatDateAr(payroll.paymentDate)}</span>
              </div>
            )}
            {payroll?.bankAccount && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">الحساب البنكي</p>
                <span className="text-status-neutral-foreground font-mono text-xs">
                  {payroll.bankAccount}
                </span>
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
        {/* Payroll lifecycle — pending_approval → completed → posted.
            There is no reject endpoint, so the generic ApprovalActions
            (whose reject/return would misfire onto /approve) is not used. */}
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

        {/* Action history */}
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

      {id && <ApprovalTimeline entityType="payroll" entityId={id} />}

      {id && <EntityComments entityType="payroll" entityId={id} />}
      {id && <EntityTags entityType="payroll" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={payroll?.ref ? `راتب ${payroll.ref}` : "تفاصيل الراتب"}
      subtitle={
        payroll
          ? `${payroll.employeeName || ""}${payroll.employeeName ? " — " : ""}${formatPeriod(payroll)}`
          : undefined
      }
      backPath="/hr/payroll"
      refNumber={payroll?.ref || (id ? `PAY-${id}` : undefined)}
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
      createdByName={payroll?.createdByName}
      assignedToName={payroll?.approvedByName}
      relatedEntities={relatedEntities}
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
            title={payroll.ref ? `راتب ${payroll.ref}` : "راتب"}
            ref={payroll.ref || `PAY-${id}`}
            date={formatDateAr(payroll.paymentDate || payroll.createdAt)}
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
