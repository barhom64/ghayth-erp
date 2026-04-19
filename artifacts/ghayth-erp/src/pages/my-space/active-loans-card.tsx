import { Link } from "wouter";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActiveLoansCardProps {
  activeLoans: any[];
}

const loanTypeLabels: Record<string, string> = {
  personal: "شخصية",
  emergency: "طارئة",
  housing: "سكن",
  vehicle: "مركبة",
  education: "تعليمية",
  salary_advance: "سلفة راتب",
  other: "أخرى",
};

export function ActiveLoansCard({ activeLoans }: ActiveLoansCardProps) {
  if (activeLoans.length === 0) return null;

  const totalRemaining = activeLoans
    .filter((l: any) => l.status === "active")
    .reduce((s: number, l: any) => s + Number(l.remainingAmount ?? 0), 0);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Wallet className="w-5 h-5 text-orange-500" />
          سلفي النشطة
          {totalRemaining > 0 && (
            <span className="text-xs font-normal text-gray-500">
              (متبقي: {formatCurrency(totalRemaining)})
            </span>
          )}
        </CardTitle>
        <Link href="/my-loans">
          <Button variant="ghost" size="sm" className="text-xs gap-1">
            عرض الكل <ChevronLeft className="w-3 h-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activeLoans.slice(0, 5).map((loan: any) => {
            const paidPct = loan.amount > 0
              ? Math.min(100, Math.round((Number(loan.paidAmount ?? 0) / Number(loan.amount)) * 100))
              : 0;
            const isActive = loan.status === "active";
            return (
              <div key={loan.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    {loanTypeLabels[loan.loanType] ?? loan.loanType} — {loan.loanNumber}
                  </span>
                  <span className={cn("text-xs font-semibold", isActive ? "text-orange-600" : "text-yellow-600")}>
                    {isActive ? `${formatCurrency(loan.remainingAmount)} متبقي` : "معلقة"}
                  </span>
                </div>
                {isActive && (
                  <>
                    <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-500 transition-all duration-500"
                        style={{ width: `${paidPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>مسدد: {formatCurrency(loan.paidAmount)} من {formatCurrency(loan.amount)}</span>
                      <span>{paidPct}%</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
