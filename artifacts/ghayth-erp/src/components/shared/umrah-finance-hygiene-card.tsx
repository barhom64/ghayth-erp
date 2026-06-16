import { useApiQuery } from "@/lib/api";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

// §6 من شرائع #1870 — كرت نظافة المالية.
// لمحه واحدة عن العمليات اللي ما تتبعت محاسبياً بعد:
//   • فواتير بيع بدون قيد        → /umrah/reports/sales-invoices-summary
//   • دفعات بدون قيد              → /umrah/reports/subagent-balances
//   • فواتير نسك بدون AP          → /umrah/reports/nusk-invoices-summary
//   • غرامات بدون قيد             → /umrah/reports/violations-summary
//
// لو كل البنود = 0 → كرت أخضر "كل شيء مرحَّل".
// لو في بنود → كرت أحمر مع روابط مباشرة لكل دلو + المبلغ بالمخاطر.

interface BucketRow {
  count: number;
  amount: number;
}

interface FinanceHygieneResp {
  buckets: {
    salesInvoices: BucketRow;
    payments: BucketRow;
    nuskInvoices: BucketRow;
    penalties: BucketRow;
  };
  totalItems: number;
  totalAmountAtRisk: number;
  isClean: boolean;
}

const BUCKET_LABELS: Record<string, { label: string; href: string }> = {
  salesInvoices: { label: "فواتير بيع بدون قيد محاسبي", href: "/umrah/reports/sales-invoices-summary" },
  payments:      { label: "دفعات بدون قيد محاسبي",      href: "/umrah/reports/subagent-balances"      },
  nuskInvoices:  { label: "فواتير نسك بدون فاتورة شراء AP", href: "/umrah/reports/nusk-invoices-summary" },
  penalties:     { label: "غرامات بدون قيد محاسبي",      href: "/umrah/reports/violations-summary"     },
};

export function UmrahFinanceHygieneCard() {
  const { data, isLoading } = useApiQuery<FinanceHygieneResp>(
    ["umrah-finance-hygiene"],
    "/umrah/finance-hygiene",
  );

  if (isLoading) return null;
  if (!data) return null;

  if (data.isClean) {
    return (
      <Card data-testid="umrah-finance-hygiene-card-clean">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            نظافة المالية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-xs text-status-success-foreground">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-semibold">كل شيء مرحَّل — لا توجد عمليات بدون قيد محاسبي.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const entries = Object.entries(BUCKET_LABELS) as Array<[keyof FinanceHygieneResp["buckets"], { label: string; href: string }]>;

  return (
    <Card data-testid="umrah-finance-hygiene-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-status-warning-foreground" />
            نظافة المالية
          </span>
          <Badge className="text-[10px] bg-status-warning-surface text-status-warning-foreground">
            {data.totalItems} بند
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-status-warning-surface text-status-warning-foreground text-xs p-2 rounded flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">المبلغ بالمخاطر: {formatCurrency(data.totalAmountAtRisk)}</p>
            <p className="text-[10px]">عمليات بدون قيد محاسبي — يحتاج اعتماد/ترحيل.</p>
          </div>
        </div>

        <table className="w-full text-xs" data-testid="umrah-finance-hygiene-buckets">
          <tbody>
            {entries.map(([key, meta]) => {
              const b = data.buckets[key];
              if (b.count === 0) return null;
              return (
                <tr
                  key={key}
                  className="border-b last:border-b-0"
                  data-testid={`umrah-finance-hygiene-bucket-${key}`}
                >
                  <td className="py-2 pe-2">
                    <Link
                      href={meta.href}
                      className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                    >
                      {meta.label}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                  <td className="py-2 ps-2 text-left">
                    <Badge variant="outline" className="text-[10px] me-1">
                      {b.count}
                    </Badge>
                    <span className="text-status-warning-foreground font-semibold">
                      {formatCurrency(b.amount)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
