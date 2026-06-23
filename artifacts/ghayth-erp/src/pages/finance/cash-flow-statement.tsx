import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell, DataTable } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateAr, currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";
import {
  TrendingUp, TrendingDown, Download, ChevronRight,
  Factory, Building2, Landmark, ArrowUpCircle, ArrowDownCircle, Equal,
  Calendar, Activity, Banknote,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";

/**
 * Cash Flow Statement — Direct Method
 *
 * Formal cash flow report classified into Operating / Investing / Financing
 * sections per IAS 7 direct-method presentation. Every JE that touched a cash
 * account in the period is bucketed by its dominant counter-account class.
 *
 * Endpoint: GET /finance/reports/cash-flow?startDate&endDate
 */

interface CFItem {
  id: number;
  ref: string;
  description: string;
  date: string;
  inflow: number;
  outflow: number;
  counterAccount: string | null;
  counterType: string | null;
}

interface SectionData {
  inflows: number;
  outflows: number;
  net: number;
  items: CFItem[];
}

interface CashFlowResp {
  period: { from: string; to: string };
  openingCash: number;
  closingCash: number;
  netChange: number;
  sections: {
    operating: SectionData;
    investing: SectionData;
    financing: SectionData;
  };
  summary: {
    totalInflow: number;
    totalOutflow: number;
    netCashFlow: number;
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export default function CashFlowStatementPage() {
  const [year, setYear] = useState<number>(currentYearRiyadh());
  const [month, setMonth] = useState<string>(currentMonthPaddedRiyadh());
  const [mode, setMode] = useState<"month" | "ytd" | "quarter">("month");

  const { startDate, endDate, label } = useMemo(() => {
    const m = Number(month);
    if (mode === "ytd") {
      return {
        startDate: `${year}-01-01`,
        endDate: `${year}-${month}-${String(daysInMonth(year, m)).padStart(2, "0")}`,
        label: `${MONTHS_AR[m - 1]} ${year} حتى تاريخه`,
      };
    }
    if (mode === "quarter") {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      const qEnd = qStart + 2;
      return {
        startDate: `${year}-${String(qStart).padStart(2, "0")}-01`,
        endDate: `${year}-${String(qEnd).padStart(2, "0")}-${String(daysInMonth(year, qEnd)).padStart(2, "0")}`,
        label: `الربع ${Math.floor((m - 1) / 3) + 1} - ${year}`,
      };
    }
    return {
      startDate: `${year}-${month}-01`,
      endDate: `${year}-${month}-${String(daysInMonth(year, m)).padStart(2, "0")}`,
      label: `${MONTHS_AR[m - 1]} ${year}`,
    };
  }, [year, month, mode]);

  const { data, isLoading } = useApiQuery<CashFlowResp>(
    ["cash-flow-statement", String(year), month, mode],
    `/finance/reports/cash-flow?startDate=${startDate}&endDate=${endDate}`,
  );

  const exportCSV = () => {
    if (!data) return;
    const rows: string[] = [];
    rows.push("القسم,التاريخ,المرجع,الوصف,الحساب المقابل,تدفق داخل,تدفق خارج");
    const writeSection = (name: string, sec: SectionData) => {
      for (const it of sec.items) {
        rows.push([
          name,
          it.date.split("T")[0],
          it.ref ?? "",
          (it.description ?? "").replace(/,/g, "،"),
          (it.counterAccount ?? "").replace(/,/g, "،"),
          it.inflow > 0 ? it.inflow.toFixed(2) : "",
          it.outflow > 0 ? it.outflow.toFixed(2) : "",
        ].join(","));
      }
    };
    writeSection("تشغيلية", data.sections.operating);
    writeSection("استثمارية", data.sections.investing);
    writeSection("تمويلية", data.sections.financing);
    rows.push("");
    rows.push(`الرصيد الافتتاحي,,,,,${data.openingCash.toFixed(2)},`);
    rows.push(`صافي التغير,,,,,${data.netChange.toFixed(2)},`);
    rows.push(`الرصيد الختامي,,,,,${data.closingCash.toFixed(2)},`);

    // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
    // Routed through unified export helper for audit + letterhead.
    {
      const _allLines = rows;
      const _headers = (_allLines[0] ?? "").split(",");
      const _rows = _allLines.slice(1).map((line) => {
        const parts = line.split(",");
        const obj: Record<string, string> = {};
        _headers.forEach((h, i) => { obj[h] = parts[i] ?? ""; });
        return obj;
      });
      void exportRowsToCsv({
        entityType: "report_cash_flow_statement",
        title: String(`cash-flow-statement-${startDate}_${endDate}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="قائمة التدفقات النقدية"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "قائمة التدفقات النقدية" },
      ]}
      subtitle={`الطريقة المباشرة — ${label}`}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/cashflow">
              <Activity className="h-3.5 w-3.5 ml-1" />
              لوحة التدفقات
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/cash-13week">
              <Calendar className="h-3.5 w-3.5 ml-1" />
              توقع 13 أسبوع
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/cash-position-calculator">
              <Banknote className="h-3.5 w-3.5 ml-1" />
              مركز السيولة
            </Link></Button>
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">النطاق</label>
              <div className="flex gap-1">
                {[
                  { id: "month", label: "شهر" },
                  { id: "quarter", label: "ربع" },
                  { id: "ytd", label: "حتى تاريخه" },
                ].map(opt => (
                  <Button
                    key={opt.id}
                    variant={mode === opt.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMode(opt.id as "month" | "ytd" | "quarter")}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">السنة</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border rounded px-3 py-1.5 text-sm bg-background"
              >
                {[currentYearRiyadh(), currentYearRiyadh() - 1, currentYearRiyadh() - 2].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الشهر</label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm bg-background"
              >
                {MONTHS_AR.map((m, i) => (
                  <option key={i} value={String(i + 1).padStart(2, "0")}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
              <Download className="w-4 h-4 ml-1" />
              تصدير CSV
            </Button>
            <PrintButton
              entityType="report_cash_flow_statement"
              entityId="all"
              payload={{ entity: { title: "قائمة التدفقات النقدية" }, items: [] }}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : !data ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد بيانات</CardContent></Card>
      ) : (
        <>
          {/* Top summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">الرصيد الافتتاحي</div>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(data.openingCash)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{formatDateAr(data.period.from)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <ArrowUpCircle className="w-3 h-3 text-status-success-foreground" />
                  إجمالي الداخل
                </div>
                <div className="text-2xl font-bold tabular-nums text-status-success-foreground">
                  {formatCurrency(data.summary.totalInflow)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <ArrowDownCircle className="w-3 h-3 text-status-danger-foreground" />
                  إجمالي الخارج
                </div>
                <div className="text-2xl font-bold tabular-nums text-status-danger-foreground">
                  {formatCurrency(data.summary.totalOutflow)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">الرصيد الختامي</div>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(data.closingCash)}</div>
                <div className="text-[11px] mt-1 flex items-center gap-1">
                  {data.netChange >= 0 ? (
                    <><TrendingUp className="w-3 h-3 text-status-success-foreground" />
                      <span className="text-status-success-foreground">+{formatCurrency(data.netChange)}</span></>
                  ) : (
                    <><TrendingDown className="w-3 h-3 text-status-danger-foreground" />
                      <span className="text-status-danger-foreground">{formatCurrency(data.netChange)}</span></>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section bars */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">الأقسام الثلاثة</CardTitle>
            </CardHeader>
            <CardContent>
              <SectionBar
                title="أنشطة تشغيلية"
                icon={Factory}
                section={data.sections.operating}
                color="bg-status-success-foreground"
              />
              <SectionBar
                title="أنشطة استثمارية"
                icon={Building2}
                section={data.sections.investing}
                color="bg-status-info-foreground"
              />
              <SectionBar
                title="أنشطة تمويلية"
                icon={Landmark}
                section={data.sections.financing}
                color="bg-status-warning-foreground"
              />
              <div className="border-t pt-3 mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Equal className="w-4 h-4" />
                  <span className="font-semibold">صافي التغير في النقد</span>
                </div>
                <div className={`text-xl font-bold tabular-nums ${data.netChange >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                  {data.netChange >= 0 ? "+" : ""}{formatCurrency(data.netChange)}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section detail tables */}
          <SectionDetail
            title="أنشطة تشغيلية"
            icon={Factory}
            section={data.sections.operating}
            description="إيرادات، مصروفات، مدينون، دائنون، ضريبة قيمة مضافة، مخزون"
          />
          <SectionDetail
            title="أنشطة استثمارية"
            icon={Building2}
            section={data.sections.investing}
            description="شراء/بيع أصول ثابتة، عقارات، استثمارات طويلة الأجل"
          />
          <SectionDetail
            title="أنشطة تمويلية"
            icon={Landmark}
            section={data.sections.financing}
            description="حقوق ملكية، توزيعات أرباح، قروض طويلة الأجل، سندات"
          />
        </>
      )}
    </PageShell>
  );
}

function SectionBar({
  title, icon: Icon, section, color,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  section: SectionData;
  color: string;
}) {
  const gross = section.inflows + section.outflows;
  const inPct = gross > 0 ? (section.inflows / gross) * 100 : 0;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-sm">{title}</span>
          <Badge variant="outline" className="text-[10px]">{section.items.length} حركة</Badge>
        </div>
        <div className={`font-semibold tabular-nums ${section.net >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
          {section.net >= 0 ? "+" : ""}{formatCurrency(section.net)}
        </div>
      </div>
      <div className="flex h-6 rounded overflow-hidden text-[10px] text-white">
        {section.inflows > 0 && (
          <div
            className={`${color} flex items-center justify-center px-2`}
            style={{ width: `${Math.max(inPct, 8)}%` }}
            title={`داخل ${formatCurrency(section.inflows)}`}
          >
            +{formatCurrency(section.inflows)}
          </div>
        )}
        {section.outflows > 0 && (
          <div
            className="bg-status-danger-foreground flex items-center justify-center px-2"
            style={{ width: `${Math.max(100 - inPct, 8)}%` }}
            title={`خارج ${formatCurrency(section.outflows)}`}
          >
            -{formatCurrency(section.outflows)}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionDetail({
  title, icon: Icon, section, description,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  section: SectionData;
  description: string;
}) {
  if (section.items.length === 0) {
    return (
      <Card className="mb-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="w-4 h-4" />
            {title}
            <span className="text-xs font-normal text-muted-foreground">— لا حركات</span>
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const sorted = [...section.items].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return (
    <Card className="mb-3">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Icon className="w-4 h-4" />
              {title}
            </CardTitle>
            <div className="text-xs text-muted-foreground mt-1">{description}</div>
          </div>
          <div className="text-end">
            <div className={`text-lg font-bold tabular-nums ${section.net >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
              {section.net >= 0 ? "+" : ""}{formatCurrency(section.net)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {formatCurrency(section.inflows)} − {formatCurrency(section.outflows)}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <DataTable<CFItem>
          noToolbar
          pageSize={0}
          rowKey={(item) => item.id}
          rowClassName={() => "hover:bg-muted/30"}
          data={sorted}
          columns={[
            { key: "date", header: "التاريخ", sortable: false, className: "text-xs tabular-nums whitespace-nowrap", render: (item) => formatDateAr(item.date.split("T")[0]), footer: () => "الإجمالي" },
            { key: "ref", header: "المرجع", sortable: false, className: "text-xs font-mono", render: (item) => item.ref },
            { key: "description", header: "الوصف", sortable: false, className: "text-xs max-w-xs truncate", render: (item) => <span title={item.description}>{item.description}</span> },
            { key: "counterAccount", header: "الحساب المقابل", sortable: false, className: "text-xs text-muted-foreground max-w-xs truncate", render: (item) => <span title={item.counterAccount ?? ""}>{item.counterAccount ?? "—"}</span> },
            {
              key: "inflow", header: "داخل", sortable: false, align: "end", className: "tabular-nums",
              render: (item) => item.inflow > 0 ? <span className="text-status-success-foreground">+{formatCurrency(item.inflow)}</span> : "—",
              footer: () => <span className="text-status-success-foreground">+{formatCurrency(section.inflows)}</span>,
            },
            {
              key: "outflow", header: "خارج", sortable: false, align: "end", className: "tabular-nums",
              render: (item) => item.outflow > 0 ? <span className="text-status-danger-foreground">-{formatCurrency(item.outflow)}</span> : "—",
              footer: () => <span className="text-status-danger-foreground">-{formatCurrency(section.outflows)}</span>,
            },
            {
              key: "_actions", header: "", sortable: false, width: "2rem",
              render: (item) => <Button asChild variant="ghost" size="icon" title="التالي" className="h-7 w-7"><Link href={`/finance/journal/${item.id}`}><ChevronRight className="w-4 h-4" /></Link></Button>,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
