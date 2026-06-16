import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { exportRowsToCsv } from "@/lib/unified-export";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  Building2, Download, Search, TrendingDown, Calendar, Package,
  ExternalLink, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";

/**
 * Fixed Asset Register — analytical dashboard
 *
 * Complements the CRUD `/finance/fixed-assets` page with portfolio
 * analytics: distributions by category/status/age, depreciation progress
 * per asset, aging buckets, and a searchable register with filters.
 *
 * Endpoint: GET /finance/fixed-assets
 */

interface FixedAsset {
  id: number;
  code: string | null;
  name: string;
  category: string | null;
  purchaseDate: string;
  purchaseCost: number | string;
  salvageValue: number | string;
  usefulLifeYears: number;
  depreciationMethod: string;
  currentBookValue: number | string;
  accumulatedDepreciation: number | string;
  status: string;
  assetAccountCode: string;
  depreciationAccountCode: string;
}

interface ListResp {
  data: FixedAsset[];
  total: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "نشط", color: "bg-status-success-foreground" },
  disposed: { label: "مُستبعد", color: "bg-status-danger-foreground" },
  fully_depreciated: { label: "مستهلك بالكامل", color: "bg-status-warning-foreground" },
  inactive: { label: "غير نشط", color: "bg-muted-foreground" },
};

function ageInYears(iso: string, today: string): number {
  const a = new Date(iso.split("T")[0] + "T00:00:00Z").getTime();
  const b = new Date(today + "T00:00:00Z").getTime();
  return Math.max(0, (b - a) / (365.25 * 86400000));
}

