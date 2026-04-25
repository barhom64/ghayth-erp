import { useParams } from "wouter";
import { useApiQuery } from "@/lib/api";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DetailPageLayout, type DetailStatus } from "@/components/shared/detail-page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Calendar, DollarSign, CheckCircle } from "lucide-react";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { KpiGrid } from "@/components/shared/kpi-card";
import { ProcessStages, type StageStep } from "@/components/shared/entity-timeline";
import { LOAN_STATUS, INSTALLMENT_STATUS, LOAN_TYPES } from "@/lib/hr-type-maps";

const STATUS_TONE_MAP: Record<string, DetailStatus["tone"]> = {
  pending: "warning",
  active: "info",
  completed: "success",
  rejected: "destructive",
};

const LOAN_LIFECYCLE = [
  { key: "pending",   label: "بانتظار الموافقة" },
  { key: "active",    label: "نشطة" },
  { key: "completed", label: "مكتملة" },
];

function buildLoanSteps(status: string | undefined): StageStep[] {
  const s = status ?? "pending";
  if (s === "rejected") {
    return [{ label: "مرفوضة", status: "rejected" }];
  }
  const idx = LOAN_LIFECYCLE.findIndex((x) => x.key === s);
  return LOAN_LIFECYCLE.map((step, i): StageStep => {
    if (idx === -1) return { label: step.label, status: "pending" };
    if (i < idx)    return { label: step.label, status: "completed" };
    if (i === idx)  return { label: step.label, status: "current" };
    return { label: step.label, status: "pending" };
  });
}

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useApiQuery<any>(["hr-loan-detail", id], `/hr/loans/${id}`);
  const loan = data?.data ?? data;

  const st = LOAN_STATUS[loan?.status] ?? { label: loan?.status ?? "—", color: "bg-gray-100 text-gray-600" };
  const statusObj: DetailStatus = {
    label: st.label,
    tone: STATUS_TONE_MAP[loan?.status] ?? "default",
  };

  const paidPct = loan?.amount > 0
    ? Math.min(100, Math.round((Number(loan.paidAmount ?? 0) / Number(loan.amount)) * 100))
    : 0;

  const installments: any[] = loan?.installments ?? [];

  const overview = loan ? (
    <div className="space-y-4">
      {/* ملخص السلفة */}
      <KpiGrid items={[
        { label: "المبلغ الكلي", value: formatCurrency(Number(loan.amount)), icon: DollarSign, color: "text-blue-600 bg-blue-50", size: "sm" },
        { label: "المسدد", value: formatCurrency(Number(loan.paidAmount ?? 0)), icon: CheckCircle, color: "text-green-600 bg-green-50", size: "sm" },
        { label: "المتبقي", value: formatCurrency(Number(loan.remainingAmount ?? loan.amount)), icon: Wallet, color: "text-red-600 bg-red-50", size: "sm" },
        { label: "القسط الشهري", value: formatCurrency(Number(loan.installmentAmount ?? 0)), icon: Calendar, color: "text-purple-600 bg-purple-50", size: "sm" },
      ]} />

      {/* شريط مراحل السلفة */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">دورة حياة السلفة</p>
          <ProcessStages steps={buildLoanSteps(loan.status)} />
        </CardContent>
      </Card>

      {/* شريط التقدم */}
      {loan.status === "active" && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">نسبة السداد</span>
              <span className="text-sm font-bold text-blue-700">{paidPct}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-gradient-to-l from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-700"
                style={{ width: `${paidPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
              <span>مسدد: {formatCurrency(Number(loan.paidAmount ?? 0))}</span>
              <span>إجمالي: {formatCurrency(Number(loan.amount))}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* بيانات السلفة */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">تفاصيل السلفة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500">الموظف</p>
              <p className="font-medium">{loan.employeeName}</p>
            </div>
            <div>
              <p className="text-gray-500">النوع</p>
              <p className="font-medium">{LOAN_TYPES[loan.loanType] ?? loan.loanType}</p>
            </div>
            <div>
              <p className="text-gray-500">عدد الأقساط</p>
              <p className="font-medium">{loan.installmentCount} قسط</p>
            </div>
            <div>
              <p className="text-gray-500">بدء الخصم</p>
              <p className="font-medium">{loan.startDeductionPeriod || "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">تاريخ الطلب</p>
              <p className="font-medium">{loan.requestDate ? formatDateAr(loan.requestDate) : "—"}</p>
            </div>
            {loan.approvedAt && (
              <div>
                <p className="text-gray-500">تاريخ الموافقة</p>
                <p className="font-medium">{formatDateAr(loan.approvedAt)}</p>
              </div>
            )}
            {loan.reason && (
              <div className="col-span-full">
                <p className="text-gray-500">السبب</p>
                <p className="font-medium">{loan.reason}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* جدول الأقساط */}
      {installments.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">جدول الأقساط</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "installmentNumber", header: "#", sortable: true, render: (v) => <span className="text-gray-500">{v.installmentNumber}</span> },
                { key: "period", header: "الفترة", sortable: true, render: (v) => <span className="text-gray-700 font-mono">{v.period}</span> },
                { key: "amount", header: "المبلغ", sortable: true, render: (v) => <span className="font-medium">{formatCurrency(Number(v.amount))}</span> },
                { key: "status", header: "الحالة", sortable: true, render: (v) => {
                  const iSt = INSTALLMENT_STATUS[v.status] ?? { label: v.status, color: "text-gray-600 bg-gray-50" };
                  return <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", iSt.color)}>{iSt.label}</span>;
                } },
              ] as DataTableColumn<any>[]}
              data={installments}
              noToolbar
              emptyMessage="لا توجد أقساط"
              pageSize={20}
            />
          </CardContent>
        </Card>
      )}

      {/* إجراءات الاعتماد */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base">إجراءات الاعتماد</CardTitle></CardHeader>
        <CardContent>
          <ApprovalActions
            entityType="loan"
            entityId={Number(id)}
            approveEndpoint={`/hr/loans/${id}/approve`}
            rejectEndpoint={`/hr/loans/${id}/reject`}
            approveMethod="PATCH"
            rejectMethod="PATCH"
            invalidateKeys={[["hr-loan-detail", id || ""], ["hr-loans"]]}
          />
        </CardContent>
      </Card>
      <ActionHistory entityType="loan" entityId={Number(id)} />
    </div>
  ) : null;

  return (
    <DetailPageLayout
      title={`سلفة ${loan?.loanNumber || ""}`}
      subtitle={loan ? `${loan.employeeName} — ${LOAN_TYPES[loan.loanType] ?? loan.loanType}` : undefined}
      backPath="/hr/loans"
      backLabel="سلف الموظفين"
      status={statusObj}
      refNumber={loan?.loanNumber}
      createdAt={loan?.requestDate ?? loan?.createdAt}
      updatedAt={loan?.updatedAt}
      entityType="loan"
      entityId={Number(id)}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={() => window.location.reload()}
      overview={overview}
      actions={
        <Badge className={cn("text-sm px-3 py-1", st.color)}>{st.label}</Badge>
      }
    />
  );
}
