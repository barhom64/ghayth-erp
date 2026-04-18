import { useParams, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, Calendar, DollarSign, CheckCircle, Clock } from "lucide-react";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { KpiGrid } from "@/components/shared/kpi-card";
import { LOAN_STATUS, INSTALLMENT_STATUS, LOAN_TYPES } from "@/lib/hr-type-maps";

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading } = useApiQuery<any>(["hr-loan-detail", id], `/hr/loans/${id}`);
  const loan = data?.data ?? data;

  if (!isLoading && !loan) {
    return (
      <PageShell title="السلفة غير موجودة" breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { href: "/hr/loans", label: "سلف الموظفين" }]}>
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Wallet size={36} className="mx-auto mb-3 opacity-40" />
            <p>السلفة المطلوبة غير موجودة</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/hr/loans")}>
              العودة للسلف
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const st = LOAN_STATUS[loan.status] ?? { label: loan.status, color: "bg-gray-100 text-gray-600" };
  const paidPct = loan.amount > 0
    ? Math.min(100, Math.round((Number(loan.paidAmount ?? 0) / Number(loan.amount)) * 100))
    : 0;

  const installments: any[] = loan.installments ?? [];

  return (
    <PageShell
      title={`سلفة ${loan?.loanNumber || ""}`}
      subtitle={loan ? `${loan.employeeName} — ${LOAN_TYPES[loan.loanType] ?? loan.loanType}` : undefined}
      loading={isLoading}
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/loans", label: "سلف الموظفين" },
        { label: loan?.loanNumber || "..." },
      ]}
      actions={
        <Badge className={cn("text-sm px-3 py-1", st.color)}>{st.label}</Badge>
      }
    >
      {/* ملخص السلفة */}
      <KpiGrid items={[
        { label: "المبلغ الكلي", value: formatCurrency(Number(loan.amount)), icon: DollarSign, color: "text-blue-600 bg-blue-50", size: "sm" },
        { label: "المسدد", value: formatCurrency(Number(loan.paidAmount ?? 0)), icon: CheckCircle, color: "text-green-600 bg-green-50", size: "sm" },
        { label: "المتبقي", value: formatCurrency(Number(loan.remainingAmount ?? loan.amount)), icon: Wallet, color: "text-red-600 bg-red-50", size: "sm" },
        { label: "القسط الشهري", value: formatCurrency(Number(loan.installmentAmount ?? 0)), icon: Calendar, color: "text-purple-600 bg-purple-50", size: "sm" },
      ]} />

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
    </PageShell>
  );
}
