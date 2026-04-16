import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import {
  Wallet, Clock, CheckCircle2, XCircle, Loader2,
  DollarSign, Calendar, TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "معلق", color: "text-yellow-600 bg-yellow-50" },
  approved: { label: "معتمد", color: "text-blue-600 bg-blue-50" },
  active: { label: "نشط", color: "text-green-600 bg-green-50" },
  completed: { label: "مسدد", color: "text-gray-600 bg-gray-50" },
  rejected: { label: "مرفوض", color: "text-red-600 bg-red-50" },
};

const loanTypeLabels: Record<string, string> = {
  personal: "شخصية",
  emergency: "طارئة",
  housing: "سكن",
  vehicle: "مركبة",
  education: "تعليمية",
  other: "أخرى",
};

function formatAmount(v: any): string {
  return Number(v ?? 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MyLoans() {
  const { data, isLoading } = useApiQuery<any>(["my-loans"], "/hr/loans/my");

  const loans: any[] = data?.data ?? [];

  const totalAmount = loans.reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
  const remainingAmount = loans
    .filter((l: any) => l.status === "active")
    .reduce((s: number, l: any) => s + Number(l.remainingAmount ?? l.amount ?? 0), 0);
  const activeCount = loans.filter((l: any) => l.status === "active").length;
  const pendingCount = loans.filter((l: any) => l.status === "pending").length;

  return (
    <PageShell
      title="سلفي"
      subtitle="متابعة السلف والقروض الخاصة بك"
      actions={
        <Link href="/hr/loans/create">
          <Button size="sm" className="gap-1.5">
            <Wallet size={14} />
            طلب سلفة جديدة
          </Button>
        </Link>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "سلف نشطة", value: activeCount, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
          { label: "طلبات معلقة", value: pendingCount, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
          { label: "إجمالي السلف", value: `${formatAmount(totalAmount)} ر.س`, icon: DollarSign, color: "text-blue-600 bg-blue-50" },
          { label: "المتبقي", value: `${formatAmount(remainingAmount)} ر.س`, icon: TrendingDown, color: "text-red-600 bg-red-50" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-2", stat.color)}>
                  <Icon size={20} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : loans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Wallet size={36} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">لا توجد سلف مسجّلة</p>
            <p className="text-sm mt-1">يمكنك طلب سلفة جديدة من الزر أعلاه</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">سجل السلف</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-right px-4 py-3 font-medium text-gray-600">الرقم</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">النوع</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">المبلغ</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">الأقساط</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">القسط الشهري</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">المتبقي</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">تاريخ الطلب</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan: any) => {
                    const cfg = statusConfig[loan.status] ?? { label: loan.status, color: "text-gray-600 bg-gray-50" };
                    const installmentAmount = loan.installmentCount > 0
                      ? Number(loan.amount) / loan.installmentCount
                      : 0;
                    return (
                      <tr key={loan.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-gray-500">#{loan.loanNumber || loan.id}</td>
                        <td className="px-4 py-3 text-gray-700">{loanTypeLabels[loan.loanType] || loan.loanType}</td>
                        <td className="px-4 py-3 font-medium">{formatAmount(loan.amount)} ر.س</td>
                        <td className="px-4 py-3 text-gray-700">
                          {loan.paidInstallments ?? 0}/{loan.installmentCount ?? 0}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{formatAmount(installmentAmount)} ر.س</td>
                        <td className="px-4 py-3">
                          {loan.status === "active" ? (
                            <span className="text-red-600 font-medium">{formatAmount(loan.remainingAmount ?? loan.amount)} ر.س</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatDateAr(loan.createdAt)}</td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", cfg.color)}>
                            {cfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
