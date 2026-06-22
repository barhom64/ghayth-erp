import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Search, AlertTriangle, ChevronRight, ExternalLink,
  ScaleIcon, DollarSign, Clock, RotateCcw, Copy, Layers,
  Sparkles, ChevronDown,
} from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

/**
 * GL Anomaly Detector
 *
 * Scans recent JEs for patterns that might warrant a closer look:
 *   - Unbalanced (should never happen — backend invariant)
 *   - Round-number entries (could be estimates/placeholders)
 *   - Very large amounts (top 10 by value)
 *   - High line count (>10 lines — usually monthly close adjustments)
 *   - Outside business hours posting (8pm-7am Riyadh)
 *   - Duplicate refs (same ref reused)
 *
 * Pure-frontend analysis on the latest 200 JEs from /finance/journal.
 * Designed for periodic audit review, not real-time anomaly enforcement.
 */

interface JeLine {
  accountCode: string;
  debit: number | string;
  credit: number | string;
  description?: string;
}
interface Je {
  id: number;
  ref: string;
  description: string;
  status: string;
  createdAt: string;
  reversalOfId: number | null;
  reversedById: number | null;
  operationType?: string;
  totalDebit: number | string;
  totalCredit: number | string;
  lines: JeLine[];
}
interface ListResp { data: Je[]; total: number; }

type AnomalyType = "unbalanced" | "round" | "large" | "complex" | "after_hours" | "dup_ref";

const ANOMALY_DEFS: Record<AnomalyType, { label: string; description: string; icon: React.ComponentType<{ className?: string }>; color: string; severity: "high" | "medium" | "low" }> = {
  unbalanced: { label: "غير متوازن", description: "مدين ≠ دائن — يجب ألا يحدث", icon: ScaleIcon, color: "text-status-danger-foreground", severity: "high" },
  round: { label: "أرقام مدوّرة", description: "مبلغ مدوّر لـ 1000 أو أكبر — قد يكون تقدير", icon: DollarSign, color: "text-status-warning-foreground", severity: "low" },
  large: { label: "أكبر 10 قيود", description: "ترتيب حسب القيمة — راجع كل واحد", icon: DollarSign, color: "text-status-info-foreground", severity: "medium" },
  complex: { label: "قيود متعددة الأسطر", description: "أكثر من 10 سطر — عادة قيود إقفال شهري", icon: Layers, color: "text-status-info-foreground", severity: "low" },
  after_hours: { label: "خارج ساعات العمل", description: "تم تسجيل بعد 8م أو قبل 7ص بتوقيت الرياض", icon: Clock, color: "text-status-warning-foreground", severity: "medium" },
  dup_ref: { label: "مرجع مكرر", description: "نفس المرجع مستخدم في قيدين أو أكثر", icon: Copy, color: "text-status-danger-foreground", severity: "high" },
};

function isRound(amount: number): boolean {
  if (amount < 1000) return false;
  return amount % 1000 === 0;
}

function getRiyadhHour(iso: string): number {
  // ISO is UTC. Riyadh = UTC+3. So hour Riyadh = (UTC hour + 3) % 24.
  const d = new Date(iso);
  const utcHour = d.getUTCHours();
  return (utcHour + 3) % 24;
}

function isAfterHours(iso: string): boolean {
  const h = getRiyadhHour(iso);
  return h < 7 || h >= 20;
}

