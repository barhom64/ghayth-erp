import { useMemo } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber, formatDateAr } from "@/lib/formatters";
import {
  Inbox, FileText, Receipt, ShieldCheck, ClipboardList,
  Briefcase, Wallet, Clock, ChevronRight, AlertTriangle,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";

/**
 * Approvals Inbox — unified queue for everything pending approval.
 *
 * Today the CFO/manager has to check 7 different pages. This aggregates
 * all queues with count + total amount + first 5 items per type.
 */

interface ListResp { data?: any[]; total?: number }

interface QueueStat {
  count: number;
  amount: number;
  items: any[];
}

interface QueueDef {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  color: "red" | "amber" | "blue" | "purple" | "cyan";
  totalKey: string;
}

const QUEUES: QueueDef[] = [
  {
    key: "budgetApprovals",
    label: "اعتمادات تجاوز الميزانية",
    description: "طلبات تتطلب المدير المالي أو المدير العام لتجاوز سقف ميزانية حساب",
    icon: ShieldCheck,
    href: "/finance/budget-approvals",
    color: "red",
    totalKey: "requestedAmount",
  },
  {
    key: "manualJournalsDraft",
    label: "قيود يدوية بمسودة",
    description: "قيود لم تُرسَل بعد للمراجعة — جاهزة للإكمال أو الحذف",
    icon: FileText,
    href: "/finance/journal-manual",
    color: "amber",
    totalKey: "totalDebit",
  },
  {
    key: "manualJournalsPending",
    label: "قيود يدوية بانتظار المراجعة",
    description: "قيود مُرسَلة من المحاسب وتنتظر اعتماد المراجع",
    icon: FileText,
    href: "/finance/journal-manual",
    color: "amber",
    totalKey: "totalDebit",
  },
  {
    key: "expenses",
    label: "مصاريف بانتظار الاعتماد",
    description: "مصاريف معلّقة — تحتاج اعتماد قبل ترحيلها للأستاذ العام",
    icon: Receipt,
    href: "/finance/expenses?status=pending",
    color: "blue",
    totalKey: "amount",
  },
  {
    key: "purchaseRequests",
    label: "طلبات شراء بانتظار الاعتماد",
    description: "طلبات شراء مُرسَلة — تنتظر اعتماد قبل تحويلها لأمر شراء",
    icon: ClipboardList,
    href: "/finance/purchase-requests",
    color: "blue",
    totalKey: "totalAmount",
  },
  {
    key: "vouchers",
    label: "سندات صرف/قبض بانتظار الاعتماد",
    description: "سندات لم تُعتمد بعد",
    icon: Wallet,
    href: "/finance/vouchers",
    color: "purple",
    totalKey: "amount",
  },
  {
    key: "custodies",
    label: "عُهد بانتظار الاعتماد",
    description: "صرف عهدة لموظف — تتطلب اعتماد قبل الصرف",
    icon: Briefcase,
    href: "/finance/custodies",
    color: "cyan",
    totalKey: "amount",
  },
];

const COLOR_CLASSES: Record<QueueDef["color"], { border: string; bg: string; chip: string; icon: string }> = {
  red:    { border: "border-red-300",     bg: "bg-red-50/30",     chip: "bg-red-100 text-red-800",       icon: "text-red-600" },
  amber:  { border: "border-amber-300",   bg: "bg-amber-50/30",   chip: "bg-amber-100 text-amber-800",   icon: "text-amber-600" },
  blue:   { border: "border-blue-300",    bg: "bg-blue-50/30",    chip: "bg-blue-100 text-blue-800",     icon: "text-blue-600" },
  purple: { border: "border-purple-300",  bg: "bg-purple-50/30",  chip: "bg-purple-100 text-purple-800", icon: "text-purple-600" },
  cyan:   { border: "border-cyan-300",    bg: "bg-cyan-50/30",    chip: "bg-cyan-100 text-cyan-800",     icon: "text-cyan-600" },
};

function stat(data: ListResp | undefined, totalKey: string): QueueStat {
  const items = data?.data ?? [];
  const count = data?.total ?? items.length;
  const amount = items.reduce((s: number, x: any) => s + Number(x?.[totalKey] ?? 0), 0);
  return { count, amount, items: items.slice(0, 5) };
}

export default function ApprovalsInboxPage() {
  // 7 named hooks (no loops over hooks allowed)
  const q1 = useApiQuery<ListResp>(["inbox-budget"],   `/finance/budget/approval-requests?status=pending`);
  const q2 = useApiQuery<ListResp>(["inbox-jrnldraft"], `/finance/journal-manual?status=draft`);
  const q3 = useApiQuery<ListResp>(["inbox-jrnlpend"],  `/finance/journal-manual?status=pending_review`);
  const q4 = useApiQuery<ListResp>(["inbox-exp"],       `/finance/expenses?status=pending`);
  const q5 = useApiQuery<ListResp>(["inbox-pr"],        `/finance/purchase-requests?status=pending`);
  const q6 = useApiQuery<ListResp>(["inbox-vouchers"],  `/finance/vouchers?status=pending`);
  const q7 = useApiQuery<ListResp>(["inbox-custodies"], `/finance/custodies?status=pending`);
  // Cross-domain workflow instances — covers approval flows whose
  // ref tables are outside finance (HR letters, fleet, marketing).
  // GET /workflows (recent), /workflows/pending (queue), /workflows/stats (KPIs).
  const wfPending = useApiQuery<any>(["inbox-wf-pending"], `/workflows/pending`);
  const wfStats   = useApiQuery<any>(["inbox-wf-stats"],   `/workflows/stats`);
  const wfRecent  = useApiQuery<any>(["inbox-wf-recent"],  `/workflows?limit=5`);

  const loading = q1.isLoading || q2.isLoading || q3.isLoading || q4.isLoading || q5.isLoading || q6.isLoading || q7.isLoading;

  const stats = useMemo(() => {
    const m = new Map<string, QueueStat>();
    m.set("budgetApprovals",        stat(q1.data, "requestedAmount"));
    m.set("manualJournalsDraft",    stat(q2.data, "totalDebit"));
    m.set("manualJournalsPending",  stat(q3.data, "totalDebit"));
    m.set("expenses",               stat(q4.data, "amount"));
    m.set("purchaseRequests",       stat(q5.data, "totalAmount"));
    m.set("vouchers",               stat(q6.data, "amount"));
    m.set("custodies",              stat(q7.data, "amount"));
    return m;
  }, [q1.data, q2.data, q3.data, q4.data, q5.data, q6.data, q7.data]);

  if (loading) return <LoadingSpinner />;

  const totalPending = Array.from(stats.values()).reduce((s, v) => s + v.count, 0);
  const totalAmount = Array.from(stats.values()).reduce((s, v) => s + v.amount, 0);
  const queuesWithItems = QUEUES.filter((q) => (stats.get(q.key)?.count ?? 0) > 0);
  const cleanQueues = QUEUES.length - queuesWithItems.length;

  return (
    <PageShell
      title="صندوق الموافقات الموحد"
      subtitle="كل ما ينتظر اعتمادك في مكان واحد — 7 أنواع طلبات من 7 صفحات مختلفة"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "صندوق الموافقات" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/finance/expense-bulk-approvals">
              اعتماد المصاريف بالجملة
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/daily-close-checklist">
              فحص اليوم
            </Link></Button>
          <PrintButton
            entityType="report_finance_approvals_inbox"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: "صندوق الموافقات الموحد", total: queuesWithItems.length },
              items: QUEUES.map((q) => {
                const s = stats.get(q.key) ?? { count: 0, amount: 0, items: [] };
                return {
                  "نوع الطلب": q.label,
                  "العدد": s.count,
                  "إجمالي المبلغ": Number(s.amount || 0),
                };
              }),
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Inbox className="h-4 w-4" /> صندوق وارد للقرارات
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            بدل ما تفتح 7 صفحات يومياً لتفحص كل أنواع الموافقات (ميزانية، قيود يدوية،
            مصاريف، طلبات شراء، سندات، عُهد)، هذي الصفحة تجمعها في مكان واحد مع
            عدد + إجمالي مبالغ + أول 5 عناصر — مع deep-link مباشر للصفحة المعنية.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className={totalPending > 0 ? "border-red-300 bg-red-50/30" : "border-emerald-300 bg-emerald-50/30"}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Inbox className="h-3 w-3" /> إجمالي بانتظارك
            </p>
            <p className={`text-2xl font-bold font-mono mt-1 ${totalPending > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {formatNumber(totalPending)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المبالغ</p>
            <p className="text-lg font-bold font-mono mt-1">{formatCurrency(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">أنواع لها طلبات</p>
            <p className="text-2xl font-bold font-mono mt-1">{queuesWithItems.length} / {QUEUES.length}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">طوابير صفر</p>
            <p className="text-2xl font-bold font-mono mt-1 text-emerald-700">{cleanQueues}</p>
          </CardContent>
        </Card>
      </div>

      {(() => {
        const wfPendingCount = wfPending.data?.total ?? (wfPending.data?.data?.length ?? 0);
        const wfStatsObj = wfStats.data?.data ?? wfStats.data ?? {};
        const wfRecentItems: any[] = wfRecent.data?.data ?? [];
        const slaWarn = Number(wfStatsObj.slaWarning ?? 0);
        const slaBreached = Number(wfStatsObj.slaBreached ?? 0);
        const totalActive = Number(wfStatsObj.active ?? wfStatsObj.total ?? wfPendingCount);
        if (wfPendingCount === 0 && wfRecentItems.length === 0) return null;
        return (
          <Card className="mb-3 border-violet-200 bg-violet-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                <Briefcase className="h-4 w-4 text-violet-600" />
                سير العمل الشامل
                <Badge className="text-[10px] bg-violet-100 text-violet-800">
                  {formatNumber(wfPendingCount)} بانتظار قرار
                </Badge>
                {totalActive > 0 && (
                  <span className="text-xs text-muted-foreground">
                    إجمالي نشط: {formatNumber(totalActive)}
                  </span>
                )}
                {(slaWarn > 0 || slaBreached > 0) && (
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-300">
                    <AlertTriangle className="h-3 w-3 me-1" />
                    {slaBreached > 0 ? `${slaBreached} متجاوز SLA` : `${slaWarn} تحذير SLA`}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                طلبات معتمدة عبر سير عمل قابل للتخصيص — تشمل خطابات HR والمتطلبات
                المتداخلة (cross-domain).
              </p>
            </CardHeader>
            {wfRecentItems.length > 0 && (
              <CardContent className="p-3 pt-0">
                <div className="space-y-1">
                  {wfRecentItems.slice(0, 5).map((w: any) => (
                    <div key={w.id} className="flex items-center justify-between text-xs p-2 bg-white/80 rounded border">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[10px] text-muted-foreground">#{w.id}</span>
                        <span className="truncate max-w-md">
                          {w.title ?? w.definitionName ?? w.refTable ?? "—"}
                        </span>
                        {w.slaStatus && w.slaStatus !== "on_track" && (
                          <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-300">
                            {w.slaStatus === "warning" ? "تحذير" : "تجاوز SLA"}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ms-2">
                        {w.currentStepName ?? `خطوة ${w.currentStepOrder ?? "?"}`}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 text-end">
                  <Button asChild variant="outline" size="sm" className="h-7 text-[11px]"><Link href="/action-center">
                      اتخاذ قرار <ChevronRight className="h-3 w-3 ms-1" />
                    </Link></Button>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })()}

      {totalPending === 0 ? (
        <Card className="text-center py-12 border-emerald-300 bg-emerald-50/30">
          <CardContent>
            <Inbox className="h-12 w-12 mx-auto mb-3 text-emerald-600" />
            <p className="text-base font-semibold text-emerald-700 mb-1">صندوقك فاضي 🎉</p>
            <p className="text-xs text-muted-foreground">ما في طلبات تنتظر قرارك من أي مصدر</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {QUEUES.map((q) => {
            const s = stats.get(q.key) ?? { count: 0, amount: 0, items: [] };
            const colors = COLOR_CLASSES[q.color];
            const Icon = q.icon;
            const isEmpty = s.count === 0;
            return (
              <Card key={q.key} className={isEmpty ? "opacity-60" : `${colors.border} ${colors.bg}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <Icon className={`h-5 w-5 mt-0.5 ${isEmpty ? "text-muted-foreground" : colors.icon}`} />
                      <div className="flex-1">
                        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                          {q.label}
                          {!isEmpty && (
                            <>
                              <Badge className={`text-[10px] ${colors.chip}`}>
                                {formatNumber(s.count)} طلب
                              </Badge>
                              <span className="text-xs font-mono text-muted-foreground">
                                إجمالي {formatCurrency(s.amount)}
                              </span>
                            </>
                          )}
                          {isEmpty && <Badge variant="outline" className="text-[10px]">صفر</Badge>}
                        </CardTitle>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{q.description}</p>
                      </div>
                    </div>
                    <Button asChild variant={isEmpty ? "ghost" : "outline"} size="sm" className="h-8 whitespace-nowrap shrink-0"><Link href={q.href}>
                        {isEmpty ? "فتح" : "اتخاذ قرار"}
                        <ChevronRight className="h-3 w-3 ms-1" />
                      </Link></Button>
                  </div>
                </CardHeader>

                {!isEmpty && s.items.length > 0 && (
                  <CardContent className="p-3 pt-0">
                    <div className="space-y-1">
                      {s.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-xs p-2 bg-white/80 rounded border">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[10px] text-muted-foreground">#{item.id ?? item.ref ?? "?"}</span>
                            <span className="truncate max-w-md">
                              {item.description ?? item.title ?? item.accountName ?? item.supplierName ?? item.clientName ?? "—"}
                            </span>
                            {item.createdAt && (
                              <Badge variant="outline" className="text-[9px] inline-flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {formatDateAr(item.createdAt)}
                              </Badge>
                            )}
                          </div>
                          <span className="font-mono text-xs font-semibold whitespace-nowrap ms-2">
                            {formatCurrency(Number(item?.[q.totalKey] ?? 0))}
                          </span>
                        </div>
                      ))}
                      {s.count > 5 && (
                        <p className="text-[10px] text-muted-foreground text-center pt-1">
                          + {s.count - 5} طلبات إضافية
                        </p>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-4 bg-muted/30">
        <CardContent className="p-3 text-xs text-muted-foreground flex items-start gap-2">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            صندوق الموافقات يجمع كل ما ينتظر قراراً <strong>على مستوى الشركة</strong> — مرشّح
            بـ RBAC حسب صلاحيتك. الفقرة "اتخاذ قرار" تنقلك للصفحة الأصلية حيث الأزرار
            (اعتماد/رفض/طلب تعديل) متاحة.
          </span>
        </CardContent>
      </Card>
    </PageShell>
  );
}
