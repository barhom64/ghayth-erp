import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";
import {
  Truck, AlertTriangle, TrendingUp, ChevronRight, Handshake,
  Calendar, ShieldAlert,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

/**
 * Vendor Spend Analysis — concentration + payment-pattern analysis
 *
 * Sister page to Customer Risk Dashboard. Answers procurement risk:
 *
 * 1. CONCENTRATION: "ما نسبة الإنفاق على أكبر 5 موردين؟"
 *    Single-vendor dependency = supply-chain catastrophe risk.
 *
 * 2. CONTRACT STATUS: "أي موردين ينتهي عقدهم قريباً؟"
 *    Don't lose a key supplier to expired paperwork.
 *
 * 3. OUTSTANDING AP: For each top vendor, how much owed + invoice count.
 *
 * Combines:
 *  - GET /finance/vendors (vendor master)
 *  - GET /finance/payment-run/pending (open AP grouped by vendor)
 *  - GET /finance/contracts (vendor contracts with expiry)
 */

interface Vendor {
  id: number;
  name: string;
  phone?: string | null;
  taxNumber?: string | null;
  email?: string | null;
}

interface PendingPayable {
  id: number;
  ref: string;
  totalAmount: number | string;
  supplierId: number;
  supplierName: string | null;
  expectedDelivery?: string | null;
  createdAt?: string | null;
}

interface ByVendorRow {
  supplierId: number;
  supplierName: string;
  amount: number;
  count: number;
}

interface VendorContract {
  id: number;
  vendorId: number;
  status: "active" | "expired" | "terminated" | "pending";
  endDate: string;
  contractValue: number | string | null;
}

interface VendorAggregate {
  supplierId: number;
  name: string;
  phone: string | null;
  outstandingAmount: number;
  openInvoiceCount: number;
  shareOfTotal: number;
  oldestInvoiceDays: number;
  hasActiveContract: boolean;
  contractEndDate: string | null;
  contractEndingSoon: boolean;
  riskScore: number;
  riskBand: "low" | "med" | "high" | "critical";
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  // utc-ok: simple difference in days, no business-period anchor
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function daysUntil(iso: string): number {
  // utc-ok: simple difference in days for contract expiry alert
  const d = new Date(iso);
  return Math.floor((d.getTime() - Date.now()) / 86400000);
}

function classifyRisk(c: Pick<VendorAggregate, "shareOfTotal" | "oldestInvoiceDays" | "contractEndingSoon" | "hasActiveContract">): { score: number; band: VendorAggregate["riskBand"] } {
  // High concentration is a risk; old invoices = aging AP problem; missing
  // / expiring contract = governance risk.
  const concentrationScore = Math.min(40, c.shareOfTotal * 0.8);
  const agingScore = Math.min(30, c.oldestInvoiceDays * 0.3);
  const contractScore = !c.hasActiveContract ? 20 : c.contractEndingSoon ? 15 : 0;
  const score = Math.round(concentrationScore + agingScore + contractScore);
  const band: VendorAggregate["riskBand"] =
    score >= 60 ? "critical"
    : score >= 35 ? "high"
    : score >= 15 ? "med"
    : "low";
  return { score, band };
}

const BAND_LABEL: Record<VendorAggregate["riskBand"], string> = {
  low: "منخفض", med: "متوسط", high: "مرتفع", critical: "حرج",
};
const BAND_COLOR: Record<VendorAggregate["riskBand"], string> = {
  low:      "bg-emerald-100 text-emerald-800",
  med:      "bg-blue-100 text-blue-800",
  high:     "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
};

export default function VendorSpendPage() {
  const [bandFilter, setBandFilter] = useState<string>("");
  const today = todayLocal();

  const { data: vendorsResp, isLoading: vLoading } = useApiQuery<{ data: Vendor[] }>(
    ["vendor-spend-master"], `/finance/vendors`,
  );

  const { data: payablesResp, isLoading: payLoading } = useApiQuery<any>(
    ["vendor-spend-payables"], `/finance/payment-run/pending`,
  );

  const { data: contractsResp, isLoading: cLoading } = useApiQuery<{ data: VendorContract[] }>(
    ["vendor-spend-contracts"], `/finance/contracts`,
  );

  const vendorAggregates: VendorAggregate[] = useMemo(() => {
    const vendors: Vendor[] = vendorsResp?.data ?? [];
    const payables: PendingPayable[] = Array.isArray(payablesResp?.data) ? payablesResp.data : [];
    const byVendorPayables: ByVendorRow[] = Array.isArray(payablesResp?.byVendor) ? payablesResp.byVendor : [];
    const contracts: VendorContract[] = contractsResp?.data ?? [];

    // Build outstanding/count per vendor from payables (or byVendor aggregate)
    const apMap = new Map<number, { amount: number; count: number; oldest: number }>();
    if (byVendorPayables.length > 0) {
      for (const v of byVendorPayables) {
        apMap.set(v.supplierId, { amount: v.amount, count: v.count, oldest: 0 });
      }
      // Compute oldest invoice age per vendor from invoice list
      for (const p of payables) {
        const sid = Number(p.supplierId);
        const cur = apMap.get(sid);
        if (!cur) continue;
        const age = daysSince(p.createdAt);
        if (age > cur.oldest) cur.oldest = age;
      }
    } else {
      // Fallback: aggregate from payable list directly
      for (const p of payables) {
        const sid = Number(p.supplierId);
        const cur = apMap.get(sid) ?? { amount: 0, count: 0, oldest: 0 };
        cur.amount += Number(p.totalAmount ?? 0);
        cur.count += 1;
        cur.oldest = Math.max(cur.oldest, daysSince(p.createdAt));
        apMap.set(sid, cur);
      }
    }

    // Contract lookup
    const contractMap = new Map<number, VendorContract>();
    for (const c of contracts) {
      const existing = contractMap.get(c.vendorId);
      // Prefer active over expired/terminated
      if (!existing || (c.status === "active" && existing.status !== "active")) {
        contractMap.set(c.vendorId, c);
      }
    }

    const totalAp = Array.from(apMap.values()).reduce((s, v) => s + v.amount, 0);

    const allVendorIds = new Set<number>([
      ...vendors.map((v) => v.id),
      ...Array.from(apMap.keys()),
    ]);

    const result: VendorAggregate[] = [];
    for (const id of allVendorIds) {
      const v = vendors.find((x) => x.id === id);
      const ap = apMap.get(id) ?? { amount: 0, count: 0, oldest: 0 };
      if (ap.amount === 0 && !v) continue;

      const contract = contractMap.get(id);
      const hasActiveContract = !!contract && contract.status === "active";
      const contractEndingSoon = hasActiveContract && contract!.endDate
        ? daysUntil(contract!.endDate) <= 30 && daysUntil(contract!.endDate) >= 0
        : false;

      const share = totalAp > 0 ? (ap.amount / totalAp) * 100 : 0;
      const risk = classifyRisk({
        shareOfTotal: share,
        oldestInvoiceDays: ap.oldest,
        contractEndingSoon,
        hasActiveContract,
      });
      result.push({
        supplierId: id,
        name: v?.name ?? `#${id}`,
        phone: v?.phone ?? null,
        outstandingAmount: ap.amount,
        openInvoiceCount: ap.count,
        shareOfTotal: share,
        oldestInvoiceDays: ap.oldest,
        hasActiveContract,
        contractEndDate: contract?.endDate ?? null,
        contractEndingSoon,
        riskScore: risk.score,
        riskBand: risk.band,
      });
    }

    return result
      .filter((v) => v.outstandingAmount > 0 || v.openInvoiceCount > 0)
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount);
  }, [vendorsResp, payablesResp, contractsResp]);

  const totalAp = vendorAggregates.reduce((s, v) => s + v.outstandingAmount, 0);
  const top1Share = vendorAggregates[0]?.shareOfTotal ?? 0;
  const top5Share = vendorAggregates.slice(0, 5).reduce((s, v) => s + v.shareOfTotal, 0);
  const criticalCount = vendorAggregates.filter((v) => v.riskBand === "critical").length;
  const highCount = vendorAggregates.filter((v) => v.riskBand === "high").length;
  const expiringContracts = vendorAggregates.filter((v) => v.contractEndingSoon).length;
  const noContract = vendorAggregates.filter((v) => v.outstandingAmount > 0 && !v.hasActiveContract).length;

  const filtered = bandFilter ? vendorAggregates.filter((v) => v.riskBand === bandFilter) : vendorAggregates;
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  if (vLoading || payLoading || cLoading) return <LoadingSpinner />;


  const cols: DataTableColumn<VendorAggregate>[] = [
    {
      key: "name",
      header: "المورد",
      render: (v) => (
        <Link href={`/finance/vendor-360-sheet?vendorId=${v.supplierId}`}>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-status-info-foreground hover:underline">{v.name}</span>
            {v.phone && <span className="text-[10px] text-muted-foreground">{v.phone}</span>}
          </div>
        </Link>
      ),
    },
    {
      key: "outstandingAmount",
      header: "إجمالي AP المفتوح",
      render: (v) => (
        <span className="font-mono text-xs font-semibold">{formatCurrency(v.outstandingAmount)}</span>
      ),
    },
    {
      key: "shareOfTotal",
      header: "% من الإجمالي",
      render: (v) => {
        const intense = v.shareOfTotal >= 20 ? "text-red-700 font-bold"
          : v.shareOfTotal >= 10 ? "text-amber-700 font-semibold"
          : "";
        return (
          <div className="flex items-center gap-2">
            <span className={`font-mono text-xs ${intense}`}>{v.shareOfTotal.toFixed(1)}%</span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[40px] max-w-[80px]">
              <div className={`h-full ${
                v.shareOfTotal >= 20 ? "bg-red-500"
                : v.shareOfTotal >= 10 ? "bg-amber-500"
                : "bg-emerald-500"
              }`} style={{ width: `${Math.min(v.shareOfTotal, 100)}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: "openInvoiceCount",
      header: "فواتير مفتوحة",
      render: (v) => v.openInvoiceCount === 0
        ? <span className="text-muted-foreground italic text-xs">0</span>
        : <Badge variant="outline" className="text-[10px]">{v.openInvoiceCount}</Badge>,
    },
    {
      key: "oldestInvoiceDays",
      header: "أقدم فاتورة",
      render: (v) => {
        if (v.oldestInvoiceDays === 0) return <span className="text-muted-foreground italic text-xs">—</span>;
        const color = v.oldestInvoiceDays >= 90 ? "text-red-700 font-bold"
          : v.oldestInvoiceDays >= 60 ? "text-red-700"
          : v.oldestInvoiceDays >= 30 ? "text-amber-700"
          : "text-muted-foreground";
        return <span className={`font-mono text-xs ${color}`}>{v.oldestInvoiceDays} يوم</span>;
      },
    },
    {
      key: "contract",
      header: "العقد",
      render: (v) => {
        if (!v.hasActiveContract) return <Badge className="bg-red-100 text-red-800 text-[10px]">بدون عقد ساري</Badge>;
        if (v.contractEndingSoon) {
          const days = v.contractEndDate ? daysUntil(v.contractEndDate) : 0;
          return <Badge className="bg-amber-100 text-amber-800 text-[10px]">ينتهي خلال {days} يوم</Badge>;
        }
        return <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">ساري</Badge>;
      },
    },
    {
      key: "riskBand",
      header: "تصنيف المخاطر",
      render: (v) => (
        <div className="flex items-center gap-2">
          <Badge className={`text-[10px] ${BAND_COLOR[v.riskBand]}`}>{BAND_LABEL[v.riskBand]}</Badge>
          <span className="font-mono text-[10px] text-muted-foreground">{v.riskScore}</span>
        </div>
      ),
    },
    {
      key: "_actions",
      header: "الإجراءات",
      render: (v) => (
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link href={`/finance/vendors/${v.supplierId}/statement`}>
              كشف <ChevronRight className="h-3 w-3 ms-1" />
            </Link></Button>
          {v.openInvoiceCount > 0 && (
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link href={`/finance/payment-run?supplierId=${v.supplierId}`}>دفع</Link></Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="تحليل الإنفاق على الموردين"
      subtitle="تركّز الإنفاق + سلوك السداد + حالة العقود — مفتاح إدارة سلسلة التوريد"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/vendors", label: "الموردون" },
        { label: "تحليل المخاطر" },
      ]}
      actions={
        <PrintButton
          entityType="report_finance_vendor_spend"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "تحليل الإنفاق على الموردين", total: printRows.length },
            items: printRows.map((v) => ({
              "المورد": v.name || "—",
              "الرصيد المفتوح": Number(v.outstandingAmount || 0),
              "عدد الفواتير": v.openInvoiceCount,
              "% من الإنفاق": (Number(v.shareOfTotal || 0) * 100).toFixed(1),
              "أقدم تأخر (أيام)": v.oldestInvoiceDays,
              "عقد ساري": v.hasActiveContract ? "نعم" : "لا",
              "ينتهي قريباً": v.contractEndingSoon ? "نعم" : "لا",
              "Score": v.riskScore,
              "التصنيف": v.riskBand,
            })),
          })}
        />
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> ثلاث أسئلة جوهرية لإدارة الموردين
          </p>
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
            <li><strong>التركّز</strong>: تبعية لمورد واحد؟ موردين 5 يمثلون 70% من الإنفاق؟ خطر سلسلة توريد</li>
            <li><strong>حالة العقود</strong>: من ينتهي عقده قريباً؟ من بدون عقد ساري؟ — حوكمة مفقودة</li>
            <li><strong>الـ AP المفتوح + الأعمار</strong>: من أقدم فواتيره؟ — مؤشر سلوك سداد</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>منهجية score المخاطر:</strong> Concentration% × 0.8 + oldestDays × 0.3 + (no contract +20 / endingSoon +15)،
            حرج ≥60 / مرتفع ≥35 / متوسط ≥15 / منخفض.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Truck className="h-3 w-3" /> موردون نشطون
            </p>
            <p className="text-lg font-bold font-mono">{formatNumber(vendorAggregates.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي AP مفتوح</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(totalAp)}</p>
          </CardContent>
        </Card>
        <Card className={top5Share > 50 ? "border-amber-300" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" /> تركّز أعلى ٥
            </p>
            <p className={`text-lg font-bold font-mono ${top5Share > 70 ? "text-red-700" : top5Share > 50 ? "text-amber-700" : ""}`}>
              {top5Share.toFixed(1)}%
            </p>
            <p className="text-[9px] text-muted-foreground">الأعلى = {top1Share.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card className={(expiringContracts + noContract) > 0 ? "border-amber-300" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Handshake className="h-3 w-3" /> العقود
            </p>
            <p className={`text-lg font-bold font-mono ${(expiringContracts + noContract) > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {formatNumber(noContract)}
            </p>
            <p className="text-[9px] text-muted-foreground">
              بدون عقد · {formatNumber(expiringContracts)} ينتهي قريباً
            </p>
          </CardContent>
        </Card>
        <Card className={criticalCount > 0 ? "border-red-400 bg-red-50/30" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> موردون حرجة
            </p>
            <p className={`text-lg font-bold font-mono ${criticalCount > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {formatNumber(criticalCount)}
            </p>
            <p className="text-[9px] text-muted-foreground">+ {formatNumber(highCount)} مرتفع</p>
          </CardContent>
        </Card>
      </div>

      {top5Share > 50 && (
        <Card className="mb-4 border-amber-400 bg-amber-50/30">
          <CardContent className="p-3 text-sm flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-5 w-5" />
            <span>
              <strong>تنبيه تركّز التوريد:</strong> أكبر 5 موردين يستحوذون على {top5Share.toFixed(1)}% من إجمالي الـ AP —
              تأكد من توفر بدائل لكل واحد من الأعلى ({top1Share.toFixed(1)}%) لتفادي انقطاع التوريد.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-muted-foreground">تصنيف المخاطر:</span>
        <Badge variant={bandFilter === "" ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => setBandFilter("")}>الكل ({vendorAggregates.length})</Badge>
        {(Object.keys(BAND_LABEL) as Array<VendorAggregate["riskBand"]>).map((b) => {
          const count = vendorAggregates.filter((v) => v.riskBand === b).length;
          if (count === 0 && bandFilter !== b) return null;
          return (
            <Badge key={b}
              variant={bandFilter === b ? "default" : "outline"}
              className={`cursor-pointer text-xs ${BAND_COLOR[b]}`}
              onClick={() => setBandFilter(b)}>
              {BAND_LABEL[b]} ({count})
            </Badge>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">الموردون (الأعلى AP أولاً) — {filtered.length}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={filtered}
            onSortedDataChange={setPrintRows}
            pageSize={50}
            emptyMessage="لا توجد ذمم مفتوحة لأي مورد"
          />
        </CardContent>
      </Card>

      <Card className="mt-4 bg-muted/30">
        <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">إجراءات مقترحة:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><strong>للحرج (≥60):</strong> اجتماع تجديد عقد فوري + بحث بديل + سداد فواتير قديمة لتخفيف ضغط</li>
            <li><strong>لتركّز الأعلى ≥ 20%:</strong> ابدأ موردين بدلاء + سياسة التوريد المزدوج</li>
            <li><strong>لانتهاء عقد ≤30 يوم:</strong> ابدأ التفاوض الآن — لا تنتظر</li>
            <li><strong>لفواتير ≥60 يوم:</strong> راجع شروط الدفع وادفع لتفادي غرامات وقطع الخدمة</li>
          </ul>
        </CardContent>
      </Card>
    </PageShell>
  );
}
