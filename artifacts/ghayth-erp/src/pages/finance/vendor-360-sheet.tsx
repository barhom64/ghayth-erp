import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { VendorSelect } from "@/components/shared/entity-selects";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { InlineSparkline } from "@/components/shared/inline-sparkline";
import { PrintButton } from "@/components/shared/print-button";
import {
  Building2, Phone, Mail, Printer, Download, AlertTriangle,
  FileSignature, Banknote, ExternalLink, Users, Activity,
  FileText, ShoppingCart, BarChart3,
} from "lucide-react";
import {
  formatCurrency, formatDateAr, currentYearRiyadh, todayLocal,
} from "@/lib/formatters";

/**
 * Vendor 360° Sheet — Integrative briefing
 *
 * Sister to Customer 360°. Combines FOUR endpoints into one briefing:
 *   1. Vendor profile (/finance/vendors/:id)
 *   2. Statement + aging (/finance/reports/vendor-statement/:id)
 *   3. Active contracts (/finance/contracts?vendorId)
 *   4. Pending POs (derived from payment-run/pending)
 *
 * Cross-links to: statement print, settlement workbench, payment run,
 * spend analytics, contracts tracker, entity 360.
 */

interface Vendor {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  residencyStatus?: string;
  taxResidenceCountry?: string;
  defaultPaymentTerms?: string | null;
}

interface StmtResp {
  supplier: Vendor;
  period: { from: string; to: string };
  openingBalance: number;
  endingBalance: number;
  totals: { totalDebit: number; totalCredit: number; movementCount: number };
  aging: {
    current: number;
    "1-30": number;
    "31-60": number;
    "61-90": number;
    "90+": number;
    total: number;
  };
  movements: Array<{
    id: number;
    ref: string;
    date: string;
    debit: number | string;
    credit: number | string;
    movementType: string;
    description: string;
    runningBalance: number;
  }>;
}

interface ContractsResp {
  data: Array<{
    id: number;
    title?: string;
    endDate?: string | null;
    totalValue?: number | string;
    status: string;
  }>;
}

interface PendingResp {
  data: Array<{ id: number; ref: string; totalAmount: number | string; supplierId: number; expectedDelivery?: string | null }>;
}