export default function FixedAssetRegisterPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const today = todayLocal();

  const { data, isLoading } = useApiQuery<ListResp>(
    ["fa-register"],
    `/finance/fixed-assets`,
  );

  const assets = data?.data ?? [];

  // Derived filter options
  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const a of assets) {
      if (a.category) s.add(a.category);
    }
    return Array.from(s).sort();
  }, [assets]);

  const filtered = useMemo(() => {
    let list = assets;
    if (statusFilter !== "all") list = list.filter(a => a.status === statusFilter);
    if (categoryFilter !== "all") list = list.filter(a => a.category === categoryFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(a =>
        (a.code ?? "").toLowerCase().includes(s) ||
        a.name.toLowerCase().includes(s) ||
        (a.category ?? "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [assets, search, statusFilter, categoryFilter]);

  // Stats
  const totalCost = filtered.reduce((s, a) => s + Number(a.purchaseCost), 0);
  const totalAccDep = filtered.reduce((s, a) => s + Number(a.accumulatedDepreciation), 0);
  const totalNBV = filtered.reduce((s, a) => s + Number(a.currentBookValue), 0);
  const totalSalvage = filtered.reduce((s, a) => s + Number(a.salvageValue), 0);

  const activeCount = filtered.filter(a => a.status === "active").length;
  const disposedCount = filtered.filter(a => a.status === "disposed").length;
  const fullyDeprCount = filtered.filter(a => a.status === "fully_depreciated").length;

  // Distribution by category
  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; count: number; cost: number; nbv: number }>();
    for (const a of filtered) {
      const key = a.category ?? "بدون فئة";
      const cur = map.get(key) ?? { name: key, count: 0, cost: 0, nbv: 0 };
      cur.count += 1;
      cur.cost += Number(a.purchaseCost);
      cur.nbv += Number(a.currentBookValue);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }, [filtered]);

  // Aging buckets
  const ageBuckets = useMemo(() => {
    const out = { lt1: 0, y1_3: 0, y3_5: 0, y5_10: 0, gt10: 0 };
    for (const a of filtered) {
      const age = ageInYears(a.purchaseDate, today);
      const cost = Number(a.purchaseCost);
      if (age < 1) out.lt1 += cost;
      else if (age < 3) out.y1_3 += cost;
      else if (age < 5) out.y3_5 += cost;
      else if (age < 10) out.y5_10 += cost;
      else out.gt10 += cost;
    }
    return out;
  }, [filtered, today]);

  // GAP_MATRIX item #7 — was building CSV client-side via Blob +
  // createObjectURL, bypassing print_jobs / letterhead / RBAC re-check.
  // Routed through the unified export helper so the download appears
  // in /reports/print-log with entity=report_fixed_assets.
  const { toast } = useToast();
  const exportCSV = async () => {
    try {
      await exportRowsToCsv({
        entityType: "report_fixed_assets",
        title: `سجل الأصول الثابتة — ${today}`,
        rows: filtered as unknown as Record<string, unknown>[],
        columns: [
          { key: "code",                    label: "الرمز",            format: (v) => String(v ?? "") },
          { key: "name",                    label: "الاسم" },
          { key: "category",                label: "الفئة",            format: (v) => String(v ?? "") },
          { key: "purchaseDate",            label: "تاريخ الشراء",     format: (v) => String(v).split("T")[0] },
          { key: "purchaseCost",            label: "التكلفة",          format: (v) => Number(v).toFixed(2) },
          { key: "salvageValue",            label: "قيمة الإنقاذ",      format: (v) => Number(v).toFixed(2) },
          { key: "usefulLifeYears",         label: "العمر الإنتاجي",    format: (v) => String(v) },
          { key: "depreciationMethod",      label: "طريقة الإهلاك" },
          { key: "accumulatedDepreciation", label: "الإهلاك المتراكم",  format: (v) => Number(v).toFixed(2) },
          { key: "currentBookValue",        label: "القيمة الدفترية",   format: (v) => Number(v).toFixed(2) },
          { key: "status",                  label: "الحالة",            format: (v) => STATUS_LABELS[v as keyof typeof STATUS_LABELS]?.label ?? String(v) },
        ],
      });
    } catch (err) {
      toast({
        title: "تعذّر تصدير CSV",
        description: (err as { message?: string })?.message ?? "خطأ غير متوقع",
        variant: "destructive",
      });
    }
  };

  return (
    <PageShell
      title="سجل الأصول الثابتة"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "سجل الأصول الثابتة" },
      ]}
      subtitle="نظرة محفظية على الأصول — توزيع، أعمار، تقدم الإهلاك"
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/fixed-assets">
              <Package className="h-3.5 w-3.5 ml-1" />
              إدارة الأصول
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/fixed-assets/batch-depreciate">
              <TrendingDown className="h-3.5 w-3.5 ml-1" />
              إهلاك دفعي
            </Link></Button>
        </div>
      }
    >
      <FinanceTabsNav />

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-48">
              <label className="text-xs text-muted-foreground mb-1 block">بحث</label>
              <div className="relative">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="رمز أو اسم أو فئة..."
                  className="pr-9"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الحالة</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm bg-background"
              >
                <option value="all">الكل</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            {categories.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الفئة</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="border rounded px-3 py-1.5 text-sm bg-background"
                >
                  <option value="all">الكل</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
              <Download className="w-4 h-4 ml-1" />
              CSV
            </Button>
            <PrintButton
              entityType="report_fixed_asset_register"
              entityId="all"
              payload={{
                entity: {
                  title: "سجل الأصول الثابتة",
                  count: filtered.length,
                  totalCost: filtered.reduce((s, a) => s + Number(a.purchaseCost ?? 0), 0),
                  totalBookValue: filtered.reduce((s, a) => s + Number(a.currentBookValue ?? 0), 0),
                },
                items: filtered.map((a) => ({
                  "الكود": a.code ?? "",
                  "اسم الأصل": a.name,
                  "الفئة": a.category ?? "",
                  "تاريخ الشراء": a.purchaseDate,
                  "التكلفة": Number(a.purchaseCost ?? 0),
                  "العمر الإنتاجي (سنة)": a.usefulLifeYears,
                  "طريقة الإهلاك": a.depreciationMethod,
                  "الإهلاك المتراكم": Number(a.accumulatedDepreciation ?? 0),
                  "القيمة الدفترية": Number(a.currentBookValue ?? 0),
                  "الحالة": a.status,
                })),
              }}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  إجمالي التكلفة
                </div>
                <div className="text-xl font-bold tabular-nums">{formatCurrency(totalCost)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{filtered.length} أصل</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-status-danger-foreground" />
                  الإهلاك المتراكم
                </div>
                <div className="text-xl font-bold tabular-nums text-status-danger-foreground">
                  {formatCurrency(totalAccDep)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {totalCost > 0 ? `${((totalAccDep / totalCost) * 100).toFixed(1)}% من التكلفة` : "—"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">القيمة الدفترية الصافية</div>
                <div className="text-xl font-bold tabular-nums text-status-success-foreground">
                  {formatCurrency(totalNBV)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  قيمة الإنقاذ: {formatCurrency(totalSalvage)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">توزيع الحالة</div>
                <div className="space-y-1 mt-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-status-success-foreground">نشط</span>
                    <span className="tabular-nums">{activeCount}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-status-warning-foreground">مستهلك بالكامل</span>
                    <span className="tabular-nums">{fullyDeprCount}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-status-danger-foreground">مُستبعد</span>
                    <span className="tabular-nums">{disposedCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Distribution charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* By category */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  التوزيع حسب الفئة
                </CardTitle>
              </CardHeader>
              <CardContent>
                {byCategory.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-6">لا فئات</div>
                ) : (
                  <div className="space-y-2">
                    {byCategory.slice(0, 8).map(c => {
                      const pct = totalCost > 0 ? (c.cost / totalCost) * 100 : 0;
                      return (
                        <div key={c.name}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium">{c.name}</span>
                            <span className="text-muted-foreground tabular-nums">
                              {c.count} • {formatCurrency(c.cost)} ({pct.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded overflow-hidden">
                            <div
                              className="bg-status-info-foreground h-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By age */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  التوزيع حسب العمر
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { label: "أقل من سنة", value: ageBuckets.lt1, color: "bg-status-success-foreground" },
                    { label: "1-3 سنوات", value: ageBuckets.y1_3, color: "bg-status-info-foreground" },
                    { label: "3-5 سنوات", value: ageBuckets.y3_5, color: "bg-status-warning-foreground" },
                    { label: "5-10 سنوات", value: ageBuckets.y5_10, color: "bg-orange-400" },
                    { label: "أكثر من 10", value: ageBuckets.gt10, color: "bg-status-danger-foreground" },
                  ].map(b => {
                    const pct = totalCost > 0 ? (b.value / totalCost) * 100 : 0;
                    return (
                      <div key={b.label}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium">{b.label}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {formatCurrency(b.value)} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded overflow-hidden">
                          <div className={b.color} style={{ width: `${pct}%`, height: "100%" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Register table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">السجل التفصيلي ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable<FixedAsset>
                data={filtered}
                rowKey={(a) => String(a.id)}
                noToolbar
                pageSize={0}
                emptyMessage="لا توجد أصول مطابقة للفلتر"
                columns={[
                  {
                    key: "name", header: "الرمز/الاسم",
                    render: (a) => (
                      <>
                        <div className="font-mono text-[11px] text-muted-foreground">{a.code ?? "—"}</div>
                        <div className="font-medium">{a.name}</div>
                      </>
                    ),
                  },
                  { key: "category", header: "الفئة", render: (a) => <span className="text-xs">{a.category ?? "—"}</span> },
                  { key: "purchaseCost", header: "التكلفة", align: "end", render: (a) => <span className="tabular-nums">{formatCurrency(Number(a.purchaseCost))}</span> },
                  {
                    key: "usefulLifeYears", header: "العمر/طريقة", align: "end",
                    render: (a) => (
                      <>
                        <div className="text-xs">{ageInYears(a.purchaseDate, today).toFixed(1)} / {a.usefulLifeYears} سنة</div>
                        <div className="text-[10px] text-muted-foreground">{a.depreciationMethod}</div>
                      </>
                    ),
                  },
                  {
                    key: "accumulatedDepreciation", header: "الإهلاك", align: "end",
                    render: (a) => <span className="tabular-nums text-status-danger-foreground">{formatCurrency(Number(a.accumulatedDepreciation))}</span>,
                  },
                  {
                    key: "currentBookValue", header: "القيمة الدفترية", align: "end",
                    render: (a) => <span className="tabular-nums font-semibold text-status-success-foreground">{formatCurrency(Number(a.currentBookValue))}</span>,
                  },
                  {
                    key: "depreciationMethod", header: "تقدم الإهلاك",
                    render: (a) => {
                      const cost = Number(a.purchaseCost);
                      const dep = Number(a.accumulatedDepreciation);
                      const pct = cost > 0 ? (dep / cost) * 100 : 0;
                      return (
                        <div className="flex items-center gap-1">
                          <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                            <div className={pct >= 100 ? "bg-status-warning-foreground" : "bg-status-danger-foreground"} style={{ width: `${Math.min(pct, 100)}%`, height: "100%" }} />
                          </div>
                          <span className="text-[10px] tabular-nums w-8 text-end">{pct.toFixed(0)}%</span>
                        </div>
                      );
                    },
                  },
                  {
                    key: "status", header: "الحالة",
                    render: (a) => {
                      const s = STATUS_LABELS[a.status] ?? { label: a.status, color: "bg-muted" };
                      return (
                        <Badge variant="outline" className="text-[10px]">
                          <span className={`w-1.5 h-1.5 rounded-full ${s.color} ml-1`} />
                          {s.label}
                        </Badge>
                      );
                    },
                  },
                  {
                    key: "id", header: "",
                    render: (a) => (
                      <Button asChild variant="ghost" size="icon" title="فتح في نافذة جديدة" className="h-7 w-7">
                        <Link href={`/finance/fixed-assets/${a.id}`}><ExternalLink className="w-3 h-3" /></Link>
                      </Button>
                    ),
                  },
                ] satisfies DataTableColumn<FixedAsset>[]}
                renderGrandTotal={() => (
                  <tr className="font-semibold bg-muted/40 border-t-2">
                    <td colSpan={2} className="py-2 px-3">الإجمالي</td>
                    <td className="py-2 px-3 text-end tabular-nums">{formatCurrency(totalCost)}</td>
                    <td className="py-2 px-3" />
                    <td className="py-2 px-3 text-end tabular-nums text-status-danger-foreground">{formatCurrency(totalAccDep)}</td>
                    <td className="py-2 px-3 text-end tabular-nums text-status-success-foreground">{formatCurrency(totalNBV)}</td>
                    <td className="py-2 px-3 text-end tabular-nums">{totalCost > 0 ? `${((totalAccDep / totalCost) * 100).toFixed(0)}%` : "—"}</td>
                    <td colSpan={2} />
                  </tr>
                )}
              />
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
