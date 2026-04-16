import { useParams, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet, Calendar, DollarSign, CheckCircle, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:   { label: "بانتظار الموافقة", color: "bg-amber-100 text-amber-700" },
  active:    { label: "نشطة",             color: "bg-blue-100 text-blue-700"    },
  completed: { label: "مسددة",            color: "bg-green-100 text-green-700"  },
  rejected:  { label: "مرفوضة",           color: "bg-red-100 text-red-700"      },
};

const INSTALLMENT_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "قادم",   color: "text-amber-600 bg-amber-50" },
  paid:    { label: "مدفوع",  color: "text-green-600 bg-green-50" },
  overdue: { label: "متأخر",  color: "text-red-600 bg-red-50"     },
};

const LOAN_TYPE_MAP: Record<string, string> = {
  salary_advance: "سلفة راتب",
  personal: "سلفة شخصية",
  emergency: "سلفة طارئة",
  housing: "سكن",
  vehicle: "مركبة",
  education: "تعليمية",
};

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading } = useApiQuery<any>(["hr-loan-detail", id], `/hr/loans/${id}`);
  const loan = data?.data ?? data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!loan) {
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

  const st = STATUS_MAP[loan.status] ?? { label: loan.status, color: "bg-gray-100 text-gray-600" };
  const paidPct = loan.amount > 0
    ? Math.min(100, Math.round((Number(loan.paidAmount ?? 0) / Number(loan.amount)) * 100))
    : 0;

  const installments: any[] = loan.installments ?? [];

  return (
    <PageShell
      title={`سلفة ${loan.loanNumber}`}
      subtitle={`${loan.employeeName} — ${LOAN_TYPE_MAP[loan.loanType] ?? loan.loanType}`}
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/loans", label: "سلف الموظفين" },
        { label: loan.loanNumber },
      ]}
      actions={
        <Badge className={cn("text-sm px-3 py-1", st.color)}>{st.label}</Badge>
      }
    >
      {/* ملخص السلفة */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "المبلغ الكلي", value: formatCurrency(Number(loan.amount)), icon: DollarSign, color: "text-blue-600 bg-blue-50" },
          { label: "المسدد", value: formatCurrency(Number(loan.paidAmount ?? 0)), icon: CheckCircle, color: "text-green-600 bg-green-50" },
          { label: "المتبقي", value: formatCurrency(Number(loan.remainingAmount ?? loan.amount)), icon: Wallet, color: "text-red-600 bg-red-50" },
          { label: "القسط الشهري", value: formatCurrency(Number(loan.installmentAmount ?? 0)), icon: Calendar, color: "text-purple-600 bg-purple-50" },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                  <Icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
                </div>
                <div>
                  <p className="text-lg font-bold">{c.value}</p>
                  <p className="text-xs text-gray-500">{c.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
              <p className="font-medium">{LOAN_TYPE_MAP[loan.loanType] ?? loan.loanType}</p>
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
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-right px-4 py-3 font-medium text-gray-600">#</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">الفترة</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">المبلغ</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {installments.map((inst: any) => {
                  const iSt = INSTALLMENT_STATUS[inst.status] ?? { label: inst.status, color: "text-gray-600 bg-gray-50" };
                  return (
                    <tr key={inst.id || inst.installmentNumber} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-500">{inst.installmentNumber}</td>
                      <td className="px-4 py-3 text-gray-700 font-mono">{inst.period}</td>
                      <td className="px-4 py-3 font-medium">{formatCurrency(Number(inst.amount))}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", iSt.color)}>
                          {iSt.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