export default function Vendor360SheetPage() {
  const today = todayLocal();
  const initialVendorId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("vendorId") ?? ""
    : "";
  const [vendorId, setVendorId] = useState<string>(initialVendorId);

  const { data: vendor } = useApiQuery<Vendor>(
    ["v360-vendor", vendorId],
    vendorId ? `/finance/vendors/${vendorId}` : null,
  );

  const { data: stmt, isLoading: stmtLoading } = useApiQuery<StmtResp>(
    ["v360-stmt", vendorId],
    vendorId ? `/finance/reports/vendor-statement/${vendorId}?startDate=${currentYearRiyadh()}-01-01&endDate=${today}` : null,
  );

  const { data: contracts } = useApiQuery<ContractsResp>(
    ["v360-contracts", vendorId],
    vendorId ? `/finance/contracts?vendorId=${vendorId}` : null,
  );

  const { data: pending } = useApiQuery<PendingResp>(
    ["v360-pending"],
    `/finance/payment-run/pending`,
  );

  const vendorPos = useMemo(() => {
    if (!vendorId || !pending?.data) return [];
    const id = Number(vendorId);
    return pending.data.filter(p => p.supplierId === id);
  }, [pending, vendorId]);

  const vendorPosTotal = vendorPos.reduce((s, p) => s + Number(p.totalAmount), 0);

  const activeContracts = (contracts?.data ?? []).filter(c => c.status === "active");
  const totalContractValue = activeContracts.reduce((s, c) => s + Number(c.totalValue ?? 0), 0);

  // Expiring within 60 days
  const expiringContracts = activeContracts.filter(c => {
    if (!c.endDate) return false;
    const days = Math.round((new Date(c.endDate.split("T")[0] + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86400000);
    return days >= 0 && days <= 60;
  });

  const aging = stmt?.aging;
  const overdueAmount = aging ? Number(aging["1-30"] ?? 0) + Number(aging["31-60"] ?? 0) + Number(aging["61-90"] ?? 0) + Number(aging["90+"] ?? 0) : 0;
  const owedToVendor = stmt?.endingBalance ?? 0;

  // Liability concentration score — how much we owe vs how big they are
  const owedScore = useMemo(() => {
    if (!stmt) return 0;
    const open = aging?.total ?? 0;
    if (open === 0) return 0;
    const overdueRatio = overdueAmount / open;
    const score = Math.round(overdueRatio * 100);
    return Math.min(100, score);
  }, [stmt, aging, overdueAmount]);

  const recentMovements = (stmt?.movements ?? []).slice(-5).reverse();

  const exportCSV = () => {
    if (!stmt || !vendor) return;
    const lines: string[] = [];
    lines.push(`ملف المورد 360° — ${vendor.name}`);
    lines.push(`الفترة: ${stmt.period.from} → ${stmt.period.to}`);
    lines.push("");
    lines.push("معلومات المورد:");
    lines.push(`الاسم,${vendor.name}`);
    if (vendor.taxNumber) lines.push(`الرقم الضريبي,${vendor.taxNumber}`);
    if (vendor.taxResidenceCountry) lines.push(`الدولة,${vendor.taxResidenceCountry}`);
    if (vendor.residencyStatus) lines.push(`حالة الإقامة,${vendor.residencyStatus}`);
    if (vendor.phone) lines.push(`الجوال,${vendor.phone}`);
    if (vendor.email) lines.push(`البريد,${vendor.email}`);
    if (vendor.defaultPaymentTerms) lines.push(`شروط الدفع,${vendor.defaultPaymentTerms}`);
    lines.push("");
    lines.push("الوضع المالي:");
    lines.push(`الرصيد المستحق,${owedToVendor.toFixed(2)}`);
    lines.push(`متأخر إجمالي,${overdueAmount.toFixed(2)}`);
    lines.push(`POs جاهزة للدفع,${vendorPosTotal.toFixed(2)}`);
    lines.push(`عقود نشطة,${activeContracts.length}`);
    lines.push(`قيمة العقود,${totalContractValue.toFixed(2)}`);
    lines.push(`عقود تنتهي خلال 60 يوم,${expiringContracts.length}`);

    // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
    // Routed through unified export helper for audit + letterhead.
    {
      const _allLines = lines;
      const _headers = (_allLines[0] ?? "").split(",");
      const _rows = _allLines.slice(1).map((line) => {
        const parts = line.split(",");
        const obj: Record<string, string> = {};
        _headers.forEach((h, i) => { obj[h] = parts[i] ?? ""; });
        return obj;
      });
      void exportRowsToCsv({
        entityType: "report_vendor_360_sheet",
        title: String(`vendor-360-${vendor.name}-${today}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="ملف المورد 360°"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "ملف المورد 360°" },
      ]}
      subtitle="ملخص شامل لعلاقة المورد المالية — جاهز للاجتماعات والمفاوضات"
    >
      <FinanceTabsNav />

      {/* Selector */}
      <Card className="mb-4 print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-64">
            <VendorSelect value={vendorId} onChange={setVendorId} label="المورد" />
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!stmt}>
            <Download className="w-4 h-4 ml-1" />
            CSV
          </Button>
          {vendorId && (
            <PrintButton
              entityType="report_vendor_360"
              entityId={String(vendorId)}
              variant="default"
              label="طباعة ملف 360°"
              payload={{
                entity: {
                  title: "ملف المورد 360°",
                  vendorId,
                  vendorName: vendor?.name ?? "",
                  asOfDate: today,
                  endingBalance: stmt?.endingBalance ?? 0,
                },
                items: (stmt?.movements ?? []).map((m: any) => ({
                  "التاريخ": m.date?.split("T")[0] ?? "",
                  "المرجع": m.ref ?? "",
                  "البيان": m.description ?? "",
                  "مدين": Number(m.debit ?? 0),
                  "دائن": Number(m.credit ?? 0),
                  "الرصيد": Number(m.runningBalance ?? 0),
                })),
              }}
            />
          )}
          {vendorId && (
            <Button asChild variant="outline" size="sm"><Link href={`/finance/vendor-statement-print?vendorId=${vendorId}`}>
                <Printer className="w-4 h-4 ml-1" />
                كشف حساب مفصّل
              </Link></Button>
          )}
        </CardContent>
      </Card>

      {!vendorId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
            اختر مورداً لعرض ملفه الشامل
          </CardContent>
        </Card>
      ) : stmtLoading ? (
        <LoadingSpinner />
      ) : !stmt || !vendor ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد بيانات</CardContent></Card>
      ) : (
        <div className="space-y-4 bg-background border rounded p-6">
          {/* Header */}
          <div className="border-b-2 pb-3 flex items-start justify-between">
            <div>
              <div className="text-xs text-muted-foreground">ملف المورد الشامل</div>
              <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                <Building2 className="w-6 h-6" />
                {vendor.name}
              </h1>
              {vendor.taxNumber && (
                <div className="text-xs text-muted-foreground">
                  الرقم الضريبي: <code className="font-mono">{vendor.taxNumber}</code>
                </div>
              )}
              <div className="flex items-center gap-3 mt-1 text-xs">
                {vendor.phone && (
                  <a href={`tel:${vendor.phone}`} className="flex items-center gap-1 hover:underline">
                    <Phone className="w-3 h-3" />
                    {vendor.phone}
                  </a>
                )}
                {vendor.email && (
                  <a href={`mailto:${vendor.email}`} className="flex items-center gap-1 hover:underline">
                    <Mail className="w-3 h-3" />
                    {vendor.email}
                  </a>
                )}
                {vendor.taxResidenceCountry && (
                  <span>🌍 {vendor.taxResidenceCountry}</span>
                )}
                {vendor.residencyStatus && (
                  <Badge variant="outline" className="text-[10px]">{vendor.residencyStatus}</Badge>
                )}
              </div>
            </div>
            <div className="text-end">
              <div className="text-xs text-muted-foreground">تاريخ التقرير</div>
              <div className="font-semibold">{formatDateAr(today)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                الفترة: {formatDateAr(stmt.period.from)} → {formatDateAr(stmt.period.to)}
              </div>
            </div>
          </div>

          {/* Financial summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">الرصيد المستحق</div>
                <div className={`text-xl font-bold tabular-nums ${owedToVendor < 0 ? "text-status-warning-foreground" : "text-status-success-foreground"}`}>
                  {formatCurrency(Math.abs(owedToVendor))}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {owedToVendor < 0 ? "نحن مدينون له" : owedToVendor > 0 ? "نحن دائنون له" : "متوازن"}
                </div>
                <InlineSparkline
                  values={(stmt?.movements ?? []).map((m) => Number(m.runningBalance ?? 0))}
                  tone={owedToVendor < 0 ? "warning" : "success"}
                  testid="vendor-360-balance-spark"
                />
              </CardContent>
            </Card>
            <Card className={overdueAmount > 0 ? "border-status-warning-foreground" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">متأخر السداد</div>
                <div className={`text-xl font-bold tabular-nums ${overdueAmount > 0 ? "text-status-warning-foreground" : ""}`}>
                  {formatCurrency(overdueAmount)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  ربما يحتاج تواصل
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <ShoppingCart className="w-3 h-3" />
                  POs جاهزة للدفع
                </div>
                <div className="text-xl font-bold tabular-nums">
                  {formatCurrency(vendorPosTotal)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {vendorPos.length} أمر جاهز
                </div>
              </CardContent>
            </Card>
            <Card className={expiringContracts.length > 0 ? "border-status-warning-foreground" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <FileSignature className="w-3 h-3" />
                  عقود نشطة
                </div>
                <div className="text-xl font-bold tabular-nums">{activeContracts.length}</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  قيمتها {formatCurrency(totalContractValue)}
                </div>
                {expiringContracts.length > 0 && (
                  <div className="text-[10px] text-status-warning-foreground mt-1">
                    ⚠ {expiringContracts.length} تنتهي قريباً
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">شروط الدفع</div>
                <div className="text-xl font-bold tabular-nums">
                  {vendor.defaultPaymentTerms ?? "—"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Aging */}
          {aging && aging.total > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">أعمار أوامر الشراء المفتوحة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { key: "current" as const, label: "حالي", color: "" },
                    { key: "1-30" as const, label: "1-30 يوم", color: "text-status-success-foreground" },
                    { key: "31-60" as const, label: "31-60 يوم", color: "text-status-warning-foreground" },
                    { key: "61-90" as const, label: "61-90 يوم", color: "text-status-warning-foreground" },
                    { key: "90+" as const, label: "+90 يوم", color: "text-status-danger-foreground" },
                  ].map(b => {
                    const value = aging[b.key];
                    const pct = aging.total > 0 ? (value / aging.total) * 100 : 0;
                    return (
                      <div key={b.key} className="border rounded p-2 text-center">
                        <div className="text-[10px] text-muted-foreground">{b.label}</div>
                        <div className={`font-bold tabular-nums ${b.color}`}>{formatCurrency(value)}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{pct.toFixed(0)}%</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Active contracts */}
          {activeContracts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSignature className="w-4 h-4" />
                  العقود النشطة ({activeContracts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <DataTable
                    data={activeContracts}
                    rowKey={(c) => c.id}
                    noToolbar
                    pageSize={0}
                    className="text-sm"
                    columns={[
                      {
                        key: "title", header: "العنوان",
                        render: (c) => <>{c.title ?? `عقد #${c.id}`}</>,
                      },
                      {
                        key: "endDate", header: "ينتهي",
                        render: (c) => {
                          const days = c.endDate
                            ? Math.round((new Date(c.endDate.split("T")[0] + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86400000)
                            : null;
                          const isExpiring = days != null && days >= 0 && days <= 60;
                          return c.endDate ? (
                            <>
                              {formatDateAr(c.endDate.split("T")[0])}
                              {days != null && (
                                <span className={`text-[10px] mr-2 ${isExpiring ? "text-status-warning-foreground" : "text-muted-foreground"}`}>
                                  ({days < 0 ? `متأخر ${Math.abs(days)}ي` : `${days}ي`})
                                </span>
                              )}
                            </>
                          ) : "—";
                        },
                      },
                      {
                        key: "totalValue", header: "القيمة", align: "end",
                        render: (c) => (
                          <span className="tabular-nums font-semibold">{formatCurrency(Number(c.totalValue ?? 0))}</span>
                        ),
                      },
                      {
                        key: "_action", header: "", sortable: false,
                        render: () => (
                          <Button asChild variant="ghost" size="icon" title="فتح في نافذة جديدة" className="h-7 w-7"><Link href="/finance/contracts"><ExternalLink className="w-3 h-3" /></Link></Button>
                        ),
                      },
                    ] satisfies DataTableColumn<ContractsResp["data"][number]>[]}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pending POs */}
          {vendorPos.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  أوامر شراء جاهزة للدفع ({vendorPos.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <DataTable
                    data={vendorPos}
                    rowKey={(p) => p.id}
                    noToolbar
                    pageSize={0}
                    className="text-sm"
                    columns={[
                      {
                        key: "ref", header: "المرجع", ltr: true,
                        render: (p) => <span className="font-mono text-xs">{p.ref}</span>,
                      },
                      {
                        key: "expectedDelivery", header: "تاريخ التسليم",
                        render: (p) => (
                          <span className="text-xs">{p.expectedDelivery ? formatDateAr(p.expectedDelivery.split("T")[0]) : "—"}</span>
                        ),
                      },
                      {
                        key: "totalAmount", header: "المبلغ", align: "end",
                        render: (p) => (
                          <span className="tabular-nums font-semibold">{formatCurrency(Number(p.totalAmount))}</span>
                        ),
                      },
                      {
                        key: "_action", header: "", sortable: false,
                        render: (p) => (
                          <Button asChild variant="ghost" size="icon" title="فتح في نافذة جديدة" className="h-7 w-7"><Link href={`/finance/purchase-orders/${p.id}`}><ExternalLink className="w-3 h-3" /></Link></Button>
                        ),
                      },
                    ] satisfies DataTableColumn<PendingResp["data"][number]>[]}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent activity */}
          {recentMovements.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  آخر 5 حركات
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <DataTable
                    data={recentMovements}
                    rowKey={(m) => `${m.movementType}-${m.id}`}
                    noToolbar
                    pageSize={0}
                    className="text-sm"
                    columns={[
                      {
                        key: "date", header: "التاريخ",
                        render: (m) => <span className="text-xs">{formatDateAr(m.date.split("T")[0])}</span>,
                      },
                      {
                        key: "ref", header: "المرجع", ltr: true,
                        render: (m) => <span className="font-mono text-xs">{m.ref}</span>,
                      },
                      {
                        key: "description", header: "الوصف",
                        render: (m) => <span className="text-xs">{m.description}</span>,
                      },
                      {
                        key: "debit", header: "مدين", align: "end",
                        render: (m) => (
                          <span className="tabular-nums">{Number(m.debit) > 0 ? formatCurrency(Number(m.debit)) : "—"}</span>
                        ),
                      },
                      {
                        key: "credit", header: "دائن", align: "end",
                        render: (m) => (
                          <span className="tabular-nums">{Number(m.credit) > 0 ? formatCurrency(Number(m.credit)) : "—"}</span>
                        ),
                      },
                    ] satisfies DataTableColumn<StmtResp["movements"][number]>[]}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick actions */}
          <Card className="print:hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">إجراءات سريعة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Button asChild variant="outline" size="sm" className="w-full justify-start"><Link href={`/finance/vendor-statement-print?vendorId=${vendorId}`}>
                    <Printer className="w-4 h-4 ml-1" />
                    كشف الحساب
                    <ExternalLink className="w-3 h-3 mr-auto" />
                  </Link></Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start"><Link href={`/finance/payment-run?supplierId=${vendorId}`}>
                    <Banknote className="w-4 h-4 ml-1" />
                    دفع للمورد
                    <ExternalLink className="w-3 h-3 mr-auto" />
                  </Link></Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start"><Link href={`/finance/vendor-settlement-workbench`}>
                    <AlertTriangle className="w-4 h-4 ml-1" />
                    منضدة التسوية
                    <ExternalLink className="w-3 h-3 mr-auto" />
                  </Link></Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start"><Link href={`/finance/vendor-spend`}>
                    <BarChart3 className="w-4 h-4 ml-1" />
                    إنفاق الموردين
                    <ExternalLink className="w-3 h-3 mr-auto" />
                  </Link></Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start"><Link href={`/finance/vendor-contracts-tracker`}>
                    <FileSignature className="w-4 h-4 ml-1" />
                    متابعة العقود
                    <ExternalLink className="w-3 h-3 mr-auto" />
                  </Link></Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start"><Link href={`/finance/entity-360?type=supplier&id=${vendorId}`}>
                    <Users className="w-4 h-4 ml-1" />
                    Entity 360
                    <ExternalLink className="w-3 h-3 mr-auto" />
                  </Link></Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start"><Link href={`/finance/vendors/${vendorId}`}>
                    <Building2 className="w-4 h-4 ml-1" />
                    صفحة المورد
                    <ExternalLink className="w-3 h-3 mr-auto" />
                  </Link></Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
