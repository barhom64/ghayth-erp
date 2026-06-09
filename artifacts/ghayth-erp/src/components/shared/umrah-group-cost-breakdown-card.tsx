import { useApiQuery } from "@/lib/api";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Receipt, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

// §6 — كرت تفصيل تكلفة المجموعة من نسك.
// يعرض: per-category breakdown + قائمة فواتير نسك + هامش الربح الفعلي.
// مكمل لكرت Margin في صفحة تفاصيل المجموعة.

interface CategoryBar {
  key: string;
  label: string;
  amount: number;
}

interface NuskInvoiceRow {
  id: number;
  nuskInvoiceNumber: string;
  nuskStatus: string;
  issueDate: string | null;
  mutamerCount: number;
  netCost: number | string;
  totalAmount: number | string;
  refundAmount: number | string;
  purchaseInvoiceId: number | null;
  journalEntryId: number | null;
}

interface CostBreakdownResp {
  group: { id: number; name: string | null; nuskGroupNumber: string | null };
  summary: {
    nuskCount: number;
    totalAmount: number;
    refundAmount: number;
    netCost: number;
    revenue: number;
    revenuePaid: number;
    margin: number;
    marginPct: number;
    sellingBelowCost: boolean;
  };
  categories: CategoryBar[];
  invoices: NuskInvoiceRow[];
}

const NUSK_STATUS_LABELS: Record<string, string> = {
  pending:   "قيد المعالجة",
  issued:    "صادرة",
  paid:      "مدفوعة",
  cancelled: "ملغاة",
  refunded:  "مُسترَدّة",
};

const NUSK_STATUS_TONES: Record<string, string> = {
  pending:   "bg-status-warning-surface text-status-warning-foreground",
  issued:    "bg-status-info-surface text-status-info-foreground",
  paid:      "bg-status-success-surface text-status-success-foreground",
  cancelled: "bg-status-neutral-surface text-status-neutral-foreground",
  refunded:  "bg-status-warning-surface text-status-warning-foreground",
};

