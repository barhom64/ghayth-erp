import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { ClientSelect } from "@/components/shared/entity-selects";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { InlineSparkline } from "@/components/shared/inline-sparkline";
import { PrintButton } from "@/components/shared/print-button";
import {
  Building2, Phone, Mail, Printer, Download, AlertTriangle,
  TrendingUp, TrendingDown, FileText, DollarSign, ExternalLink,
  Users, Activity, ShieldAlert,
} from "lucide-react";
import {
  formatCurrency, formatDateAr, currentYearRiyadh, todayLocal,
} from "@/lib/formatters";

/**
 * Customer 360° Sheet — Integrative briefing
 *
 * Single source of truth for customer relationship review. Combines
 * FOUR endpoints into one printable sheet for sales/AR/management:
 *   1. Client profile (/clients/:id)
 *   2. Statement + aging (/finance/reports/customer-statement/:id)
 *   3. Open advances (/finance/customer-advances?clientId)
 *   4. Risk profile (derived)
 *
 * Cross-links to: statement print, collection workbench, receipt
 * wizard, advances workbench, and entity-360.
 */

interface ClientResp {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  vatNumber?: string;
  address?: string;
  creditLimit?: number | string;
  notes?: string;
}

interface StmtResp {
  client: { name: string; phone?: string; email?: string; vatNumber?: string };
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
    dueDate?: string | null;
    movementType: string;
    description: string;
    runningBalance: number;
  }>;
}

interface AdvancesResp {
  data: Array<{
    id: number;
    ref: string;
    amount: number | string;
    appliedAmount: number | string;
    remaining: number | string;
    status: string;
    receivedDate: string;
  }>;
}