export default function GlAnomalyDetectorPage() {
  const [filter, setFilter] = useState<AnomalyType | "all">("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data, isLoading } = useApiQuery<ListResp>(
    ["gl-anomaly-list"],
    `/finance/journal`,
  );

  const annotated = useMemo(() => {
    if (!data?.data) return [];
    const list = data.data;
    // Build duplicate ref index
    const refCount = new Map<string, number>();
    for (const je of list) {
      refCount.set(je.ref, (refCount.get(je.ref) ?? 0) + 1);
    }
    const dupRefs = new Set(
      Array.from(refCount.entries()).filter(([_, c]) => c > 1).map(([r]) => r)
    );
    // Sort by amount for "large" tagging
    const byAmount = [...list].sort((a, b) => Number(b.totalDebit) - Number(a.totalDebit));
    const top10 = new Set(byAmount.slice(0, 10).map(j => j.id));

    return list.map(je => {
      const totalDebit = Number(je.totalDebit);
      const totalCredit = Number(je.totalCredit);
      const tags: AnomalyType[] = [];
      if (Math.abs(totalDebit - totalCredit) > 0.01) tags.push("unbalanced");
      if (isRound(totalDebit)) tags.push("round");
      if (top10.has(je.id)) tags.push("large");
      if (je.lines.length > 10) tags.push("complex");
      if (isAfterHours(je.createdAt)) tags.push("after_hours");
      if (dupRefs.has(je.ref)) tags.push("dup_ref");
      return { ...je, tags };
    });
  }, [data]);

  const filtered = useMemo(() => {
    if (filter === "all") return annotated.filter(j => j.tags.length > 0);
    return annotated.filter(j => j.tags.includes(filter));
  }, [annotated, filter]);

  const counts = useMemo(() => {
    const out: Record<AnomalyType, number> = {
      unbalanced: 0, round: 0, large: 0, complex: 0, after_hours: 0, dup_ref: 0,
    };
    for (const je of annotated) {
      for (const t of je.tags) out[t] += 1;
    }
    return out;
  }, [annotated]);

  const totalFlagged = annotated.filter(j => j.tags.length > 0).length;

  const toggle = (id: number) => {
    setExpanded(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <PageShell
      title="كاشف الشذوذ في القيود"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "كاشف الشذوذ في القيود" },
      ]}
      subtitle="فحص آلي للقيود حسب 6 أنماط للمراجعة الدورية"
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/gl-health">
              <Sparkles className="h-3.5 w-3.5 ml-1" />
              صحة النظام
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/reports/gl-integrity-gaps">
              <AlertTriangle className="h-3.5 w-3.5 ml-1" />
              فجوات السلامة
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/trial-balance-drilldown">
              <ScaleIcon className="h-3.5 w-3.5 ml-1" />
              ميزان المراجعة
            </Link></Button>
          <PrintButton
            entityType="report_finance_gl_anomaly"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: "كاشف الشذوذ في القيود", total: filtered.length },
              items: filtered.map((j: any) => ({
                "المرجع": j.ref || `#${j.id}`,
                "الوصف": j.description || "—",
                "التاريخ": j.createdAt || "—",
                "المدين": Number(j.totalDebit || 0),
                "الدائن": Number(j.totalCredit || 0),
                "السطور": j.lines?.length ?? 0,
                "الأنماط": (j.tags || []).map((t: AnomalyType) => ANOMALY_DEFS[t]?.label || t).join("، "),
              })),
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      {isLoading ? (
        <LoadingSpinner />
      ) : !data ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد بيانات</CardContent></Card>
      ) : (
        <>
          {/* Summary */}
          <Card className="mb-4">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-status-info-foreground" />
                  <span className="text-sm">
                    تم فحص <strong>{annotated.length}</strong> قيد —
                    تم تمييز <strong className={totalFlagged > 0 ? "text-status-warning-foreground" : "text-status-success-foreground"}>{totalFlagged}</strong> للمراجعة
                  </span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {((totalFlagged / Math.max(annotated.length, 1)) * 100).toFixed(1)}%
                </Badge>
              </div>

              {/* Counts grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                <CountTile
                  type="all"
                  label="الكل"
                  count={totalFlagged}
                  activeFilter={filter}
                  onClick={() => setFilter("all")}
                  iconColor="text-status-info-foreground"
                />
                {(Object.keys(ANOMALY_DEFS) as AnomalyType[]).map(t => {
                  const def = ANOMALY_DEFS[t];
                  return (
                    <CountTile
                      key={t}
                      type={t}
                      label={def.label}
                      count={counts[t]}
                      activeFilter={filter}
                      onClick={() => setFilter(t)}
                      iconColor={def.color}
                      Icon={def.icon}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Filter context */}
          {filter !== "all" && (
            <Card className="mb-4 border-status-info-foreground">
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Search className="w-4 h-4" />
                  <span>عرض النوع:</span>
                  <Badge variant="outline" className={ANOMALY_DEFS[filter].color}>
                    {ANOMALY_DEFS[filter].label}
                  </Badge>
                  <span className="text-muted-foreground text-xs">— {ANOMALY_DEFS[filter].description}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setFilter("all")}>
                  <RotateCcw className="w-3 h-3 ml-1" />
                  إعادة تعيين
                </Button>
              </CardContent>
            </Card>
          )}

          {/* JE list */}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                لا قيود مطابقة — السجل نظيف ✨
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(je => {
                const isOpen = expanded.has(je.id);
                const totalDebit = Number(je.totalDebit);
                const totalCredit = Number(je.totalCredit);
                return (
                  <Card key={je.id}>
                    <CardHeader
                      className="pb-3 cursor-pointer hover:bg-muted/30"
                      onClick={() => toggle(je.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <code className="font-mono text-sm">{je.ref}</code>
                              <span className="text-xs text-muted-foreground">
                                {formatDateAr(je.createdAt.split("T")[0])}
                              </span>
                              <Badge variant="outline" className="text-[10px]">{je.status}</Badge>
                            </div>
                            <div className="text-sm truncate mt-0.5">{je.description}</div>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {je.tags.map(t => {
                                const def = ANOMALY_DEFS[t];
                                const Icon = def.icon;
                                return (
                                  <Badge key={t} variant="outline" className={`text-[10px] ${def.color}`}>
                                    <Icon className="w-2.5 h-2.5 ml-1" />
                                    {def.label}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="text-end shrink-0">
                          <div className="font-bold tabular-nums">{formatCurrency(totalDebit)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {je.lines.length} سطر • {getRiyadhHour(je.createdAt).toString().padStart(2, "0")}:00 رياض
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    {isOpen && (
                      <CardContent className="pt-0">
                        <DataTable
                          noToolbar
                          pageSize={0}
                          className="text-xs"
                          data={je.lines}
                          rowKey={(_l, i) => i}
                          columns={[
                            {
                              key: "accountCode", header: "الحساب", className: "font-mono",
                              render: (l) => l.accountCode,
                            },
                            {
                              key: "description", header: "الوصف", className: "truncate max-w-xs",
                              render: (l) => l.description ?? "—",
                              exportValue: (l) => l.description ?? "",
                            },
                            {
                              key: "debit", header: "مدين", align: "end", className: "tabular-nums",
                              render: (l) => (Number(l.debit) > 0 ? formatCurrency(Number(l.debit)) : "—"),
                              exportValue: (l) => Number(l.debit),
                            },
                            {
                              key: "credit", header: "دائن", align: "end", className: "tabular-nums",
                              render: (l) => (Number(l.credit) > 0 ? formatCurrency(Number(l.credit)) : "—"),
                              exportValue: (l) => Number(l.credit),
                            },
                          ] satisfies DataTableColumn<JeLine>[]}
                          renderGrandTotal={() => (
                            <>
                              <tr className="font-semibold">
                                <td colSpan={2} className="py-1 px-2">الإجمالي</td>
                                <td className="py-1 px-2 text-end tabular-nums">{formatCurrency(totalDebit)}</td>
                                <td className="py-1 px-2 text-end tabular-nums">{formatCurrency(totalCredit)}</td>
                              </tr>
                              {Math.abs(totalDebit - totalCredit) > 0.01 && (
                                <tr className="text-status-danger-foreground font-semibold">
                                  <td colSpan={2} className="py-1 px-2">الفرق</td>
                                  <td colSpan={2} className="py-1 px-2 text-end tabular-nums">
                                    {formatCurrency(Math.abs(totalDebit - totalCredit))}
                                  </td>
                                </tr>
                              )}
                            </>
                          )}
                        />
                        <div className="flex justify-end mt-3">
                          <Button asChild variant="outline" size="sm"><Link href={`/finance/journal/${je.id}`}>
                              <ExternalLink className="w-3 h-3 ml-1" />
                              فتح القيد
                            </Link></Button>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

function CountTile({
  type, label, count, activeFilter, onClick, iconColor, Icon,
}: {
  type: AnomalyType | "all";
  label: string;
  count: number;
  activeFilter: AnomalyType | "all";
  onClick: () => void;
  iconColor: string;
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  const active = activeFilter === type;
  return (
    <button
      onClick={onClick}
      className={`border rounded p-2 text-start hover:bg-muted/30 transition ${active ? "border-status-info-foreground bg-status-info-surface" : ""}`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        {Icon && <Icon className={`w-3 h-3 ${iconColor}`} />}
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className={`text-xl font-bold tabular-nums ${count > 0 ? iconColor : "text-muted-foreground"}`}>
        {count}
      </div>
    </button>
  );
}