export function UmrahGroupCostBreakdownCard({ groupId }: { groupId: number }) {
  const { data, isLoading } = useApiQuery<CostBreakdownResp>(
    ["umrah-group-cost-breakdown", String(groupId)],
    `/umrah/groups/${groupId}/cost-breakdown`,
    !!groupId,
  );

  if (isLoading) return null;
  if (!data) return null;

  const { summary, categories, invoices } = data;
  const maxAmount = categories.length > 0 ? categories[0].amount : 0;

  return (
    <Card data-testid="umrah-group-cost-breakdown-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          تفصيل تكلفة المجموعة (نسك)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">الإيراد</p>
            <p className="text-lg font-bold text-status-info-foreground" data-testid="umrah-group-cost-revenue">
              {formatCurrency(summary.revenue)}
            </p>
            {summary.revenuePaid > 0 && (
              <p className="text-[10px] text-status-success-foreground">
                محصَّل: {formatCurrency(summary.revenuePaid)}
              </p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground">صافي التكلفة</p>
            <p className="text-lg font-bold text-status-warning-foreground" data-testid="umrah-group-cost-netcost">
              {formatCurrency(summary.netCost)}
            </p>
            {summary.refundAmount > 0 && (
              <p className="text-[10px] text-status-info-foreground">
                مسترد: {formatCurrency(summary.refundAmount)}
              </p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground">الهامش</p>
            <p
              className={`text-lg font-bold ${summary.margin < 0 ? "text-status-error-foreground" : "text-status-success-foreground"}`}
              data-testid="umrah-group-cost-margin"
            >
              {formatCurrency(summary.margin)}
            </p>
            <p className={`text-[10px] flex items-center gap-1 ${summary.margin < 0 ? "text-status-error-foreground" : "text-status-success-foreground"}`}>
              {summary.margin < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
              {summary.marginPct.toFixed(1)}٪
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">فواتير نسك</p>
            <p className="text-lg font-bold" data-testid="umrah-group-cost-nuskcount">{summary.nuskCount}</p>
            <p className="text-[10px] text-muted-foreground">
              إجمالي: {formatCurrency(summary.totalAmount)}
            </p>
          </div>
        </div>

        {summary.sellingBelowCost && (
          <div
            className="bg-status-error-surface text-status-error-foreground text-xs p-2 rounded flex items-center gap-2"
            data-testid="umrah-group-cost-selling-below"
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="font-semibold">تنبيه: الإيراد أقل من التكلفة — المجموعة تباع بخسارة.</span>
          </div>
        )}

        {categories.length === 0 ? (
          <p className="text-xs text-center text-muted-foreground py-4" data-testid="umrah-group-cost-empty">
            لا فواتير نسك صادرة لهذه المجموعة.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">توزيع التكلفة حسب الفئة</p>
            <div className="space-y-1.5" data-testid="umrah-group-cost-categories">
              {categories.map((c) => {
                const pct = maxAmount > 0 ? (c.amount / maxAmount) * 100 : 0;
                const sharePct = summary.netCost > 0 ? (c.amount / summary.netCost) * 100 : 0;
                return (
                  <div
                    key={c.key}
                    className="flex items-center gap-2 text-xs"
                    data-testid={`umrah-group-cost-category-${c.key}`}
                  >
                    <span className="w-24 text-muted-foreground">{c.label}</span>
                    <div className="flex-1 bg-surface-subtle rounded h-5 overflow-hidden relative">
                      <div
                        className="absolute inset-y-0 right-0 bg-status-warning-surface"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative px-2 leading-5 font-semibold">
                        {formatCurrency(c.amount)}
                      </span>
                    </div>
                    <span className="w-12 text-left text-[10px] text-muted-foreground">
                      {sharePct.toFixed(0)}٪
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {invoices.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">فواتير نسك</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="umrah-group-cost-invoices">
                <thead>
                  <tr className="text-right text-muted-foreground border-b bg-surface-subtle">
                    <th className="p-2 font-medium">الرقم</th>
                    <th className="p-2 font-medium">الحالة</th>
                    <th className="p-2 font-medium">التاريخ</th>
                    <th className="p-2 font-medium">معتمرون</th>
                    <th className="p-2 font-medium">صافي التكلفة</th>
                    <th className="p-2 font-medium">المُسترَد</th>
                    <th className="p-2 font-medium">حالة AP</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b last:border-b-0 hover:bg-muted/30"
                      data-testid={`umrah-group-cost-invoice-${inv.id}`}
                    >
                      <td className="p-2 font-mono text-[11px]">{inv.nuskInvoiceNumber}</td>
                      <td className="p-2">
                        <Badge className={`text-[10px] ${NUSK_STATUS_TONES[inv.nuskStatus] || ""}`}>
                          {NUSK_STATUS_LABELS[inv.nuskStatus] || inv.nuskStatus}
                        </Badge>
                      </td>
                      <td className="p-2">{inv.issueDate ? formatDateAr(inv.issueDate) : "—"}</td>
                      <td className="p-2">{inv.mutamerCount}</td>
                      <td className="p-2 font-semibold text-status-warning-foreground">{formatCurrency(Number(inv.netCost))}</td>
                      <td className="p-2 text-status-info-foreground">{formatCurrency(Number(inv.refundAmount))}</td>
                      <td className="p-2 text-[11px]">
                        {inv.purchaseInvoiceId ? (
                          <Link
                            href={`/finance/purchase-invoices/${inv.purchaseInvoiceId}`}
                            className="text-blue-600 hover:underline flex items-center gap-1"
                            data-testid={`umrah-group-cost-invoice-ap-link-${inv.id}`}
                          >
                            <CheckCircle2 className="h-3 w-3 text-status-success-foreground" />
                            #{inv.purchaseInvoiceId}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">بانتظار AP</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