export default function Customer360SheetPage() {
  const today = todayLocal();
  const initialClientId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("clientId") ?? ""
    : "";
  const [clientId, setClientId] = useState<string>(initialClientId);

  const { data: client } = useApiQuery<ClientResp>(
    ["c360-client", clientId],
    clientId ? `/clients/${clientId}` : null,
  );

  const { data: stmt, isLoading: stmtLoading } = useApiQuery<StmtResp>(
    ["c360-stmt", clientId],
    clientId ? `/finance/reports/customer-statement/${clientId}?startDate=${currentYearRiyadh()}-01-01&endDate=${today}` : null,
  );

  const { data: advances } = useApiQuery<AdvancesResp>(
    ["c360-adv", clientId],
    clientId ? `/finance/customer-advances?clientId=${clientId}` : null,
  );

  const openAdvances = (advances?.data ?? []).filter(a => Number(a.remaining) > 0.01);
  const advanceCredit = openAdvances.reduce((s, a) => s + Number(a.remaining), 0);

  const aging = stmt?.aging;
  const overdueAmount = aging ? Number(aging["1-30"] ?? 0) + Number(aging["31-60"] ?? 0) + Number(aging["61-90"] ?? 0) + Number(aging["90+"] ?? 0) : 0;
  const seriousOverdue = aging ? Number(aging["61-90"] ?? 0) + Number(aging["90+"] ?? 0) : 0;

  // Risk score: 0-100, higher = worse
  const riskScore = useMemo(() => {
    if (!aging || aging.total === 0) return 0;
    let score = 0;
    score += Math.min((Number(aging["1-30"]) / aging.total) * 20, 20);
    score += Math.min((Number(aging["31-60"]) / aging.total) * 30, 30);
    score += Math.min((Number(aging["61-90"]) / aging.total) * 40, 40);
    score += Math.min((Number(aging["90+"]) / aging.total) * 50, 50);
    // Credit limit usage
    if (client?.creditLimit && stmt?.endingBalance) {
      const usage = stmt.endingBalance / Number(client.creditLimit);
      if (usage > 1) score += 20;
      else if (usage > 0.8) score += 10;
    }
    return Math.min(100, Math.round(score));
  }, [aging, client, stmt]);

  const riskLevel = riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : "low";
  const riskColor = riskLevel === "high" ? "text-status-danger-foreground" :
                    riskLevel === "medium" ? "text-status-warning-foreground" :
                    "text-status-success-foreground";

  // Latest activity
  const recentMovements = (stmt?.movements ?? []).slice(-5).reverse();

  const exportCSV = () => {
    if (!stmt || !client) return;
    const lines: string[] = [];
    lines.push(`ملف العميل 360° — ${client.name}`);
    lines.push(`الفترة: ${stmt.period.from} → ${stmt.period.to}`);
    lines.push("");
    lines.push(`المعلومات:`);
    lines.push(`الاسم,${client.name}`);
    if (client.vatNumber) lines.push(`الرقم الضريبي,${client.vatNumber}`);
    if (client.phone) lines.push(`الجوال,${client.phone}`);
    if (client.email) lines.push(`البريد,${client.email}`);
    if (client.creditLimit) lines.push(`حد ائتماني,${Number(client.creditLimit).toFixed(2)}`);
    lines.push("");
    lines.push(`الوضع المالي:`);
    lines.push(`الرصيد الافتتاحي,${stmt.openingBalance.toFixed(2)}`);
    lines.push(`الرصيد الختامي,${stmt.endingBalance.toFixed(2)}`);
    lines.push(`متأخر إجمالي,${overdueAmount.toFixed(2)}`);
    lines.push(`متأخر +60 يوم,${seriousOverdue.toFixed(2)}`);
    lines.push(`نقاط مخاطر,${riskScore}/100`);
    lines.push(`دفعات مقدمة قابلة للتطبيق,${advanceCredit.toFixed(2)}`);
    lines.push("");
    lines.push("أعمار الفواتير المفتوحة:");
    lines.push(`حالي,${aging?.current.toFixed(2) ?? "0"}`);
    lines.push(`1-30 يوم,${aging?.["1-30"].toFixed(2) ?? "0"}`);
    lines.push(`31-60 يوم,${aging?.["31-60"].toFixed(2) ?? "0"}`);
    lines.push(`61-90 يوم,${aging?.["61-90"].toFixed(2) ?? "0"}`);
    lines.push(`أكثر من 90,${aging?.["90+"].toFixed(2) ?? "0"}`);

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
        entityType: "report_customer_360_sheet",
        title: String(`customer-360-${client.name}-${today}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="ملف العميل 360°"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "ملف العميل 360°" },
      ]}
      subtitle="ملخص شامل لعلاقة العميل المالية — جاهز للطباعة والاجتماعات"
    >
      <FinanceTabsNav />

      {/* Selector (hidden in print) */}
      <Card className="mb-4 print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-64">
            <ClientSelect value={clientId} onChange={setClientId} label="العميل" />
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!stmt}>
            <Download className="w-4 h-4 ml-1" />
            CSV
          </Button>
          {clientId && (
            <PrintButton
              entityType="report_customer_360"
              entityId={String(clientId)}
              variant="default"
              label="طباعة ملف 360°"
              payload={{
                entity: {
                  title: "ملف العميل 360°",
                  clientId,
                  clientName: client?.name ?? "",
                  asOfDate: todayLocal(),
                  endingBalance: stmt?.endingBalance ?? 0,
                  creditLimit: client?.creditLimit ?? 0,
                  overdueAmount,
                  seriousOverdue,
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
          {clientId && (
            <Button asChild variant="outline" size="sm"><Link href={`/finance/customer-statement-print?clientId=${clientId}`}>
                <Printer className="w-4 h-4 ml-1" />
                كشف حساب مفصّل
              </Link></Button>
          )}
        </CardContent>
      </Card>

      {!clientId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
            اختر عميلاً لعرض ملفه الشامل
          </CardContent>
        </Card>
      ) : stmtLoading ? (
        <LoadingSpinner />
      ) : !stmt || !client ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد بيانات</CardContent></Card>
      ) : (
        <div className="space-y-4 bg-background border rounded p-6 print:border-0 print:p-0 print:shadow-none">
          {/* Header */}
          <div className="border-b-2 pb-3 flex items-start justify-between">
            <div>
              <div className="text-xs text-muted-foreground">ملف العميل الشامل</div>
              <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                <Building2 className="w-6 h-6" />
                {client.name}
              </h1>
              {client.vatNumber && (
                <div className="text-xs text-muted-foreground">
                  الرقم الضريبي: <code className="font-mono">{client.vatNumber}</code>
                </div>
              )}
              <div className="flex items-center gap-3 mt-1 text-xs">
                {client.phone && (
                  <a href={`tel:${client.phone}`} className="flex items-center gap-1 hover:underline">
                    <Phone className="w-3 h-3" />
                    {client.phone}
                  </a>
                )}
                {client.email && (
                  <a href={`mailto:${client.email}`} className="flex items-center gap-1 hover:underline">
                    <Mail className="w-3 h-3" />
                    {client.email}
                  </a>
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
                <div className="text-xs text-muted-foreground mb-1">الرصيد الحالي</div>
                <div className={`text-xl font-bold tabular-nums ${stmt.endingBalance > 0 ? "text-status-danger-foreground" : "text-status-success-foreground"}`}>
                  {formatCurrency(Math.abs(stmt.endingBalance))}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {stmt.endingBalance > 0 ? "مدين للشركة" : stmt.endingBalance < 0 ? "دائن للشركة" : "متوازن"}
                </div>
                <InlineSparkline
                  values={stmt.movements.map((m) => Number(m.runningBalance ?? 0))}
                  tone={stmt.endingBalance > 0 ? "warning" : "success"}
                  testid="customer-360-balance-spark"
                />
              </CardContent>
            </Card>
            <Card className={overdueAmount > 0 ? "border-status-warning-foreground" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">إجمالي المتأخر</div>
                <div className={`text-xl font-bold tabular-nums ${overdueAmount > 0 ? "text-status-warning-foreground" : ""}`}>
                  {formatCurrency(overdueAmount)}
                </div>
                {seriousOverdue > 0 && (
                  <div className="text-[10px] text-status-danger-foreground mt-1">
                    منه {formatCurrency(seriousOverdue)} متأخر +60ي
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className={`${riskLevel === "high" ? "border-status-danger-foreground border-2" : riskLevel === "medium" ? "border-status-warning-foreground" : ""}`}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <ShieldAlert className={`w-3 h-3 ${riskColor}`} />
                  نقاط المخاطر
                </div>
                <div className={`text-xl font-bold tabular-nums ${riskColor}`}>
                  {riskScore}<span className="text-xs text-muted-foreground">/100</span>
                </div>
                <div className={`text-[10px] mt-1 ${riskColor}`}>
                  {riskLevel === "high" ? "مرتفع" : riskLevel === "medium" ? "متوسط" : "منخفض"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">حد ائتماني</div>
                <div className="text-xl font-bold tabular-nums">
                  {client.creditLimit ? formatCurrency(Number(client.creditLimit)) : "—"}
                </div>
                {client.creditLimit && stmt.endingBalance > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    استخدام: {((stmt.endingBalance / Number(client.creditLimit)) * 100).toFixed(0)}%
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className={advanceCredit > 0 ? "border-status-info-foreground" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">دفعات مقدمة متاحة</div>
                <div className={`text-xl font-bold tabular-nums ${advanceCredit > 0 ? "text-status-info-foreground" : ""}`}>
                  {formatCurrency(advanceCredit)}
                </div>
                {openAdvances.length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {openAdvances.length} دفعة قابلة للتطبيق
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Aging breakdown */}
          {aging && aging.total > 0 && (
            <Card className="print:border print:shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">أعمار الفواتير المفتوحة</CardTitle>
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

          {/* Recent activity */}
          {recentMovements.length > 0 && (
            <Card className="print:border print:shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  آخر 5 حركات
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-start py-2 px-2">التاريخ</th>
                      <th className="text-start py-2 px-2">المرجع</th>
                      <th className="text-start py-2 px-2">الوصف</th>
                      <th className="text-end py-2 px-2">مدين</th>
                      <th className="text-end py-2 px-2">دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentMovements.map(m => (
                      <tr key={`${m.movementType}-${m.id}`} className="border-b">
                        <td className="py-1.5 px-2 text-xs tabular-nums">{formatDateAr(m.date.split("T")[0])}</td>
                        <td className="py-1.5 px-2 font-mono text-xs">{m.ref}</td>
                        <td className="py-1.5 px-2 text-xs">{m.description}</td>
                        <td className="py-1.5 px-2 text-end tabular-nums">
                          {Number(m.debit) > 0 ? formatCurrency(Number(m.debit)) : "—"}
                        </td>
                        <td className="py-1.5 px-2 text-end tabular-nums">
                          {Number(m.credit) > 0 ? formatCurrency(Number(m.credit)) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Quick actions (hidden in print) */}
          <Card className="print:hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">إجراءات سريعة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Button asChild variant="outline" size="sm" className="w-full justify-start"><Link href={`/finance/customer-statement-print?clientId=${clientId}`}>
                    <Printer className="w-4 h-4 ml-1" />
                    كشف الحساب
                    <ExternalLink className="w-3 h-3 mr-auto" />
                  </Link></Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start"><Link href={`/finance/receivables?clientId=${clientId}`}>
                    <DollarSign className="w-4 h-4 ml-1" />
                    تسجيل دفعة
                    <ExternalLink className="w-3 h-3 mr-auto" />
                  </Link></Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start"><Link href={`/finance/customer-advances?view=grouped`}>
                    <FileText className="w-4 h-4 ml-1" />
                    دفعات مقدمة
                    <ExternalLink className="w-3 h-3 mr-auto" />
                  </Link></Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start"><Link href={`/finance/ar-collection-workbench`}>
                    <AlertTriangle className="w-4 h-4 ml-1" />
                    منضدة التحصيل
                    <ExternalLink className="w-3 h-3 mr-auto" />
                  </Link></Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start"><Link href={`/finance/entity-360?type=client&id=${clientId}`}>
                    <Users className="w-4 h-4 ml-1" />
                    Entity 360
                    <ExternalLink className="w-3 h-3 mr-auto" />
                  </Link></Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start"><Link href={`/finance/customer-risk`}>
                    <ShieldAlert className="w-4 h-4 ml-1" />
                    تحليل المخاطر
                    <ExternalLink className="w-3 h-3 mr-auto" />
                  </Link></Button>
              </div>
            </CardContent>
          </Card>

          {/* Footer for print */}
          <div className="text-[10px] text-muted-foreground border-t pt-2 hidden print:block">
            تقرير آلي من نظام غيث ERP — {formatDateAr(today)}
          </div>
        </div>
      )}
    </PageShell>
  );
}
