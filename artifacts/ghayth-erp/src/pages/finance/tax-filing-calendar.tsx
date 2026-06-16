/**
 * GAP_MATRIX P2 — Pure-frontend tax-filing calendar. Static content with
 * Saudi fiscal year deadlines; makes no API calls. Intentional.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  Calendar, AlertTriangle, CheckCircle2, Receipt, Building2,
  Banknote, Users, FileCheck2, ChevronRight, Info,
} from "lucide-react";
import { formatDateAr, todayLocal, currentYearRiyadh } from "@/lib/formatters";

/**
 * Saudi Tax Filings Calendar
 *
 * Annual calendar of statutory tax filing deadlines in Saudi Arabia:
 *   - VAT monthly (filed by month-end of following month)
 *   - VAT quarterly (filed by month-end of following month after quarter end)
 *   - WHT monthly (filed by 10th of following month)
 *   - ZAKAT annual (filed by April 30 for prior year)
 *   - Income Tax annual (filed by April 30)
 *   - GOSI monthly (paid by 15th of following month)
 *
 * Pure-frontend — no backend (deadlines are public law). Highlights
 * overdue, today, this-week, this-month.
 */

interface Filing {
  id: string;
  type: "VAT_M" | "VAT_Q" | "WHT_M" | "ZAKAT_Y" | "INCOME_TAX_Y" | "GOSI_M";
  label: string;
  periodLabel: string;
  deadline: string; // YYYY-MM-DD
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function fixedDayOfMonth(year: number, month: number, day: number): string {
  // month 1-based
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function diffDays(deadline: string, today: string): number {
  const a = new Date(deadline + "T00:00:00Z").getTime();
  const b = new Date(today + "T00:00:00Z").getTime();
  return Math.round((a - b) / 86400000);
}

function buildFilings(year: number, vatFrequency: "monthly" | "quarterly"): Filing[] {
  const out: Filing[] = [];

  if (vatFrequency === "monthly") {
    // VAT monthly — for each of 12 months, deadline = last day of next month
    for (let m = 1; m <= 12; m++) {
      const dlYear = m === 12 ? year + 1 : year;
      const dlMonth = m === 12 ? 1 : m + 1;
      out.push({
        id: `vat-m-${year}-${m}`,
        type: "VAT_M",
        label: "إقرار ضريبة القيمة المضافة الشهري",
        periodLabel: `${year}-${String(m).padStart(2, "0")}`,
        deadline: lastDayOfMonth(dlYear, dlMonth),
        href: "/finance/vat-filing-readiness",
        icon: Receipt,
        color: "text-status-info-foreground",
      });
    }
  } else {
    // VAT quarterly — for each of 4 quarters, deadline = last day of month after quarter end
    for (let q = 1; q <= 4; q++) {
      const endMonth = q * 3;
      const dlYear = endMonth === 12 ? year + 1 : year;
      const dlMonth = endMonth === 12 ? 1 : endMonth + 1;
      out.push({
        id: `vat-q-${year}-${q}`,
        type: "VAT_Q",
        label: `إقرار ضريبة القيمة المضافة Q${q}`,
        periodLabel: `${year} Q${q}`,
        deadline: lastDayOfMonth(dlYear, dlMonth),
        href: "/finance/vat-filing-readiness",
        icon: Receipt,
        color: "text-status-info-foreground",
      });
    }
  }

  // WHT monthly — for each of 12 months, deadline = 10th of next month
  for (let m = 1; m <= 12; m++) {
    const dlYear = m === 12 ? year + 1 : year;
    const dlMonth = m === 12 ? 1 : m + 1;
    out.push({
      id: `wht-${year}-${m}`,
      type: "WHT_M",
      label: "إقرار ضريبة الاستقطاع",
      periodLabel: `${year}-${String(m).padStart(2, "0")}`,
      deadline: fixedDayOfMonth(dlYear, dlMonth, 10),
      href: "/finance/reports/wht-summary",
      icon: FileCheck2,
      color: "text-status-warning-foreground",
    });
  }

  // GOSI monthly — for each of 12 months, paid by 15th of next month
  for (let m = 1; m <= 12; m++) {
    const dlYear = m === 12 ? year + 1 : year;
    const dlMonth = m === 12 ? 1 : m + 1;
    out.push({
      id: `gosi-${year}-${m}`,
      type: "GOSI_M",
      label: "اشتراك التأمينات الاجتماعية",
      periodLabel: `${year}-${String(m).padStart(2, "0")}`,
      deadline: fixedDayOfMonth(dlYear, dlMonth, 15),
      href: "/finance/expenses",
      icon: Users,
      color: "text-purple-500",
    });
  }

  // ZAKAT annual — for prior year, due April 30 of current year
  out.push({
    id: `zakat-${year - 1}`,
    type: "ZAKAT_Y",
    label: "إقرار الزكاة السنوي",
    periodLabel: `سنة ${year - 1}`,
    deadline: fixedDayOfMonth(year, 4, 30),
    href: "/finance/reports/zatca",
    icon: Building2,
    color: "text-status-success-foreground",
  });

  // Income Tax annual — same deadline
  out.push({
    id: `income-tax-${year - 1}`,
    type: "INCOME_TAX_Y",
    label: "إقرار ضريبة الدخل السنوي",
    periodLabel: `سنة ${year - 1}`,
    deadline: fixedDayOfMonth(year, 4, 30),
    href: "/finance/reports/zatca",
    icon: Building2,
    color: "text-status-danger-foreground",
  });

  return out.sort((a, b) => a.deadline.localeCompare(b.deadline));
}

const URGENCY_BY_DAYS = (days: number) => {
  if (days < 0) return { label: "متأخر", className: "border-status-danger-foreground bg-status-danger-surface", textColor: "text-status-danger-foreground" };
  if (days === 0) return { label: "اليوم", className: "border-status-danger-foreground", textColor: "text-status-danger-foreground" };
  if (days <= 7) return { label: "هذا الأسبوع", className: "border-status-warning-foreground", textColor: "text-status-warning-foreground" };
  if (days <= 30) return { label: "هذا الشهر", className: "border-status-info-foreground", textColor: "text-status-info-foreground" };
  return { label: "قادم", className: "border-border", textColor: "text-muted-foreground" };
};

export default function TaxFilingCalendarPage() {
  const today = todayLocal();
  const [year, setYear] = useState(currentYearRiyadh());
  const [vatFrequency, setVatFrequency] = useState<"monthly" | "quarterly">("quarterly");
  const [filter, setFilter] = useState<"upcoming" | "all" | "overdue">("upcoming");

  const allFilings = useMemo(() => buildFilings(year, vatFrequency), [year, vatFrequency]);

  const annotated = useMemo(() => allFilings.map(f => ({
    ...f,
    daysToDeadline: diffDays(f.deadline, today),
  })), [allFilings, today]);

  const filtered = useMemo(() => {
    if (filter === "overdue") return annotated.filter(f => f.daysToDeadline < 0);
    if (filter === "upcoming") return annotated.filter(f => f.daysToDeadline >= -7 && f.daysToDeadline <= 60);
    return annotated;
  }, [annotated, filter]);

  const stats = useMemo(() => ({
    overdue: annotated.filter(f => f.daysToDeadline < 0).length,
    thisWeek: annotated.filter(f => f.daysToDeadline >= 0 && f.daysToDeadline <= 7).length,
    thisMonth: annotated.filter(f => f.daysToDeadline >= 0 && f.daysToDeadline <= 30).length,
    total: annotated.length,
  }), [annotated]);

  // Group by month for display
  const grouped = useMemo(() => {
    const map = new Map<string, typeof annotated>();
    for (const f of filtered) {
      const key = f.deadline.slice(0, 7); // YYYY-MM
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <PageShell
      title="تقويم الإقرارات الضريبية"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "تقويم الإقرارات الضريبية" },
      ]}
      subtitle="مواعيد إقرارات ZATCA + GOSI خلال السنة — لا تفوّت أي موعد"
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/vat-filing-readiness">
              <FileCheck2 className="h-3.5 w-3.5 ml-1" />
              جاهزية VAT
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/wht-filing-workbench">
              <Receipt className="h-3.5 w-3.5 ml-1" />
              منضدة WHT
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/reports/zatca">
              <Building2 className="h-3.5 w-3.5 ml-1" />
              تقارير ZATCA
            </Link></Button>
          <PrintButton
            entityType="report_finance_tax_filing_calendar"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: "تقويم الإقرارات الضريبية", total: filtered.length },
              items: filtered.map((f) => ({
                "النوع": f.label,
                "الفترة": f.periodLabel,
                "الموعد النهائي": f.deadline,
                "أيام متبقية": diffDays(f.deadline, todayLocal()),
              })),
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">السنة</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border rounded px-3 py-1.5 text-sm bg-background"
            >
              {[currentYearRiyadh() - 1, currentYearRiyadh(), currentYearRiyadh() + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">نمط VAT</label>
            <div className="flex gap-1">
              <Button variant={vatFrequency === "monthly" ? "default" : "outline"} size="sm" onClick={() => setVatFrequency("monthly")}>شهري</Button>
              <Button variant={vatFrequency === "quarterly" ? "default" : "outline"} size="sm" onClick={() => setVatFrequency("quarterly")}>ربعي</Button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">العرض</label>
            <div className="flex gap-1">
              <Button variant={filter === "upcoming" ? "default" : "outline"} size="sm" onClick={() => setFilter("upcoming")}>القادم</Button>
              <Button variant={filter === "overdue" ? "default" : "outline"} size="sm" onClick={() => setFilter("overdue")}>المتأخر</Button>
              <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>الكل</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card className={stats.overdue > 0 ? "border-status-danger-foreground border-2" : ""}>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-status-danger-foreground" />
              متأخر
            </div>
            <div className={`text-2xl font-bold tabular-nums ${stats.overdue > 0 ? "text-status-danger-foreground" : ""}`}>
              {stats.overdue}
            </div>
          </CardContent>
        </Card>
        <Card className={stats.thisWeek > 0 ? "border-status-warning-foreground border-2" : ""}>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-status-warning-foreground" />
              خلال 7 أيام
            </div>
            <div className={`text-2xl font-bold tabular-nums ${stats.thisWeek > 0 ? "text-status-warning-foreground" : ""}`}>
              {stats.thisWeek}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-status-info-foreground" />
              خلال 30 يوم
            </div>
            <div className="text-2xl font-bold tabular-nums">{stats.thisMonth}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Receipt className="w-3 h-3" />
              إجمالي إقرارات السنة
            </div>
            <div className="text-2xl font-bold tabular-nums">{stats.total}</div>
          </CardContent>
        </Card>
      </div>

      {/* Reference card */}
      <Card className="mb-4 bg-status-info-surface border-status-info-foreground">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-2 text-xs">
            <Info className="w-4 h-4 text-status-info-foreground shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-1">المواعيد القانونية:</div>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>• <strong>القيمة المضافة (شهري)</strong>: آخر يوم من الشهر التالي للفترة الضريبية</li>
                <li>• <strong>القيمة المضافة (ربعي)</strong>: آخر يوم من الشهر التالي لنهاية الربع</li>
                <li>• <strong>ضريبة الاستقطاع (WHT)</strong>: اليوم 10 من الشهر التالي</li>
                <li>• <strong>التأمينات الاجتماعية (GOSI)</strong>: اليوم 15 من الشهر التالي</li>
                <li>• <strong>الزكاة وضريبة الدخل</strong>: 30 أبريل من السنة التالية</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filings grouped by month */}
      {grouped.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-status-success-foreground" />
            لا إقرارات في الفلتر الحالي ✓
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {grouped.map(([monthKey, filings]) => (
            <Card key={monthKey}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{monthKey}</span>
                  <Badge variant="outline">{filings.length} إقرار</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filings.map(f => {
                    const u = URGENCY_BY_DAYS(f.daysToDeadline);
                    const Icon = f.icon;
                    return (
                      <Link key={f.id} href={f.href}>
                        <div className={`border rounded p-3 ${u.className} hover:bg-muted/30 cursor-pointer`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <Icon className={`w-5 h-5 ${f.color} shrink-0`} />
                              <div className="min-w-0">
                                <div className="font-semibold text-sm">{f.label}</div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                  الفترة: {f.periodLabel} • الموعد: {formatDateAr(f.deadline)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-end">
                                <div className={`font-bold text-sm ${u.textColor}`}>
                                  {f.daysToDeadline < 0
                                    ? `متأخر ${Math.abs(f.daysToDeadline)} يوم`
                                    : f.daysToDeadline === 0
                                    ? "اليوم!"
                                    : `بعد ${f.daysToDeadline} يوم`}
                                </div>
                                <div className="text-[10px] text-muted-foreground">{u.label}</div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
