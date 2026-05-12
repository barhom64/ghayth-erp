import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Edit, Wallet } from "lucide-react";
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

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  pending: "معلق",
  approved: "معتمد",
  paid: "مدفوع",
  cancelled: "ملغى",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "paid") return "success" as const;
  if (status === "approved") return "success" as const;
  if (status === "cancelled") return "destructive" as const;
  if (status === "pending") return "info" as const;
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
  const [, setLocation] = useLocation();
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

  const handleEdit = () => {
    setLocation(`/hr/payroll/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info — employee + breakdown feeding the hero net */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-gray-500" />
            بيانات الراتب
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero net salary */}
          <div className="border-b pb-3">
            <p className="text-xs text-gray-500 mb-1">صافي الراتب</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-green-700">
                {formatCurrency(netSalary)}
              </span>
              <span className="text-xs text-gray-500">ر.س</span>
            </div>
            {payroll?.employeeName && (
              <p className="mt-2 text-sm text-gray-700">
                للموظف: <span className="font-medium">{payroll.employeeName}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">الفترة</p>
              <Badge variant="outline">{formatPeriod(payroll)}</Badge>
            </div>
            {payroll?.basicSalary != null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الراتب الأساسي</p>
                <span className="text-gray-800 font-medium">
                  {formatCurrency(Number(payroll.basicSalary))}
                </span>
              </div>
            )}
            {payroll?.allowances != null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">البدلات</p>
                <span className="text-gray-800">
                  {formatCurrency(Number(payroll.allowances))}
                </span>
              </div>
            )}
            {payroll?.overtime != null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">العمل الإضافي</p>
                <span className="text-gray-800">
                  {formatCurrency(Number(payroll.overtime))}
                </span>
              </div>
            )}
            {payroll?.bonus != null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">المكافآت</p>
                <span className="text-gray-800">
                  {formatCurrency(Number(payroll.bonus))}
                </span>
              </div>
            )}
            {payroll?.deductions != null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الخصومات</p>
                <span className="text-red-600">
                  {formatCurrency(Number(payroll.deductions))}
                </span>
              </div>
            )}
            {paymentMethodLabel && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">طريقة الدفع</p>
                <Badge variant="secondary">{paymentMethodLabel}</Badge>
              </div>
            )}
            {payroll?.paymentDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الدفع</p>
                <span className="text-gray-800">{formatDateAr(payroll.paymentDate)}</span>
              </div>
            )}
            {payroll?.bankAccount && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">الحساب البنكي</p>
                <span className="text-gray-800 font-mono text-xs">
                  {payroll.bankAccount}
                </span>
              </div>
            )}
          </div>

          {payroll?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-gray-800 whitespace-pre-wrap">{payroll.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Approval actions — payroll goes pending → approved → paid */}
        {id && payroll && payroll.status === "pending" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="payroll"
                entityId={id}
                currentStatus={payroll.status}
                approveEndpoint={`/hr/payroll/${id}/approve`}
                rejectEndpoint={`/hr/payroll/${id}/approve`}
                returnEndpoint={`/hr/payroll/${id}/approve`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ approved: "returned", notes })}
                pendingStatuses={["pending", "draft", "returned", "pending_approval"]}
                invalidateKeys={[["payroll"]]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث الراتب" });
                }}
              />
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
        <>
          {payroll && (
            <EntityPrintButton
              branchId={payroll.branchId}
              title={payroll.ref ? `راتب ${payroll.ref}` : "راتب"}
              ref={payroll.ref || `PAY-${id}`}
              date={formatDateAr(payroll.paymentDate || payroll.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="hr:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={
              !payroll || ["paid", "cancelled"].includes(payroll.status)
            }
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
